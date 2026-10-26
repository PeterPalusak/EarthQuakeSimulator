/**
 * Tap vs drag disambiguation.
 *
 * On a touchscreen the gesture that orbits the camera and the gesture that places a building
 * both begin as "finger down on the canvas". Treat an interaction as a tap only if it barely
 * moved and barely lasted. Skip this and every attempt to orbit scatters buildings across the
 * map — a problem that does not reproduce with a mouse, where clicks are crisp.
 */
export const TAP_MAX_MOVE_PX = 8
export const TAP_MAX_DURATION_MS = 300

export interface PointerSample {
  x: number
  y: number
  /** milliseconds, any monotonic clock */
  time: number
}

export function isTap(down: PointerSample, up: PointerSample): boolean {
  const moved = Math.hypot(up.x - down.x, up.y - down.y)
  return moved <= TAP_MAX_MOVE_PX && up.time - down.time <= TAP_MAX_DURATION_MS
}
