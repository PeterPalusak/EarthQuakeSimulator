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
  /** N·m/rad — angular spring between consecutive floors. Calibrated by scripts/calibrate.ts. */
  jointStiffness: number
  /** N·m·s/rad — joint damping. Real structures dissipate energy. */
  jointDamping: number
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
 */
export const BUILDING_SPECS: Record<BuildingTypeId, BuildingSpec> = {
  smallHouse: {
    id: 'smallHouse',
    label: 'Small house',
    floors: 1,
    footprint: [6, 6],
    floorMass: 15_000,
    jointStiffness: 5.33e8,
    jointDamping: 2.0e6,
    driftCapacity: 0.03,
    colour: '#d9a066',
  },
  largeHouse: {
    id: 'largeHouse',
    label: 'Large house',
    floors: 2,
    footprint: [9, 8],
    floorMass: 30_000,
    jointStiffness: 6.98e8,
    jointDamping: 3.0e6,
    driftCapacity: 0.03,
    colour: '#c98a5e',
  },
  smallBlock: {
    id: 'smallBlock',
    label: 'Small block',
    floors: 4,
    footprint: [12, 10],
    floorMass: 120_000,
    jointStiffness: 2.21e9,
    jointDamping: 1.2e7,
    driftCapacity: 0.022,
    colour: '#9aa7b4',
  },
  mediumBlock: {
    id: 'mediumBlock',
    label: 'Medium block',
    floors: 8,
    footprint: [14, 12],
    floorMass: 168_000,
    jointStiffness: 2.74e9,
    jointDamping: 1.6e7,
    driftCapacity: 0.02,
    colour: '#8694a3',
  },
  largeBlock: {
    id: 'largeBlock',
    label: 'Large block',
    floors: 12,
    footprint: [16, 12],
    floorMass: 192_000,
    jointStiffness: 3.0e9,
    jointDamping: 1.9e7,
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
