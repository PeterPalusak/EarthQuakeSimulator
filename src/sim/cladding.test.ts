import { describe, expect, it } from 'vitest'
import { BUILDING_SPECS } from './buildingSpecs'
import { FINGERS_PER_FLOOR, FINGER_GAP, fishFingerLayout } from './cladding'

const FOOTPRINT = BUILDING_SPECS.fishFingerHouse.footprint

describe('fishFingerLayout', () => {
  it('lays the requested number of bars', () => {
    expect(fishFingerLayout(FOOTPRINT, 0)).toHaveLength(FINGERS_PER_FLOOR)
  })

  it('fills the footprint exactly — bars plus gaps add back up to the width', () => {
    const bars = fishFingerLayout(FOOTPRINT, 0)
    const total =
      bars.reduce((s, b) => s + b.sizeX, 0) + FINGER_GAP * (FINGERS_PER_FLOOR - 1)
    expect(total).toBeCloseTo(FOOTPRINT[0], 9)
  })

  it('keeps every bar inside the footprint', () => {
    for (const floor of [0, 1]) {
      for (const b of fishFingerLayout(FOOTPRINT, floor)) {
        expect(Math.abs(b.offsetX) + b.sizeX / 2).toBeLessThanOrEqual(FOOTPRINT[0] / 2 + 1e-9)
        expect(Math.abs(b.offsetZ) + b.sizeZ / 2).toBeLessThanOrEqual(FOOTPRINT[1] / 2 + 1e-9)
      }
    }
  })

  it('leaves exactly one gap between neighbours', () => {
    const bars = fishFingerLayout(FOOTPRINT, 0)
    for (let i = 1; i < bars.length; i++) {
      const edgeOfPrevious = bars[i - 1].offsetX + bars[i - 1].sizeX / 2
      const edgeOfThis = bars[i].offsetX - bars[i].sizeX / 2
      expect(edgeOfThis - edgeOfPrevious).toBeCloseTo(FINGER_GAP, 9)
    }
  })

  it('is centred on the floor', () => {
    const bars = fishFingerLayout(FOOTPRINT, 0)
    const mean = bars.reduce((s, b) => s + b.offsetX, 0) / bars.length
    expect(mean).toBeCloseTo(0, 9)
  })

  it('turns each course a quarter turn from the one below', () => {
    const even = fishFingerLayout(FOOTPRINT, 0)
    const odd = fishFingerLayout(FOOTPRINT, 1)
    // Even courses are narrow in X and span the full depth; odd courses are the other way.
    expect(even[0].sizeZ).toBe(FOOTPRINT[1])
    expect(even[0].sizeX).toBeLessThan(FOOTPRINT[0])
    expect(odd[0].sizeX).toBe(FOOTPRINT[0])
    expect(odd[0].sizeZ).toBeLessThan(FOOTPRINT[1])
  })

  it('handles a square footprint and a single bar', () => {
    const one = fishFingerLayout([10, 10], 0, 1)
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ offsetX: 0, offsetZ: 0, sizeX: 10, sizeZ: 10 })
  })
})
