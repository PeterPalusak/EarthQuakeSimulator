import { describe, expect, it } from 'vitest'
import type { BuildingTypeId } from './buildingSpecs'
import type { Quarter } from './structure'
import { GROUND_HALF_EXTENT, canPlace, snapPosition, type PlacedBuilding } from './placement'

const at = (
  type: BuildingTypeId,
  position: [number, number],
  rotation: Quarter = 0,
): PlacedBuilding => ({
  instanceId: `${type}@${position.join(',')}`,
  type,
  position,
  rotation,
})

describe('snapPosition', () => {
  it('snaps to the 1 m grid', () => {
    expect(snapPosition(3.4, -7.6)).toEqual([3, -8])
    expect(snapPosition(0.5, -0.5)).toEqual([1, -0])
  })
})

describe('canPlace', () => {
  it('allows placing on empty ground', () => {
    expect(canPlace('smallHouse', [0, 0], [])).toBe(true)
  })

  it('rejects placing exactly on top of an existing building', () => {
    const placed = [at('smallHouse', [0, 0])]
    expect(canPlace('smallHouse', [0, 0], placed)).toBe(false)
  })

  it('allows placing adjacent but beyond the margin', () => {
    // two 6 m houses: centres 8 m apart leaves a 2 m gap, clear of the 1 m margin
    const placed = [at('smallHouse', [0, 0])]
    expect(canPlace('smallHouse', [8, 0], placed)).toBe(true)
  })

  it('rejects placing just inside the margin', () => {
    // centres 6.5 m apart leaves a 0.5 m gap — inside the 1 m margin
    const placed = [at('smallHouse', [0, 0])]
    expect(canPlace('smallHouse', [6.5, 0], placed)).toBe(false)
  })

  it('respects the footprint, not just centre distance', () => {
    // A large block (16 x 12) at the same spot a small house (6 x 6) would fit.
    const placed = [at('smallHouse', [0, 0])]
    expect(canPlace('smallHouse', [8, 0], placed)).toBe(true)
    expect(canPlace('largeBlock', [8, 0], placed)).toBe(false)
  })

  it('rejects positions outside the ground bounds', () => {
    expect(canPlace('smallHouse', [GROUND_HALF_EXTENT + 10, 0], [])).toBe(false)
    expect(canPlace('smallHouse', [0, -GROUND_HALF_EXTENT - 10], [])).toBe(false)
  })

  it('rejects a building whose footprint hangs over the edge even though its centre is inside', () => {
    // largeBlock is 16 m wide, so its centre must stay 8 m inside the edge
    expect(canPlace('largeBlock', [GROUND_HALF_EXTENT - 2, 0], [])).toBe(false)
    expect(canPlace('largeBlock', [GROUND_HALF_EXTENT - 8, 0], [])).toBe(true)
  })

  it('rejects non-finite positions', () => {
    expect(canPlace('smallHouse', [NaN, 0], [])).toBe(false)
    expect(canPlace('smallHouse', [0, Infinity], [])).toBe(false)
  })

  it('checks against every placed building, not just the first', () => {
    const placed = [at('smallHouse', [-20, 0]), at('smallHouse', [0, 0])]
    expect(canPlace('smallHouse', [1, 0], placed)).toBe(false)
  })
})

describe('rotation', () => {
  it('a long structure blocks a different strip of ground when turned', () => {
    // A road is 48 x 9. Unrotated it reaches far along X; turned, far along Z.
    expect(canPlace('road', [0, 0], [], 1, 0)).toBe(true)
    expect(canPlace('smallHouse', [20, 0], [at('road', [0, 0], 0)])).toBe(false)
    expect(canPlace('smallHouse', [20, 0], [at('road', [0, 0], 1)])).toBe(true)
    expect(canPlace('smallHouse', [0, 20], [at('road', [0, 0], 1)])).toBe(false)
  })

  it('respects the ground bounds in whichever direction it is pointing', () => {
    // Half of 48 is 24, so a road centred 80 m out fits along Z but not along X.
    expect(canPlace('road', [80, 0], [], 1, 0)).toBe(false)
    expect(canPlace('road', [80, 0], [], 1, 1)).toBe(true)
  })

  it('two opposite quarter turns occupy the same ground', () => {
    for (const [a, b] of [
      [0, 2],
      [1, 3],
    ] as const) {
      expect(canPlace('smallHouse', [20, 0], [at('bridge', [0, 0], a)])).toBe(
        canPlace('smallHouse', [20, 0], [at('bridge', [0, 0], b)]),
      )
    }
  })
})
