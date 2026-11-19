import { BUILDING_SPECS, type BuildingSpec, type BuildingTypeId } from './buildingSpecs'
import type { PlacedBuilding } from './placement'
import { buildStructure, rotateFootprint, type Quarter } from './structure'

/**
 * Joining roads and bridges end to end.
 *
 * A road or a bridge is a line, and lines are only useful if they can be continued. Bring a
 * new piece near the end of one already on the ground and it snaps flush against it, then the
 * physics ties the two together so the junction is a real structural connection that can be
 * shaken apart rather than two pieces that happen to touch.
 *
 * Pure geometry: the snapping decision and the resulting junction list are both computed here,
 * so neither needs a scene or a physics world to test.
 */

/**
 * How close an end has to come before it snaps, metres.
 *
 * Generous on purpose. These pieces are 48 to 80 m long and placed with a fingertip, so a
 * tight radius means the snap almost never triggers and the feature may as well not exist —
 * the same reason placement snaps to a 1 m grid rather than landing wherever the finger did.
 */
export const SNAP_RADIUS = 14

/** Types that are lines and can therefore be continued. */
export function isLinear(spec: BuildingSpec): boolean {
  const layout = spec.layout ?? 'stack'
  return layout === 'road' || layout === 'bridge' || layout === 'cableBridge'
}

export interface StructureEnd {
  /** Index of the end deck node. */
  node: number
  /** World position of the node's centre, [x, z]. */
  centre: [number, number]
  /** World position of the outward-facing face, [x, z]. */
  face: [number, number]
}

/**
 * The two ends of a linear structure: the first and last deck segments, and where their
 * outward faces sit in the world.
 */
export function structureEnds(
  type: BuildingTypeId,
  position: [number, number],
  rotation: Quarter,
): StructureEnd[] {
  const spec = BUILDING_SPECS[type]
  if (!isLinear(spec)) return []

  const { nodes } = buildStructure(spec, rotation)
  const deck = nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.part === 'deck')
  if (deck.length < 2) return []

  // The structure runs along whichever horizontal axis its deck spreads over.
  const alongX = rotation % 2 === 0
  const axis = alongX ? 0 : 2
  const sorted = [...deck].sort((a, b) => a.n.offset[axis] - b.n.offset[axis])

  return [sorted[0], sorted.at(-1)!].map(({ n, i }, which) => {
    const outward = which === 0 ? -1 : 1
    const halfAlong = axis === 0 ? n.half[0] : n.half[2]
    const cx = position[0] + n.offset[0]
    const cz = position[1] + n.offset[2]
    return {
      node: i,
      centre: [cx, cz],
      face: axis === 0 ? [cx + outward * halfAlong, cz] : [cx, cz + outward * halfAlong],
    }
  })
}

export interface Snap {
  /** Where the candidate should be placed so its end meets the other's. */
  position: [number, number]
}

const dist2 = (a: [number, number], b: [number, number]) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

/**
 * If a candidate's end comes near the end of something already placed, returns the position
 * that puts the two faces flush.
 *
 * Only pieces running along the same axis connect: continuing a line means continuing it, and
 * a perpendicular piece meeting an end is a T-junction, which is a different thing and not
 * something the deck chain could represent anyway.
 */
export function findSnap(
  type: BuildingTypeId,
  position: [number, number],
  rotation: Quarter,
  placed: PlacedBuilding[],
): Snap | null {
  const spec = BUILDING_SPECS[type]
  if (!isLinear(spec)) return null

  const mine = structureEnds(type, position, rotation)
  if (mine.length === 0) return null

  let best: { d2: number; delta: [number, number] } | null = null

  for (const other of placed) {
    const otherSpec = BUILDING_SPECS[other.type]
    if (!isLinear(otherSpec)) continue
    // Same axis only.
    if (other.rotation % 2 !== rotation % 2) continue

    for (const theirs of structureEnds(other.type, other.position, other.rotation)) {
      for (const ours of mine) {
        const d2 = dist2(ours.face, theirs.face)
        if (d2 > SNAP_RADIUS ** 2) continue
        if (best && d2 >= best.d2) continue
        best = {
          d2,
          delta: [theirs.face[0] - ours.face[0], theirs.face[1] - ours.face[1]],
        }
      }
    }
  }

  if (!best) return null
  return { position: [position[0] + best.delta[0], position[1] + best.delta[1]] }
}

export interface Junction {
  a: string
  aNode: number
  b: string
  bNode: number
}

/** How far apart two end faces may be and still count as joined, metres. */
const JUNCTION_TOLERANCE = 0.3

/**
 * Every pair of placed pieces whose ends are flush, and which nodes meet.
 *
 * Recomputed from the placement list rather than stored, so it cannot drift out of step with
 * what is on the ground — deleting one side of a junction simply stops producing it.
 */
export function findJunctions(placed: PlacedBuilding[]): Junction[] {
  const linear = placed.filter((p) => isLinear(BUILDING_SPECS[p.type]))
  const ends = new Map(
    linear.map((p) => [p.instanceId, structureEnds(p.type, p.position, p.rotation)]),
  )
  const out: Junction[] = []

  for (let i = 0; i < linear.length; i++) {
    for (let j = i + 1; j < linear.length; j++) {
      const a = linear[i]
      const b = linear[j]
      if (a.rotation % 2 !== b.rotation % 2) continue
      for (const ea of ends.get(a.instanceId)!) {
        for (const eb of ends.get(b.instanceId)!) {
          if (dist2(ea.face, eb.face) > JUNCTION_TOLERANCE ** 2) continue
          out.push({ a: a.instanceId, aNode: ea.node, b: b.instanceId, bNode: eb.node })
        }
      }
    }
  }
  return out
}

/** Length of a type along its own axis, after rotation. */
export function alongLength(type: BuildingTypeId, rotation: Quarter): number {
  const [w, d] = rotateFootprint(BUILDING_SPECS[type].footprint, rotation)
  return rotation % 2 === 0 ? w : d
}
