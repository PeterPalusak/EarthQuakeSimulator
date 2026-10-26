import type { ImpulseJoint, RigidBody, World } from '@dimforge/rapier3d-compat'
import {
  BUILDING_SPECS,
  FLOOR_HEIGHT,
  floorCentreY,
  type BuildingSpec,
  type BuildingTypeId,
} from '../sim/buildingSpecs'
import { GROUND_HALF_EXTENT } from '../sim/placement'
import { getRapier } from './rapier'

/**
 * The physics world, built imperatively against Rapier directly.
 *
 * One implementation serves both the rendered app and the headless Node tests, which is the
 * only way the physics regression tests in plan/03, /05, /06 and /07 can assert on the same
 * thing the user sees.
 *
 * ## How a building is modelled
 *
 * Each floor is a dynamic rigid body with its rotations locked, so a building is a stack of
 * translating masses — a shear building, the standard engineering idealisation. Consecutive
 * floors (and floor 0 to the ground) are tied by two joints:
 *
 *   - a **generic joint** locking LinY and all three angular axes, so floors stay stacked and
 *     axis-aligned, and the building is a cantilever anchored to the ground rather than a
 *     free-floating pile;
 *   - a **zero-rest-length spring joint** across the same anchor pair, giving a linear lateral
 *     restoring force of `storeyStiffness` N/m, solved implicitly by Rapier.
 *
 * plan/03-physics.md proposes a spherical joint plus an angular motor spring. That API does
 * not exist in the installed Rapier 0.14: `configureMotorPosition` is declared only on
 * `UnitImpulseJoint` (revolute/prismatic), not on `SphericalImpulseJoint`. The plan's own
 * fallback — a generic joint with springs on the angular axes — is unavailable for the same
 * reason. The shear storey above is the same physics expressed in translation instead of
 * rotation: `scripts/spike-joint.ts` measures its free-vibration period as 0.1000 s against an
 * analytic 0.1000 s, and `QuakeWorld.test.ts` pins the periods of all five types.
 *
 * Contacts are disabled between jointed neighbours — they touch face to face, and sliding
 * friction between them would otherwise dissipate the sway as a mystery damping term. Removing
 * a joint during a collapse restores both the contacts and the body's free rotation, so debris
 * tumbles and piles up for real.
 */

export const FIXED_TIMESTEP = 1 / 120
/** Never simulate more than this much wall time in one frame — a tab that was backgrounded
 *  would otherwise try to catch up thousands of steps at once and lock the page up. */
const MAX_STEPS_PER_FRAME = 8

export interface FloorState {
  x: number
  y: number
  z: number
  /** quaternion */
  qx: number
  qy: number
  qz: number
  qw: number
}

export interface BuildingInstance {
  instanceId: string
  type: BuildingTypeId
  spec: BuildingSpec
  /** [x, z] ground position of the footprint centre */
  origin: [number, number]
  bodies: RigidBody[]
  /** `joints[i]` ties floor i to whatever is below it — floor i-1, or the ground when i is 0. */
  joints: (StoreyJoint | null)[]
  /** Peak interstorey drift ratio seen so far, per storey, index matching `joints`. */
  peakDrift: number[]
  collapsed: boolean
}

interface StoreyJoint {
  guide: ImpulseJoint
  spring: ImpulseJoint
}

/** Lock vertical translation and all three rotations; leave X and Z free. The numeric
 *  values are Rapier's `JointAxesMask`, inlined so this module needs no value import of the
 *  dynamically loaded namespace. */
const AXES_MASK = 2 /* LinY */ | 8 /* AngX */ | 16 /* AngY */ | 32 /* AngZ */

export interface QuakeWorldOptions {
  /** Rapier's default of 4 is not enough for a 12-floor stack: it visibly jitters and sinks. */
  solverIterations?: number
  gravity?: number
}

export class QuakeWorld {
  readonly world: World
  readonly ground: RigidBody
  private readonly buildings = new Map<string, BuildingInstance>()
  private accumulator = 0
  /** Joint removals are queued and applied between steps — mutating the joint set during a
   *  solver step can crash Rapier or corrupt the world. */
  private pendingBreaks: { building: BuildingInstance; storey: number }[] = []
  private simulatedTime = 0
  private readonly r = getRapier()

  constructor({ solverIterations = 8, gravity = -9.81 }: QuakeWorldOptions = {}) {
    this.world = new this.r.World({ x: 0, y: gravity, z: 0 })
    this.world.timestep = FIXED_TIMESTEP
    this.world.numSolverIterations = solverIterations

    // Kinematic from the outset: it does not move until phase 5 drives it, and a kinematic
    // body is infinitely massive to the solver, so buildings cannot push the ground around.
    this.ground = this.world.createRigidBody(
      this.r.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0),
    )
    // Real thickness, not a zero-thickness plane — thin colliders let fast debris tunnel.
    this.world.createCollider(
      this.r.ColliderDesc.cuboid(GROUND_HALF_EXTENT, 0.5, GROUND_HALF_EXTENT)
        .setTranslation(0, -0.5, 0)
        .setFriction(0.8)
        .setRestitution(0.05),
      this.ground,
    )
  }

  get elapsed() {
    return this.simulatedTime
  }

  list(): BuildingInstance[] {
    return [...this.buildings.values()]
  }

  get(instanceId: string): BuildingInstance | undefined {
    return this.buildings.get(instanceId)
  }

  addBuilding(
    instanceId: string,
    type: BuildingTypeId,
    origin: [number, number],
  ): BuildingInstance {
    const spec = BUILDING_SPECS[type]
    const [w, d] = spec.footprint
    const [ox, oz] = origin

    const bodies: RigidBody[] = []
    for (let i = 0; i < spec.floors; i++) {
      const body = this.world.createRigidBody(
        this.r.RigidBodyDesc.dynamic()
          .setTranslation(ox, floorCentreY(i), oz)
          .lockRotations()
          .setCcdEnabled(true) // detached floors must not tunnel through the ground
          // Sway amplitudes are millimetres, which is below Rapier's sleep threshold: a
          // sleeping floor freezes mid-oscillation and the building looks dead.
          .setCanSleep(false)
          // An intact floor carries no weight. A zero-rest-length spring is compliant in
          // every direction, so the stacked dead load would sag the 12-floor block by ~0.6 m
          // and the floors would visibly interpenetrate. The storey springs model lateral
          // stiffness only; vertical equilibrium is the generic joint's LinY lock.
          // `applyPendingBreaks` restores gravity the moment a storey fails, so debris falls.
          .setGravityScale(0)
          .setLinearDamping(0.05)
          .setAngularDamping(0.3),
      )
      this.world.createCollider(
        this.r.ColliderDesc.cuboid(w / 2, FLOOR_HEIGHT / 2, d / 2)
          .setMass(spec.floorMass) // explicit mass, so the spec means what it says
          .setFriction(0.8)
          .setRestitution(0.03),
        body,
      )
      bodies.push(body)
    }

    const joints: (StoreyJoint | null)[] = []
    for (let i = 0; i < spec.floors; i++) {
      const lower = i === 0 ? this.ground : bodies[i - 1]
      // Ground anchors are in ground-local space, so they carry the footprint position;
      // floor anchors are relative to the floor's own centre.
      const a1 = i === 0 ? { x: ox, y: 0, z: oz } : { x: 0, y: FLOOR_HEIGHT / 2, z: 0 }
      const a2 = { x: 0, y: -FLOOR_HEIGHT / 2, z: 0 }

      const guide = this.world.createImpulseJoint(
        this.r.JointData.generic(a1, a2, { x: 1, y: 0, z: 0 }, AXES_MASK),
        lower,
        bodies[i],
        true,
      )
      guide.setContactsEnabled(false)

      const spring = this.world.createImpulseJoint(
        this.r.JointData.spring(0, spec.storeyStiffness, spec.storeyDamping, a1, a2),
        lower,
        bodies[i],
        true,
      )
      // Both joints must disable contacts: Rapier keeps the pair colliding if any joint
      // between them allows it, and sliding friction across the floor interface would then
      // eat the sway and leave the building stuck at an offset.
      spring.setContactsEnabled(false)
      joints.push({ guide, spring })
    }

    const building: BuildingInstance = {
      instanceId,
      type,
      spec,
      origin,
      bodies,
      joints,
      peakDrift: new Array(spec.floors).fill(0),
      collapsed: false,
    }
    this.buildings.set(instanceId, building)
    return building
  }

  removeBuilding(instanceId: string) {
    const b = this.buildings.get(instanceId)
    if (!b) return
    for (const j of b.joints) {
      if (!j) continue
      this.world.removeImpulseJoint(j.guide, false)
      this.world.removeImpulseJoint(j.spring, false)
    }
    for (const body of b.bodies) this.world.removeRigidBody(body)
    this.buildings.delete(instanceId)
    this.pendingBreaks = this.pendingBreaks.filter((p) => p.building !== b)
  }

  clear() {
    for (const id of [...this.buildings.keys()]) this.removeBuilding(id)
  }

  /** Drives the ground. Kinematic *next* translation, so Rapier derives the implied velocity
   *  and transfers momentum — `setTranslation` would teleport and transfer nothing. */
  setGroundTranslation(x: number, y: number, z: number) {
    this.ground.setNextKinematicTranslation({ x, y, z })
  }

  wakeAll() {
    for (const b of this.buildings.values()) for (const body of b.bodies) body.wakeUp()
  }

  /**
   * Advance by `delta` seconds of wall time using a fixed-step accumulator. A non-fixed step
   * makes the result differ between a 60 Hz phone and a 144 Hz monitor, which would make every
   * physics test meaningless.
   *
   * @returns the number of fixed steps actually taken.
   */
  step(delta: number): number {
    this.accumulator += Math.min(delta, MAX_STEPS_PER_FRAME * FIXED_TIMESTEP)
    let steps = 0
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      this.applyPendingBreaks()
      this.world.step()
      this.simulatedTime += FIXED_TIMESTEP
      // Sample drift every step: peaks often fall between rendered frames, and missing them
      // under-reports damage.
      this.sampleDrift()
      this.accumulator -= FIXED_TIMESTEP
      steps++
    }
    return steps
  }

  /** One fixed step, for the headless tests and the calibration script. */
  stepOnce() {
    this.applyPendingBreaks()
    this.world.step()
    this.simulatedTime += FIXED_TIMESTEP
    this.sampleDrift()
  }

  /** Horizontal displacement of a floor from where it was placed, relative to the ground. */
  floorDrift(b: BuildingInstance, i: number): [number, number] {
    const g = this.ground.translation()
    const t = b.bodies[i].translation()
    return [t.x - g.x - b.origin[0], t.z - g.z - b.origin[1]]
  }

  /** Interstorey drift ratio of storey `i`: lateral offset from the floor below / floor height. */
  storeyDrift(b: BuildingInstance, i: number): number {
    const upper = b.bodies[i].translation()
    const lower =
      i === 0
        ? { x: this.ground.translation().x + b.origin[0], z: this.ground.translation().z + b.origin[1] }
        : b.bodies[i - 1].translation()
    return Math.hypot(upper.x - lower.x, upper.z - lower.z) / FLOOR_HEIGHT
  }

  private sampleDrift() {
    for (const b of this.buildings.values()) {
      for (let i = 0; i < b.bodies.length; i++) {
        if (!b.joints[i]) continue
        const drift = this.storeyDrift(b, i)
        if (drift > b.peakDrift[i]) b.peakDrift[i] = drift
      }
    }
  }

  /** Queue a storey failure. Applied between steps — see `pendingBreaks`. */
  breakStorey(building: BuildingInstance, storey: number) {
    if (!building.joints[storey]) return
    this.pendingBreaks.push({ building, storey })
  }

  private applyPendingBreaks() {
    if (this.pendingBreaks.length === 0) return
    for (const { building, storey } of this.pendingBreaks) {
      const joint = building.joints[storey]
      if (!joint) continue
      this.world.removeImpulseJoint(joint.guide, true)
      this.world.removeImpulseJoint(joint.spring, true)
      building.joints[storey] = null
      // Everything from here up is now free debris: let it rotate and collide again.
      for (let i = storey; i < building.bodies.length; i++) {
        building.bodies[i].setEnabledRotations(true, true, true, true)
        building.bodies[i].setGravityScale(1, true)
        building.bodies[i].setLinearDamping(0.1)
      }
      building.collapsed = true
    }
    this.pendingBreaks = []
  }

  readFloor(b: BuildingInstance, i: number, out: FloorState): FloorState {
    const t = b.bodies[i].translation()
    const r = b.bodies[i].rotation()
    out.x = t.x
    out.y = t.y
    out.z = t.z
    out.qx = r.x
    out.qy = r.y
    out.qz = r.z
    out.qw = r.w
    return out
  }

  dispose() {
    this.clear()
    this.world.free()
  }
}
