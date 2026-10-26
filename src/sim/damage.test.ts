import { describe, expect, it } from 'vitest'
import { FLOOR_HEIGHT } from './buildingSpecs'
import {
  DAMAGE_THRESHOLDS,
  damageColour,
  damageState,
  driftRatio,
  summarise,
  tally,
} from './damage'

describe('driftRatio', () => {
  it('is the lateral offset divided by the storey height', () => {
    expect(driftRatio({ x: 0, z: 0 }, { x: 0.06, z: 0 })).toBeCloseTo(0.06 / FLOOR_HEIGHT)
  })

  it('combines both horizontal axes', () => {
    // 0.03 on each axis is ~0.0424 of travel
    expect(driftRatio({ x: 0, z: 0 }, { x: 0.03, z: 0.03 })).toBeCloseTo(
      Math.hypot(0.03, 0.03) / FLOOR_HEIGHT,
    )
  })

  it('ignores the sign of the offset', () => {
    expect(driftRatio({ x: 0, z: 0 }, { x: -0.06, z: 0 })).toBeCloseTo(
      driftRatio({ x: 0, z: 0 }, { x: 0.06, z: 0 }),
    )
  })

  it('is zero for perfectly stacked floors', () => {
    expect(driftRatio({ x: 4, z: -2 }, { x: 4, z: -2 })).toBe(0)
  })
})

describe('damageState', () => {
  it('maps the standard thresholds', () => {
    expect(damageState(0)).toBe('none')
    expect(damageState(0.004)).toBe('none')
    expect(damageState(DAMAGE_THRESHOLDS.light)).toBe('light')
    expect(damageState(0.014)).toBe('light')
    expect(damageState(DAMAGE_THRESHOLDS.severe)).toBe('severe')
    expect(damageState(0.024)).toBe('severe')
    expect(damageState(DAMAGE_THRESHOLDS.collapse)).toBe('collapse')
    expect(damageState(0.1)).toBe('collapse')
  })
})

describe('damageColour', () => {
  it('runs green at zero to red at capacity', () => {
    expect(damageColour(0, 0.02)).toBe('#7cb342')
    expect(damageColour(0.02, 0.02)).toBe('#c2322d')
  })

  it('clamps beyond capacity rather than wrapping round', () => {
    expect(damageColour(5, 0.02)).toBe('#c2322d')
  })

  it('always returns a valid hex colour', () => {
    for (let d = 0; d <= 0.04; d += 0.001) {
      expect(damageColour(d, 0.02)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('summarise', () => {
  it('keeps the maximum, not the latest', () => {
    expect(summarise([0.001, 0.02, 0.003], false).peak).toBeCloseTo(0.02)
  })

  it('reports which storey took the punishment', () => {
    expect(summarise([0.001, 0.004, 0.02, 0.002], false).worstStorey).toBe(2)
  })

  it('reports collapse even when the recorded drift looks mild', () => {
    // Once joints are removed the storey stops being sampled, so its last drift can be small.
    const d = summarise([0.002, 0.002], true)
    expect(d.state).toBe('collapse')
    expect(d.collapsed).toBe(true)
  })

  it('handles a building with no storeys recorded', () => {
    expect(summarise([], false).peak).toBe(0)
  })
})

describe('tally', () => {
  it('counts intact, damaged and collapsed', () => {
    const t = tally([
      summarise([0.001], false),
      summarise([0.008], false),
      summarise([0.018], false),
      summarise([0.004], true),
    ])
    expect(t).toEqual({ intact: 1, damaged: 2, collapsed: 1 })
  })
})
