/**
 * Mapping between slider positions and quake parameters, and the plain-language labels that
 * make the numbers mean something.
 *
 * Pure, so the mapping is unit-testable rather than only reachable through a DOM event.
 */

export const MIN_MAGNITUDE = 4.0
export const MAX_MAGNITUDE = 8.0
export const MIN_DISTANCE_KM = 1
export const MAX_DISTANCE_KM = 200

/**
 * Distance is logarithmic. A linear slider wastes most of its travel in the range where
 * nothing changes much — all the interesting behaviour is between 1 and 30 km.
 */
export function sliderToDistance(s: number): number {
  const t = Math.min(Math.max(s, 0), 1)
  return MIN_DISTANCE_KM * (MAX_DISTANCE_KM / MIN_DISTANCE_KM) ** t
}

export function distanceToSlider(km: number): number {
  const clamped = Math.min(Math.max(km, MIN_DISTANCE_KM), MAX_DISTANCE_KM)
  return Math.log(clamped / MIN_DISTANCE_KM) / Math.log(MAX_DISTANCE_KM / MIN_DISTANCE_KM)
}

/** "Magnitude 6.2" means nothing to most people; "Strong" does. */
export function magnitudeLabel(m: number): string {
  if (m < 5) return 'Light'
  if (m < 6) return 'Moderate'
  if (m < 7) return 'Strong'
  if (m < 8) return 'Major'
  return 'Great'
}

export function distanceLabel(km: number): string {
  if (km <= 5) return 'Right here'
  if (km <= 20) return 'Nearby'
  if (km <= 60) return 'Some way off'
  return 'Far away'
}

export interface Preset {
  id: string
  name: string
  magnitude: number
  distanceKm: number
  /** What the preset is for — shown as the button's title and accessible description. */
  shows: string
}

/**
 * One-tap scenarios, so the app is interesting without slider fiddling.
 *
 * "Distant rumble" and "Sharp and close" are the pair worth demonstrating: the same app, two
 * quakes, *opposite* buildings punished. That contrast is the whole point of the
 * distance-dependent frequency shift in the ground motion, and the clearest evidence the
 * simulation is doing real work rather than scaling one number.
 */
export const PRESETS: Preset[] = [
  {
    id: 'distant',
    name: 'Distant rumble',
    magnitude: 7.0,
    distanceKm: 150,
    shows: 'Low frequency — tall blocks sway, houses barely notice',
  },
  {
    id: 'moderate',
    name: 'Moderate local',
    magnitude: 5.5,
    distanceKm: 10,
    shows: 'The default medium earthquake',
  },
  {
    id: 'sharp',
    name: 'Sharp & close',
    magnitude: 5.0,
    distanceKm: 3,
    shows: 'High frequency — houses rattle, tall blocks ride it out',
  },
  {
    id: 'bigone',
    name: 'The big one',
    magnitude: 8.0,
    distanceKm: 3,
    shows: 'Widespread collapse',
  },
]

/**
 * The epicentre marker's position on the 200 m ground plane.
 *
 * The distance slider runs to 200 km but the ground is 200 m across, so the marker cannot sit
 * at true scale. It is drawn at a compressed radius with the real distance as a label —
 * logarithmic, so the near end of the range, where the marker actually moves perceptibly,
 * gets most of the travel.
 */
export const MARKER_MIN_RADIUS = 25
export const MARKER_MAX_RADIUS = 92

export function markerRadius(distanceKm: number): number {
  const t = distanceToSlider(distanceKm)
  return MARKER_MIN_RADIUS + (MARKER_MAX_RADIUS - MARKER_MIN_RADIUS) * t
}

export function radiusToDistance(radius: number): number {
  const t =
    (Math.min(Math.max(radius, MARKER_MIN_RADIUS), MARKER_MAX_RADIUS) - MARKER_MIN_RADIUS) /
    (MARKER_MAX_RADIUS - MARKER_MIN_RADIUS)
  return sliderToDistance(t)
}

export const epicentrePosition = (
  distanceKm: number,
  bearing: number,
): [number, number] => {
  const r = markerRadius(distanceKm)
  return [Math.cos(bearing) * r, Math.sin(bearing) * r]
}
