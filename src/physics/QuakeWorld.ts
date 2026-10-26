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
 * floors, and floor 0 to the ground, are tied by a single **zero-rest-length spring joint**
 * between the floor interfaces. That gives an isotropic linear restoring force of
 * `storeyStiffness` N/m against relative displacement in any direction, solved implicitly by
 * Rapier so it stays stable at the stiffnesses a 0.1 s period demands. Joining floor 0 to the
 * ground is what makes the building a cantilever rather than a free-floating pile.
 *
 * plan/03-physics.md proposes a spherical joint plus an angular motor spring. That API does
 * not exist in the installed Rapier 0.14: `configureMotorPosition` is declared only on
 * `UnitImpulseJoint` (revolute/prismatic), not on `SphericalImpulseJoint`. The plan's own
 * fallback — a generic joint with springs on the angular axes — is unavailable for the same
 * reason. The shear storey above is the same physics expressed in translation instead of
 * rotation: `scripts/spike-joint.ts` measures its free-vibration period as 0.1000 s against an
 * analytic 0.1000 s, and `QuakeWorld.test.ts` pins the periods of all five types.
 *
 * A generic joint was tried alongside the spring to lock the vertical axis rigidly, and had to
 * be abandoned: in these bindings `JointData.generic`'s `axesMask` does not lock the axes it
 * names. Passing LinY|AngX|AngY|AngZ with an X axis locks Z and leaves Y free, and the locked
 * axis rotates with the `axis` argument. The visible symptom was a building that swayed along
 * X and was rigid along Z. `setGravityScale(0)` on intact floors removes the only load the
 * spring's vertical compliance would otherwise sag under, so the guide joint is not needed.
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
  /** Storeys overloaded by a failure above them, and so closer to failing themselves. */
  weakened: boolean[]
  collapsed: boolean
}

/** How much of its capacity a storey retains once the floors above have fallen onto it. */
const WEAKENED_CAPACITY = 0.5

interface StoreyJoint {
  spring: ImpulseJoint
}

export interface QuakeWorldOptions {
  /** Rapier's default of 4 is not enough for a 12-floor stack: it visibly jitters and sinks. */
  solverIterations?: number
  gravity?: number
  /** Let storeys fail when they exceed their drift capacity. On by default. */
  collapse?: boolean
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

  /**
   * Called once per *fixed* step, before the step runs. This is where the ground motion is
   * applied: driving it per rendered frame instead would stair-step the 120 Hz simulation at
   * whatever the display happens to run at.
   */
  onBeforeStep: ((fixedDt: number) => void) | null = null

  /** Whether exceeding `driftCapacity` tears a storey out. Off in the period-calibration
   *  tests, where a building is deliberately pushed hard and must survive to be measured. */
  collapseEnabled: boolean

  constructor({ solverIterations = 8, gravity = -9.81, collapse = true }: QuakeWorldOptions = {}) {
    this.collapseEnabled = collapse
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

      const spring = this.world.createImpulseJoint(
        // Damping is 0 here and applied explicitly in `applyStoreyDamping` instead: the
        // spring joint's own damping term acts only along its motor axis (local X), so a
        // building shaken along Z would ring essentially forever while X settled normally.
        this.r.JointData.spring(0, spec.storeyStiffness, 0, a1, a2),
        lower,
        bodies[i],
        true,
      )
      // Jointed neighbours touch face to face; sliding friction across that interface would
      // eat the sway and leave the building stuck at an offset rather than returning upright.
      spring.setContactsEnabled(false)
      joints.push({ spring })
    }

    const building: BuildingInstance = {
      instanceId,
      type,
      spec,
      origin,
      bodies,
      joints,
      peakDrift: new Array(spec.floors).fill(0),
      weakened: new Array(spec.floors).fill(false),
      collapsed: false,
    }
    this.buildings.set(instanceId, building)
    return building
  }

  removeBuilding(instanceId: string) {
    const b = this.buildings.get(instanceId)
    if (!b) return
    for (const j of b.joints) {
      if (j) this.world.removeImpulseJoint(j.spring, false)
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
      this.onBeforeStep?.(FIXED_TIMESTEP)
      this.resetForces()
      this.applyStoreyDamping()
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
    this.onBeforeStep?.(FIXED_TIMESTEP)
    this.resetForces()
    this.applyStoreyDamping()
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

  /**
   * Viscous damping across every intact storey, applied as an equal and opposite force pair
   * proportional to the relative velocity of the two floors.
   *
   * Explicit integration is safe for a damper in a way it is not for a stiff spring: the
   * stability limit is `c * dt / m < 2`, and the worst case here is about 0.05.
   */
  private applyStoreyDamping() {
    for (const b of this.buildings.values()) {
      // Explicit damping overshoots — and can blow the solver up — once `c * dt / m` passes
      // ~1. Capping it there turns a bad coefficient into a merely over-damped building
      // rather than a crash inside the WASM step.
      const cMax = b.spec.floorMass / FIXED_TIMESTEP
      const c = Math.min(b.spec.storeyDamping, cMax)
      for (let i = 0; i < b.bodies.length; i++) {
        if (!b.joints[i]) continue
        const upper = b.bodies[i]
        const lower = i === 0 ? this.ground : b.bodies[i - 1]
        const vu = upper.linvel()
        const vl = lower.linvel()
        const fx = -c * (vu.x - vl.x)
        const fy = -c * (vu.y - vl.y)
        const fz = -c * (vu.z - vl.z)
        upper.addForce({ x: fx, y: fy, z: fz }, false)
        // The ground is kinematic — pushing back on it would do nothing anyway.
        if (i > 0) lower.addForce({ x: -fx, y: -fy, z: -fz }, false)
      }
    }
  }

  /** Rapier's force accumulator persists across steps until reset, so clear it every step. */
  private resetForces() {
    for (const b of this.buildings.values()) {
      for (const body of b.bodies) body.resetForces(false)
    }
  }

  private sampleDrift() {
    for (const b of this.buildings.values()) {
      for (let i = 0; i < b.bodies.length; i++) {
        if (!b.joints[i]) continue
        const drift = this.storeyDrift(b, i)
        if (drift > b.peakDrift[i]) b.peakDrift[i] = drift
        const capacity = b.weakened[i]
          ? b.spec.driftCapacity * WEAKENED_CAPACITY
          : b.spec.driftCapacity
        if (this.collapseEnabled && drift > capacity) this.breakStorey(b, i)
      }
    }
  }

  /** Queue a storey failure. Applied between steps — see `pendingBreaks`. */
  breakStorey(building: BuildingInstance, storey: number) {
    if (!building.joints[storey]) return
    if (this.pendingBreaks.some((p) => p.building === building && p.storey === storey)) return
    this.pendingBreaks.push({ building, storey })
  }

  private applyPendingBreaks() {
    if (this.pendingBreaks.length === 0) return
    for (const { building, storey } of this.pendingBreaks) {
      const joint = building.joints[storey]
      if (!joint) continue
      this.world.removeImpulseJoint(joint.spring, true)
      building.joints[storey] = null
      // Everything from here up is now free debris: let it rotate, fall and collide again.
      for (let i = storey; i < building.bodies.length; i++) {
        building.bodies[i].setEnabledRotations(true, true, true, true)
        building.bodies[i].setGravityScale(1, true)
        building.bodies[i].setLinearDamping(0.1)
      }
      // The storey below now carries the falling mass above it. Real collapses propagate
      // downward for exactly this reason — it is what makes a pancake collapse rather than a
      // clean decapitation. Halving its capacity makes it much more likely to go next.
      if (storey > 0) building.weakened[storey - 1] = true
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
