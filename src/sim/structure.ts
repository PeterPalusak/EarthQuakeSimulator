import { FLOOR_HEIGHT, floorCentreY, type BuildingSpec } from './buildingSpecs'

/**
 * A structure as nodes and links, rather than as a stack of floors.
 *
 * Every structure in the app used to be a vertical stack: `QuakeWorld` looped `spec.floors`,
 * placed body *i* at `floorCentreY(i)` and spring-jointed it to body *i-1* with anchors fixed
 * at `(0, ±FLOOR_HEIGHT/2, 0)`. That cannot express a road, which is a horizontal chain, or a
 * bridge, which is a deck on piers with unsupported spans in between.
 *
 * So a structure is now a little graph: boxes (`nodes`) tied together by springs (`links`),
 * with `GROUND` standing in for the world. A building is a vertical chain of them, a road a
 * horizontal one, a bridge a chain with piers hanging off it. The physics layer no longer knows
 * or cares which it is building.
 *
 * Pure: no Three.js, no Rapier, no DOM. The geometry is therefore testable on its own, which
 * matters because the stack generator has to keep reproducing the old layout *exactly* or every
 * calibrated period in `buildingSpecs.ts` silently stops being true.
 */

/** Stands in for the world in `StructureLink.from`. */
export const GROUND = -1

export type Vec3 = [number, number, number]

export interface StructureNode {
  /** Centre offset from the placement origin, metres, in the structure's own frame. */
  offset: Vec3
  /** Half-extents of the box collider. */
  half: Vec3
  mass: number
  /** Which part this is, for rendering and for the damage readout. */
  part: StructurePart
}

export type StructurePart = 'floor' | 'deck' | 'pier' | 'pylon' | 'mast' | 'pod'

export interface StructureLink {
  /** Node index, or `GROUND`. */
  from: number
  to: number
  /** Anchor in `from`'s local frame — or, for a `GROUND` link, relative to the placement origin. */
  anchorFrom: Vec3
  /** Anchor in `to`'s local frame. */
  anchorTo: Vec3
  /** Rest separation between the two centres. Its direction is the link's axis. */
  rest: Vec3
  /** N/m */
  stiffness: number
  /** N·s/m */
  damping: number
  /** Characteristic length for the drift ratio — storey height, or a deck span. */
  span: number
  /** Drift ratio at which this link fails. */
  capacity: number
  /** Mass used to cap the explicit damper for stability — the heavier of the two ends. */
  mass: number
}

export interface StructurePlan {
  nodes: StructureNode[]
  links: StructureLink[]
}

/** Quarter turns about Y, anticlockwise seen from above. */
export type Quarter = 0 | 1 | 2 | 3

/** Negating zero gives -0, which compares unequal to 0 under Object.is and serialises oddly.
 *  Geometry is compared and snapshotted all over the tests, so flatten it at the source. */
const nz = (v: number) => (v === 0 ? 0 : v)

/** Rotates a local offset by `q` quarter turns about the Y axis. */
export function rotateQuarter([x, y, z]: Vec3, q: Quarter): Vec3 {
  switch (q & 3) {
    case 1:
      return [nz(z), y, nz(-x)]
    case 2:
      return [nz(-x), y, nz(-z)]
    case 3:
      return [nz(-z), y, nz(x)]
    default:
      return [x, y, z]
  }
}

/** Half-extents swap on odd quarter turns; the box stays axis-aligned either way. */
export function rotateHalf([hx, hy, hz]: Vec3, q: Quarter): Vec3 {
  return q & 1 ? [hz, hy, hx] : [hx, hy, hz]
}

/** Footprint after rotation, as [width, depth]. */
export function rotateFootprint(
  [w, d]: [number, number],
  q: Quarter,
): [number, number] {
  return q & 1 ? [d, w] : [w, d]
}

/**
 * The classic vertical stack: one body per floor, each spring-jointed to the one below, and
 * floor 0 to the ground so the whole thing is a cantilever rather than a free-standing pile.
 *
 * This must stay geometrically identical to the original hard-coded loop — `structure.test.ts`
 * pins it — because `storeyStiffness` in `buildingSpecs.ts` is calibration output measured
 * against exactly this arrangement.
 */
function buildStack(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [w, d] = spec.footprint
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < spec.floors; i++) {
    nodes.push({
      offset: rotateQuarter([0, floorCentreY(i), 0], q),
      half: rotateHalf([w / 2, FLOOR_HEIGHT / 2, d / 2], q),
      mass: spec.floorMass,
      part: 'floor',
    })
  }

  for (let i = 0; i < spec.floors; i++) {
    const ground = i === 0
    links.push({
      from: ground ? GROUND : i - 1,
      to: i,
      // A ground anchor sits at the placement origin itself; a floor anchor at the interface
      // between the two floors.
      anchorFrom: ground ? [0, 0, 0] : rotateQuarter([0, FLOOR_HEIGHT / 2, 0], q),
      anchorTo: rotateQuarter([0, -FLOOR_HEIGHT / 2, 0], q),
      rest: ground ? [0, floorCentreY(0), 0] : [0, FLOOR_HEIGHT, 0],
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: FLOOR_HEIGHT,
      capacity: spec.driftCapacity,
      mass: spec.floorMass,
    })
  }

  return { nodes, links }
}

/** Deck thickness, metres — shared by the road and both bridges. */
export const DECK_THICKNESS = 0.8

/**
 * A road: a chain of slab segments lying on the ground, each tied *both* to the ground beneath
 * it and to its neighbours.
 *
 * The ground tie is what makes it a road rather than a floating ribbon, and the neighbour ties
 * are what let it fail interestingly: segments shear apart into offset slabs, which is what
 * roads actually do in an earthquake. `spec.floors` is reused as the segment count — on a
 * horizontal structure "floors" means "how many pieces".
 */
function buildRoad(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [length, width] = spec.footprint
  const n = spec.floors
  const seg = length / n
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    const x = -length / 2 + seg * (i + 0.5)
    nodes.push({
      offset: rotateQuarter([x, DECK_THICKNESS / 2, 0], q),
      half: rotateHalf([seg / 2, DECK_THICKNESS / 2, width / 2], q),
      mass: spec.floorMass,
      part: 'deck',
    })
    // Tie to the ground directly below this segment.
    links.push({
      from: GROUND,
      to: i,
      anchorFrom: rotateQuarter([x, 0, 0], q),
      anchorTo: rotateQuarter([0, -DECK_THICKNESS / 2, 0], q),
      rest: rotateQuarter([0, DECK_THICKNESS / 2, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: seg,
      capacity: spec.driftCapacity,
      mass: spec.floorMass,
    })
    // ...and to the segment behind it.
    if (i > 0) {
      links.push({
        from: i - 1,
        to: i,
        anchorFrom: rotateQuarter([seg / 2, 0, 0], q),
        anchorTo: rotateQuarter([-seg / 2, 0, 0], q),
        rest: rotateQuarter([seg, 0, 0], q),
        stiffness: spec.storeyStiffness,
        damping: spec.storeyDamping,
        span: seg,
        capacity: spec.driftCapacity,
        mass: spec.floorMass,
      })
    }
  }

  return { nodes, links }
}

/**
 * An ordinary bridge: a deck carried on piers, with unsupported spans between them.
 *
 * Only the end abutments and the piers reach the ground. The segments in between hold each
 * other up, so losing a pier drops a whole span — and `supportedNodes` works that out by
 * reachability rather than by anything hard-coded here.
 */
function buildBridge(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [length, width] = spec.footprint
  const n = spec.floors
  const seg = length / n
  const deckY = spec.deckHeight ?? 9
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    const x = -length / 2 + seg * (i + 0.5)
    nodes.push({
      offset: rotateQuarter([x, deckY, 0], q),
      half: rotateHalf([seg / 2, DECK_THICKNESS / 2, width / 2], q),
      mass: spec.floorMass,
      part: 'deck',
    })
  }

  // Deck segment to deck segment.
  for (let i = 1; i < n; i++) {
    links.push({
      from: i - 1,
      to: i,
      anchorFrom: rotateQuarter([seg / 2, 0, 0], q),
      anchorTo: rotateQuarter([-seg / 2, 0, 0], q),
      rest: rotateQuarter([seg, 0, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: seg,
      capacity: spec.driftCapacity,
      mass: spec.floorMass,
    })
  }

  // Piers under the two abutments and the middle, each a single column to the ground. The
  // pier stops at the deck's underside rather than at its centreline, so the two never
  // interpenetrate and — the part that actually bites — the zero-rest-length spring's two
  // anchors coincide at rest. Anchors that do not coincide pull the deck down until they do,
  // which shows up as a permanent drift the structure can never shed.
  const pierTop = deckY - DECK_THICKNESS / 2
  const pierHalf = pierTop / 2
  const pierAt = [...new Set([0, Math.floor(n / 2), n - 1])]
  for (const i of pierAt) {
    const x = -length / 2 + seg * (i + 0.5)
    const pier = nodes.length
    nodes.push({
      offset: rotateQuarter([x, pierHalf, 0], q),
      half: rotateHalf([seg * 0.18, pierHalf, width * 0.3], q),
      mass: spec.floorMass * 0.8,
      part: 'pier',
    })
    links.push({
      from: GROUND,
      to: pier,
      anchorFrom: rotateQuarter([x, 0, 0], q),
      anchorTo: rotateQuarter([0, -pierHalf, 0], q),
      rest: rotateQuarter([0, pierHalf, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: pierTop,
      capacity: spec.driftCapacity,
      mass: spec.floorMass * 0.8,
    })
    links.push({
      from: pier,
      to: i,
      anchorFrom: rotateQuarter([0, pierHalf, 0], q),
      anchorTo: rotateQuarter([0, -DECK_THICKNESS / 2, 0], q),
      rest: rotateQuarter([0, deckY - pierHalf, 0], q),
      stiffness: spec.storeyStiffness * 1.5,
      damping: spec.storeyDamping,
      span: pierTop,
      capacity: spec.driftCapacity,
      mass: spec.floorMass,
    })
  }

  return { nodes, links }
}

export function buildStructure(spec: BuildingSpec, rotation: Quarter = 0): StructurePlan {
  switch (spec.layout ?? 'stack') {
    case 'road':
      return buildRoad(spec, rotation)
    case 'bridge':
      return buildBridge(spec, rotation)
    default:
      return buildStack(spec, rotation)
  }
}

/** Unit direction of a link's rest axis. Zero-length rest falls back to vertical. */
export function linkAxis(link: StructureLink): Vec3 {
  const [x, y, z] = link.rest
  const n = Math.hypot(x, y, z)
  return n < 1e-9 ? [0, 1, 0] : [x / n, y / n, z / n]
}
