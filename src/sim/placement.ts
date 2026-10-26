import { BUILDING_SPECS, type BuildingTypeId } from './buildingSpecs'

/** Half-extent of the square ground plane, metres. Mirrors GROUND_SIZE in scene/Ground.tsx. */
export const GROUND_HALF_EXTENT = 100

/** Grid snapping, metres. Fingers are imprecise; unsnapped footprints overlap by centimetres. */
export const GRID_SIZE = 1

export interface PlacedBuilding {
  instanceId: string
  type: BuildingTypeId
  /** [x, z] on the ground — the CENTRE of the footprint. y is always 0. */
  position: [number, number]
}

export const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE

export const snapPosition = (x: number, z: number): [number, number] => [
  snapToGrid(x),
  snapToGrid(z),
]

interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function footprintBox(
  type: BuildingTypeId,
  pos: [number, number],
  margin = 0,
): Box {
  const [w, d] = BUILDING_SPECS[type].footprint
  const hx = w / 2 + margin
  const hz = d / 2 + margin
  return { minX: pos[0] - hx, maxX: pos[0] + hx, minZ: pos[1] - hz, maxZ: pos[1] + hz }
}

const overlaps = (a: Box, b: Box) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ

export function isWithinGround(type: BuildingTypeId, pos: [number, number]): boolean {
  const box = footprintBox(type, pos)
  return (
    box.minX >= -GROUND_HALF_EXTENT &&
    box.maxX <= GROUND_HALF_EXTENT &&
    box.minZ >= -GROUND_HALF_EXTENT &&
    box.maxZ <= GROUND_HALF_EXTENT
  )
}

/**
 * Can a building of `type` be placed centred on `pos`?
 *
 * The margin is applied to the *candidate* footprint only, so two buildings end up at least
 * `margin` apart. Rejecting overlaps matters for more than tidiness: a few centimetres of
 * interpenetration makes Rapier resolve a huge penetration on frame 1 and fling the buildings
 * across the map.
 */
export function canPlace(
  type: BuildingTypeId,
  pos: [number, number],
  placed: PlacedBuilding[],
  margin = 1,
): boolean {
  if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return false
  if (!isWithinGround(type, pos)) return false

  const candidate = footprintBox(type, pos, margin)
  return !placed.some((p) => overlaps(candidate, footprintBox(p.type, p.position)))
}
