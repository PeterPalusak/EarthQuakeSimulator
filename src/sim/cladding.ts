/**
 * Decorative floor cladding layouts.
 *
 * Pure geometry, so the arithmetic that has to add back up to the footprint is testable
 * without a renderer. Nothing here affects the physics: a floor is a single box collider
 * whatever it is drawn as.
 */

/** Bars per course. Five reads as "fish fingers" without turning one building into a forest. */
export const FINGERS_PER_FLOOR = 5
/** Metres of air between neighbouring bars, and between one course and the next. */
export const FINGER_GAP = 0.25
/** Fraction of the storey height a course occupies, leaving a visible seam above it. */
export const FINGER_HEIGHT_RATIO = 0.88

export interface FingerPlacement {
  /** Offset from the floor's centre, in the floor's own frame. */
  offsetX: number
  offsetZ: number
  sizeX: number
  sizeZ: number
}

/**
 * Lays one course of bars across a floor.
 *
 * Alternate courses run crosswise, like a woodpile — that criss-cross is what makes a stack of
 * plain boxes read instantly as stacked fish fingers rather than as a striped tower.
 *
 * The bars plus the gaps between them exactly fill the footprint, so the silhouette still
 * matches the collider.
 */
export function fishFingerLayout(
  footprint: [number, number],
  floorIndex: number,
  count = FINGERS_PER_FLOOR,
  gap = FINGER_GAP,
): FingerPlacement[] {
  const [w, d] = footprint
  // Even courses lie along Z and are laid out across X; odd courses are rotated a quarter turn.
  const alongZ = floorIndex % 2 === 0
  const span = alongZ ? w : d
  const bar = (span - (count - 1) * gap) / count
  const start = -span / 2 + bar / 2

  return Array.from({ length: count }, (_, i) => {
    const offset = start + i * (bar + gap)
    return alongZ
      ? { offsetX: offset, offsetZ: 0, sizeX: bar, sizeZ: d }
      : { offsetX: 0, offsetZ: offset, sizeX: w, sizeZ: bar }
  })
}
