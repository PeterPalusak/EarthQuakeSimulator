import { describe, expect, it } from 'vitest'
import {
  BUILDING_LIST,
  BUILDING_ORDER,
  BUILDING_SPECS,
  CONVENTIONAL_LIST,
  CONVENTIONAL_TYPES,
  FLOOR_HEIGHT,
  buildingHeight,
  floorCentreY,
  specTargetPeriod,
  targetPeriod,
} from './buildingSpecs'

describe('BUILDING_SPECS', () => {
  it('has the five types from the requirement, with the required floor counts', () => {
    expect(CONVENTIONAL_TYPES).toEqual([
      'smallHouse',
      'largeHouse',
      'smallBlock',
      'mediumBlock',
      'largeBlock',
    ])
    expect(CONVENTIONAL_LIST.map((s) => s.floors)).toEqual([1, 2, 4, 8, 12])
  })

  it('offers the conventional ladder first, then the novelties', () => {
    expect(BUILDING_ORDER.slice(0, CONVENTIONAL_TYPES.length)).toEqual(CONVENTIONAL_TYPES)
    expect(BUILDING_ORDER).toHaveLength(Object.keys(BUILDING_SPECS).length)
    expect(new Set(BUILDING_ORDER).size).toBe(BUILDING_ORDER.length)
  })

  it('keys match the id field', () => {
    for (const [key, spec] of Object.entries(BUILDING_SPECS)) {
      expect(spec.id).toBe(key)
    }
  })

  it.each(BUILDING_LIST)('$label has positive mass, footprint and stiffness', (spec) => {
    expect(spec.floorMass).toBeGreaterThan(0)
    expect(spec.footprint[0]).toBeGreaterThan(0)
    expect(spec.footprint[1]).toBeGreaterThan(0)
    expect(spec.storeyStiffness).toBeGreaterThan(0)
    expect(spec.storeyDamping).toBeGreaterThan(0)
    expect(spec.driftCapacity).toBeGreaterThan(0)
    expect(spec.label.trim().length).toBeGreaterThan(0)
  })

  it('has unique labels — they are used as accessible names', () => {
    const labels = BUILDING_LIST.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('gives taller buildings footprints at least as large as shorter ones', () => {
    for (let i = 1; i < CONVENTIONAL_LIST.length; i++) {
      const prev = CONVENTIONAL_LIST[i - 1]
      const cur = CONVENTIONAL_LIST[i]
      const area = (s: typeof cur) => s.footprint[0] * s.footprint[1]
      expect(area(cur)).toBeGreaterThanOrEqual(area(prev))
    }
  })

  it('gives taller buildings a lower drift capacity — stiffer means more brittle', () => {
    for (let i = 1; i < CONVENTIONAL_LIST.length; i++) {
      expect(CONVENTIONAL_LIST[i].driftCapacity).toBeLessThanOrEqual(
        CONVENTIONAL_LIST[i - 1].driftCapacity,
      )
    }
  })

  it('marks only the novelty types as novelties', () => {
    for (const spec of CONVENTIONAL_LIST) expect(spec.novelty).toBeFalsy()
    expect(BUILDING_SPECS.fishFingerHouse.novelty).toBe(true)
  })
})

describe('the fish finger house', () => {
  const fish = BUILDING_SPECS.fishFingerHouse
  const block = BUILDING_SPECS.mediumBlock

  it('is exactly the same size as the medium block', () => {
    expect(fish.floors).toBe(block.floors)
    expect(fish.footprint).toEqual(block.footprint)
    expect(buildingHeight(fish)).toBe(buildingHeight(block))
  })

  it('is far lighter — breaded fish is not concrete', () => {
    expect(fish.floorMass).toBeLessThan(block.floorMass / 3)
  })

  it('is floppier than its height implies, so it behaves like a taller building', () => {
    expect(fish.periodFactor).toBeGreaterThan(1)
    expect(specTargetPeriod(fish)).toBeGreaterThan(specTargetPeriod(block))
    // ...and in fact sways more slowly than the 12-floor block, despite being shorter
    expect(specTargetPeriod(fish)).toBeGreaterThan(
      specTargetPeriod(BUILDING_SPECS.largeBlock),
    )
    expect(fish.storeyStiffness).toBeLessThan(block.storeyStiffness)
  })

  it('crumbles at a drift that merely cracks a real block of flats', () => {
    expect(fish.driftCapacity).toBeLessThan(block.driftCapacity / 2)
  })
})

describe('geometry helpers', () => {
  it('targetPeriod is 0.1 s per storey', () => {
    expect(targetPeriod(1)).toBeCloseTo(0.1)
    expect(targetPeriod(12)).toBeCloseTo(1.2)
  })

  it('specTargetPeriod applies the periodFactor, defaulting to 1', () => {
    expect(specTargetPeriod(BUILDING_SPECS.mediumBlock)).toBeCloseTo(0.8)
    expect(specTargetPeriod(BUILDING_SPECS.fishFingerHouse)).toBeCloseTo(1.28)
  })

  it('buildingHeight is floors x FLOOR_HEIGHT — the 12-floor block is 36 m', () => {
    expect(buildingHeight(BUILDING_SPECS.largeBlock)).toBe(36)
    expect(FLOOR_HEIGHT).toBe(3)
  })

  it('stacks floors with no gaps and no overlaps', () => {
    expect(floorCentreY(0)).toBe(1.5)
    expect(floorCentreY(1) - floorCentreY(0)).toBe(FLOOR_HEIGHT)
  })
})
