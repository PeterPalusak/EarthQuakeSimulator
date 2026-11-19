import type { ImpulseJoint, RigidBody, World } from '@dimforge/rapier3d-compat'
import { BUILDING_SPECS, type BuildingSpec, type BuildingTypeId } from '../sim/buildingSpecs'
import { MOTION_GAIN } from '../sim/groundMotion'
import {
  GROUND,
  buildStructure,
  linkAxis,
  type Quarter,
  type StructureLink,
  type StructureNode,
} from '../sim/structure'
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
  /** Quarter turns about Y applied at placement. */
  rotation: Quarter
  /** The generated geometry. `bodies[i]` is `nodes[i]`; `joints[i]` is `links[i]`. */
  nodes: StructureNode[]
  links: StructureLink[]
  bodies: RigidBody[]
  /** `joints[i]` realises `links[i]`; null once that link has failed. */
  joints: (StoreyJoint | null)[]
  /** Peak drift ratio seen so far, per link, index matching `joints`. */
  peakDrift: number[]
  /** Links overloaded by a failure next to them, and so closer to failing themselves. */
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
    rotation: Quarter = 0,
  ): BuildingInstance {
    const spec = BUILDING_SPECS[type]
    const [ox, oz] = origin
    const { nodes, links } = buildStructure(spec, rotation)

    const bodies: RigidBody[] = nodes.map((n) =>
      this.world.createRigidBody(
        this.r.RigidBodyDesc.dynamic()
          .setTranslation(ox + n.offset[0], n.offset[1], oz + n.offset[2])
          .lockRotations()
          .setCcdEnabled(true) // detached pieces must not tunnel through the ground
          // Sway amplitudes are millimetres, which is below Rapier's sleep threshold: a
          // sleeping body freezes mid-oscillation and the structure looks dead.
          .setCanSleep(false)
          // An intact piece carries no weight. A zero-rest-length spring is compliant in
          // every direction, so the stacked dead load would sag the 12-floor block by ~0.6 m
          // and the floors would visibly interpenetrate. The springs model lateral stiffness
          // only; `applyPendingBreaks` restores gravity the moment a link fails, so the
          // debris falls.
          .setGravityScale(0)
          .setLinearDamping(0.05)
          .setAngularDamping(0.3),
      ),
    )

    nodes.forEach((n, i) => {
      this.world.createCollider(
        this.r.ColliderDesc.cuboid(n.half[0], n.half[1], n.half[2])
          .setMass(n.mass) // explicit mass, so the spec means what it says
          .setFriction(0.8)
          .setRestitution(0.03),
        bodies[i],
      )
    })

    const joints: (StoreyJoint | null)[] = links.map((link) => {
      const lower = link.from === GROUND ? this.ground : bodies[link.from]
      // A ground anchor lives in ground-local space and therefore carries the placement
      // position; a node anchor is relative to that node's own centre.
      const a1 =
        link.from === GROUND
          ? { x: ox + link.anchorFrom[0], y: link.anchorFrom[1], z: oz + link.anchorFrom[2] }
          : { x: link.anchorFrom[0], y: link.anchorFrom[1], z: link.anchorFrom[2] }
      const a2 = { x: link.anchorTo[0], y: link.anchorTo[1], z: link.anchorTo[2] }

      // Rest length is the distance between the two anchors as placed. Members whose anchors
      // already meet — every floor, pier and deck joint — give zero, which is the
      // vector-constraining spring the structures were built around. A cable stay spans tens
      // of metres, and a zero-rest spring across that gap simply hauls the deck up to the
      // pylon head: at this length the joint has to constrain distance, not position, which
      // is also what a cable physically does.
      // `rest` is measured from the ground anchor point itself, so that anchor contributes
      // nothing here — counting it twice puts the whole structure's placement offset into
      // the rest length and launches it sideways.
      const af = link.from === GROUND ? [0, 0, 0] : link.anchorFrom
      const restLength = Math.hypot(
        link.rest[0] + link.anchorTo[0] - af[0],
        link.rest[1] + link.anchorTo[1] - af[1],
        link.rest[2] + link.anchorTo[2] - af[2],
      )

      const spring = this.world.createImpulseJoint(
        // Damping is 0 here and applied explicitly in `applyStoreyDamping` instead: the
        // spring joint's own damping term acts only along its motor axis (local X), so a
        // structure shaken along Z would ring essentially forever while X settled normally.
        this.r.JointData.spring(restLength, link.stiffness, 0, a1, a2),
        lower,
        bodies[link.to],
        true,
      )
      // Jointed neighbours touch face to face; sliding friction across that interface would
      // eat the sway and leave the structure stuck at an offset rather than returning upright.
      spring.setContactsEnabled(false)
      return { spring }
    })

    const building: BuildingInstance = {
      instanceId,
      type,
      spec,
      origin,
      rotation,
      nodes,
      links,
      bodies,
      joints,
      peakDrift: new Array(links.length).fill(0),
      weakened: new Array(links.length).fill(false),
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

  /** World position of a link's lower end — a node centre, or a point on the ground. */
  private linkFromPoint(b: BuildingInstance, link: StructureLink) {
    if (link.from !== GROUND) return b.bodies[link.from].translation()
    const g = this.ground.translation()
    return {
      x: g.x + b.origin[0] + link.anchorFrom[0],
      y: g.y + link.anchorFrom[1],
      z: g.z + b.origin[1] + link.anchorFrom[2],
    }
  }

  /**
   * Drift ratio across link `i`: how far its two ends have moved relative to each other
   * *perpendicular to the link's own axis*, over the link's span.
   *
   * For a vertical link that is horizontal offset over storey height — the interstorey drift
   * ratio, exactly as before. For a horizontal deck link it is sag plus transverse sway, which
   * is the right damage measure for a span. One formula, because the thing that matters is
   * always deformation across the member rather than along it.
   */
  storeyDrift(b: BuildingInstance, i: number): number {
    const link = b.links[i]
    const from = this.linkFromPoint(b, link)
    const to = b.bodies[link.to].translation()

    // Departure from the rest separation.
    const dx = to.x - from.x - link.rest[0]
    const dy = to.y - from.y - link.rest[1]
    const dz = to.z - from.z - link.rest[2]

    // Strip the component along the axis; what is left is the shear.
    const [ax, ay, az] = linkAxis(link)
    const along = dx * ax + dy * ay + dz * az
    const shear = Math.hypot(dx - along * ax, dy - along * ay, dz - along * az)

    // The world is shaken at MOTION_GAIN times life size so the motion can be seen. Dividing
    // it back out here is what keeps `driftCapacity` a real engineering number and keeps the
    // damage ladder — medium is survivable, M7 is not — meaning what it meant before.
    return shear / link.span / MOTION_GAIN
  }

  /**
   * Horizontal shear across link `i`, in metres, with the display gain divided out.
   *
   * Same quantity `storeyDrift` reduces to a scalar, but keeping its direction — the renderer
   * needs it to lean a floor the way it is actually being pushed.
   */
  linkShear(b: BuildingInstance, i: number): [number, number] {
    const link = b.links[i]
    const from = this.linkFromPoint(b, link)
    const to = b.bodies[link.to].translation()
    return [
      (to.x - from.x - link.rest[0]) / MOTION_GAIN,
      (to.z - from.z - link.rest[2]) / MOTION_GAIN,
    ]
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
      for (let i = 0; i < b.links.length; i++) {
        if (!b.joints[i]) continue
        const link = b.links[i]
        const upper = b.bodies[link.to]
        const grounded = link.from === GROUND
        const lower = grounded ? this.ground : b.bodies[link.from]

        // Explicit damping overshoots — and blows the solver up — as `c * dt / m` approaches
        // 1, where the damper reverses the relative velocity outright each step. Clamp to
        // half that.
        //
        // The mass that matters is the *lighter* end, not the heavier: an equal and opposite
        // force pair destabilises the small body first. Using the heavier end is what let the
        // TV tower's 73 t observation ring sit on a 17 t shaft segment with a damper the
        // shaft could not absorb, and crash inside the WASM step.
        const effectiveMass = grounded ? upper.mass() : Math.min(upper.mass(), lower.mass())
        const c = Math.min(link.damping, effectiveMass / (2 * FIXED_TIMESTEP))
        const vu = upper.linvel()
        const vl = lower.linvel()
        const fx = -c * (vu.x - vl.x)
        const fy = -c * (vu.y - vl.y)
        const fz = -c * (vu.z - vl.z)
        upper.addForce({ x: fx, y: fy, z: fz }, false)
        // The ground is kinematic — pushing back on it would do nothing anyway.
        if (!grounded) lower.addForce({ x: -fx, y: -fy, z: -fz }, false)
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
      for (let i = 0; i < b.links.length; i++) {
        if (!b.joints[i]) continue
        const drift = this.storeyDrift(b, i)
        if (drift > b.peakDrift[i]) b.peakDrift[i] = drift
        const capacity = b.weakened[i]
          ? b.links[i].capacity * WEAKENED_CAPACITY
          : b.links[i].capacity
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

  /**
   * Which nodes are still held up, i.e. still reachable from the ground through intact links.
   *
   * This replaces the old "everything above the failed storey falls". For a vertical stack the
   * two are identical, but for a bridge they are not: a deck segment only falls when it has
   * lost *every* path back to a pier, and "above" means nothing on a horizontal structure.
   */
  private supportedNodes(b: BuildingInstance): boolean[] {
    const supported = new Array<boolean>(b.nodes.length).fill(false)
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < b.links.length; i++) {
        if (!b.joints[i]) continue // failed link carries nothing
        const { from, to } = b.links[i]
        const fromHeld = from === GROUND || supported[from]
        const toHeld = supported[to]
        // A link conducts support both ways: a deck hanging off a pylon holds up the segment
        // beyond it just as the pylon holds up the deck.
        if (fromHeld && !toHeld) {
          supported[to] = true
          grew = true
        } else if (toHeld && from !== GROUND && !supported[from]) {
          supported[from] = true
          grew = true
        }
      }
    }
    return supported
  }

  private applyPendingBreaks() {
    if (this.pendingBreaks.length === 0) return
    const touched = new Set<BuildingInstance>()

    for (const { building, storey } of this.pendingBreaks) {
      const joint = building.joints[storey]
      if (!joint) continue
      this.world.removeImpulseJoint(joint.spring, true)
      building.joints[storey] = null
      building.collapsed = true
      touched.add(building)

      const link = building.links[storey]

      // The failed member has lost whatever was holding it up, so the mass above drops
      // through it. Flattening its collider is what lets that happen: without it the pieces
      // above simply rest on the pieces below at their original height and a "collapse"
      // leaves the structure standing at full height, which reads as a bug.
      const collider = building.bodies[link.to].collider(0)
      if (collider) {
        const half = collider.halfExtents()
        if (half) collider.setHalfExtents({ x: half.x, y: half.y * 0.3, z: half.z })
      }

      // Whatever was carrying this member now carries the load it was taking. Real collapses
      // propagate toward the support for exactly this reason — it is what makes a pancake
      // rather than a clean decapitation. Halving capacity makes those links likely to go next.
      for (let j = 0; j < building.links.length; j++) {
        if (j === storey || !building.joints[j]) continue
        if (building.links[j].to === link.from) building.weakened[j] = true
      }
    }
    this.pendingBreaks = []

    // Anything that has lost its path to the ground is now free debris: let it rotate, fall
    // and collide again.
    for (const b of touched) {
      const supported = this.supportedNodes(b)
      for (let i = 0; i < b.bodies.length; i++) {
        if (supported[i]) continue
        b.bodies[i].setEnabledRotations(true, true, true, true)
        b.bodies[i].setGravityScale(1, true)
        b.bodies[i].setLinearDamping(0.1)
      }
    }
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
