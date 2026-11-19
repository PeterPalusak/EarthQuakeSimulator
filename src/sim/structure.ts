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

export function buildStructure(spec: BuildingSpec, rotation: Quarter = 0): StructurePlan {
  switch (spec.layout ?? 'stack') {
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
