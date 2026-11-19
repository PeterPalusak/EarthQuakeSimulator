/**
 * The building types, as plain data: the five from Description.md §2, plus one novelty.
 *
 * This is a `src/sim` file: no imports, no Three.js, no Rapier. It is the shared vocabulary
 * for every later phase.
 *
 * Units are SI and real throughout — metres, kilograms, seconds.
 */

export const FLOOR_HEIGHT = 3 // metres, all building types

/** Structural arrangements `buildStructure` knows how to generate (src/sim/structure.ts). */
export type StructureLayout = 'stack' | 'road' | 'bridge' | 'cableBridge' | 'tower'

export type BuildingTypeId =
  | 'smallHouse'
  | 'largeHouse'
  | 'smallBlock'
  | 'mediumBlock'
  | 'largeBlock'
  | 'fishFingerHouse'

/** The five conventional types, which form a ladder of increasing height and decreasing
 *  ductility. Invariants that only make sense for real construction are asserted over these,
 *  not over the novelty types. */
export const CONVENTIONAL_TYPES: BuildingTypeId[] = [
  'smallHouse',
  'largeHouse',
  'smallBlock',
  'mediumBlock',
  'largeBlock',
]

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
  /**
   * Multiplies the "0.1 s per storey" rule when choosing this type's natural period.
   *
   * 1 (the default) for anything built out of a normal structural material. A value above 1
   * means the structure is floppier than its height suggests, so it behaves like a taller
   * building and resonates with longer-period, more distant quakes.
   */
  periodFactor?: number
  /** Marks a type that is not real construction, so the engineering invariants skip it. */
  novelty?: boolean
  /**
   * Which structural arrangement `buildStructure` should generate. Defaults to `stack`, the
   * vertical chain of floors every building type uses. Roads, bridges and towers are chains
   * with a different shape — see src/sim/structure.ts.
   */
  layout?: StructureLayout
  /**
   * How a floor is drawn. `solid` (the default) is one box per floor. `fishFingers` draws each
   * floor as a course of separate bars, laid crosswise to the course below. Purely cosmetic —
   * the collider is one box per floor either way.
   */
  appearance?: 'solid' | 'fishFingers'
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

  /**
   * A tower of fish fingers. Deliberately the same size as the medium block — 8 floors on the
   * same 14 x 12 m footprint — so the two can stand side by side and the only difference is
   * what they are made of. Everything else follows from that:
   *
   * - **Light.** Breaded fish runs about 250 kg/m² of floor, a quarter of a concrete block.
   * - **Floppy.** `periodFactor` 1.6 gives it a 1.28 s period instead of the medium block's
   *   0.8 s, so despite being the same height it sways like a 13-storey building and comes
   *   alive under the distant, low-frequency quakes that the medium block shrugs off.
   * - **Brittle.** It comes apart at 0.9 % drift, under half what the real blocks tolerate —
   *   a level at which a concrete frame has done no more than crack.
   *
   * Net effect, measured rather than asserted: it survives the default medium quake, and
   * collapses reliably by M7 at 10 km, which the identically-sized concrete block shrugs off.
   * The structurally interesting part is that floppy and brittle pull in opposite directions:
   * being soft keeps the forces down, being crumbly means it needs very little to fail.
   */
  fishFingerHouse: {
    id: 'fishFingerHouse',
    label: 'Fish finger house',
    floors: 8,
    footprint: [14, 12],
    floorMass: 42_000,
    storeyStiffness: 2.97e7,
    storeyDamping: 6.05e5,
    driftCapacity: 0.009,
    colour: '#e0a447',
    periodFactor: 1.6,
    novelty: true,
    appearance: 'fishFingers',
  },
}

/** Palette order: the Description's ladder shortest-first, then the novelties. */
export const BUILDING_ORDER: BuildingTypeId[] = [...CONVENTIONAL_TYPES, 'fishFingerHouse']

export const BUILDING_LIST: BuildingSpec[] = BUILDING_ORDER.map((id) => BUILDING_SPECS[id])

/** The five types from the requirement, in ladder order. */
export const CONVENTIONAL_LIST: BuildingSpec[] = CONVENTIONAL_TYPES.map(
  (id) => BUILDING_SPECS[id],
)

/**
 * Rule of thumb used by structural engineers: T ~ 0.1 s per storey.
 *
 * The most consequential line in this file. It is why the 12-floor block (T ~ 1.2 s) and the
 * house (T ~ 0.1 s) respond completely differently to the same quake. The phase 3 calibration
 * tunes `storeyStiffness` until free vibration matches it.
 */
export const targetPeriod = (floors: number) => 0.1 * floors

/** The period a given type is calibrated to, including any `periodFactor`. */
export const specTargetPeriod = (spec: BuildingSpec) =>
  targetPeriod(spec.floors) * (spec.periodFactor ?? 1)

export const buildingHeight = (spec: BuildingSpec) => spec.floors * FLOOR_HEIGHT

/** Centre height of floor `i` (0-based) above the ground. */
export const floorCentreY = (i: number) => (i + 0.5) * FLOOR_HEIGHT
