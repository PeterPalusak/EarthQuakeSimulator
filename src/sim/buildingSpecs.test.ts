import { describe, expect, it } from 'vitest'
import {
  BUILDING_LIST,
  BUILDING_ORDER,
  BUILDING_SPECS,
  FLOOR_HEIGHT,
  buildingHeight,
  floorCentreY,
  targetPeriod,
} from './buildingSpecs'

describe('BUILDING_SPECS', () => {
  it('has the five types from the requirement, with the required floor counts', () => {
    expect(BUILDING_ORDER).toEqual([
      'smallHouse',
      'largeHouse',
      'smallBlock',
      'mediumBlock',
      'largeBlock',
    ])
    expect(BUILDING_LIST.map((s) => s.floors)).toEqual([1, 2, 4, 8, 12])
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
    expect(spec.jointStiffness).toBeGreaterThan(0)
    expect(spec.jointDamping).toBeGreaterThan(0)
    expect(spec.driftCapacity).toBeGreaterThan(0)
    expect(spec.label.trim().length).toBeGreaterThan(0)
  })

  it('has unique labels — they are used as accessible names', () => {
    const labels = BUILDING_LIST.map((s) => s.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('gives taller buildings footprints at least as large as shorter ones', () => {
    for (let i = 1; i < BUILDING_LIST.length; i++) {
      const prev = BUILDING_LIST[i - 1]
      const cur = BUILDING_LIST[i]
      const area = (s: typeof cur) => s.footprint[0] * s.footprint[1]
      expect(area(cur)).toBeGreaterThanOrEqual(area(prev))
    }
  })

  it('gives taller buildings a lower drift capacity — stiffer means more brittle', () => {
    for (let i = 1; i < BUILDING_LIST.length; i++) {
      expect(BUILDING_LIST[i].driftCapacity).toBeLessThanOrEqual(
        BUILDING_LIST[i - 1].driftCapacity,
      )
    }
  })
})

describe('geometry helpers', () => {
  it('targetPeriod is 0.1 s per storey', () => {
    expect(targetPeriod(1)).toBeCloseTo(0.1)
    expect(targetPeriod(12)).toBeCloseTo(1.2)
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
