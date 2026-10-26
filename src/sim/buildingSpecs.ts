/**
 * The five building types from Description.md §2, as plain data.
 *
 * This is a `src/sim` file: no imports, no Three.js, no Rapier. It is the shared vocabulary
 * for every later phase.
 *
 * Units are SI and real throughout — metres, kilograms, seconds.
 */

export const FLOOR_HEIGHT = 3 // metres, all building types

export type BuildingTypeId =
  | 'smallHouse'
  | 'largeHouse'
  | 'smallBlock'
  | 'mediumBlock'
  | 'largeBlock'

export interface BuildingSpec {
  id: BuildingTypeId
  /** Shown in the palette and used as the accessible name. Playwright selects on this. */
  label: string
  floors: number
  /** metres, [x, z]. `position` elsewhere always means the CENTRE of this footprint. */
  footprint: [number, number]
  /** kg per floor */
  floorMass: number
  /**
   * N/m — lateral (shear) stiffness of one storey: the restoring force per metre of
   * horizontal displacement between two consecutive floors. Calibrated by
   * `npm run calibrate` so free vibration matches `targetPeriod(floors)`.
   */
  storeyStiffness: number
  /** N·s/m — storey damping. Real structures dissipate energy; without it nothing settles. */
  storeyDamping: number
  /** Interstorey drift ratio at failure — phase 6. */
  driftCapacity: number
  colour: string
}

/**
 * Masses are floor area x a mass density: roughly 400 kg/m² for timber-framed houses,
 * 1000 kg/m² for concrete blocks of flats. They do not need to be exact; they need to be
 * *relatively* right, because what drives the simulation is the ratio of mass to stiffness.
 *
 * `driftCapacity` is lower for the taller concrete blocks (1.8 %) than for timber houses
 * (3.0 %) — stiffer, more brittle structures tolerate less drift before failing.
 *
 * `storeyStiffness` and `storeyDamping` are **calibration output**, not guesses: they come
 * from `npm run calibrate`, which bisects each type's stiffness until its measured
 * free-vibration period matches `targetPeriod(floors)`. Damping is 5 % of critical for the
 * first mode. Do not hand-edit them — re-run the script and paste the result.
 */
export const BUILDING_SPECS: Record<BuildingTypeId, BuildingSpec> = {
  smallHouse: {
    id: 'smallHouse',
    label: 'Small house',
    floors: 1,
    footprint: [6, 6],
    floorMass: 15_000,
    storeyStiffness: 5.92e7,
    storeyDamping: 9.4e4,
    driftCapacity: 0.03,
    colour: '#d9a066',
  },
  largeHouse: {
    id: 'largeHouse',
    label: 'Large house',
    floors: 2,
    footprint: [9, 8],
    floorMass: 30_000,
    storeyStiffness: 7.76e7,
    storeyDamping: 2.47e5,
    driftCapacity: 0.03,
    colour: '#c98a5e',
  },
  smallBlock: {
    id: 'smallBlock',
    label: 'Small block',
    floors: 4,
    footprint: [12, 10],
    floorMass: 120_000,
    storeyStiffness: 2.434e8,
    storeyDamping: 1.55e6,
    driftCapacity: 0.022,
    colour: '#9aa7b4',
  },
  mediumBlock: {
    id: 'mediumBlock',
    label: 'Medium block',
    floors: 8,
    footprint: [14, 12],
    floorMass: 168_000,
    storeyStiffness: 3.04e8,
    storeyDamping: 3.87e6,
    driftCapacity: 0.02,
    colour: '#8694a3',
  },
  largeBlock: {
    id: 'largeBlock',
    label: 'Large block',
    floors: 12,
    footprint: [16, 12],
    floorMass: 192_000,
    storeyStiffness: 3.34e8,
    storeyDamping: 6.37e6,
    driftCapacity: 0.018,
    colour: '#73818f',
  },
}

/** Palette order: shortest first, which is also the order in Description.md §2. */
export const BUILDING_ORDER: BuildingTypeId[] = [
  'smallHouse',
  'largeHouse',
  'smallBlock',
  'mediumBlock',
  'largeBlock',
]

export const BUILDING_LIST: BuildingSpec[] = BUILDING_ORDER.map((id) => BUILDING_SPECS[id])

/**
 * Rule of thumb used by structural engineers: T ~ 0.1 s per storey.
 *
 * The most consequential line in this file. It is why the 12-floor block (T ~ 1.2 s) and the
 * house (T ~ 0.1 s) respond completely differently to the same quake. The phase 3 calibration
 * tunes `jointStiffness` until free vibration matches it.
 */
export const targetPeriod = (floors: number) => 0.1 * floors

export const buildingHeight = (spec: BuildingSpec) => spec.floors * FLOOR_HEIGHT

/** Centre height of floor `i` (0-based) above the ground. */
export const floorCentreY = (i: number) => (i + 0.5) * FLOOR_HEIGHT
