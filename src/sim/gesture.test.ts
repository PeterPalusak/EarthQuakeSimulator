import { describe, expect, it } from 'vitest'
import { isTap } from './gesture'

const down = { x: 100, y: 100, time: 0 }

describe('isTap', () => {
  it('accepts a short, stationary press', () => {
    expect(isTap(down, { x: 101, y: 102, time: 120 })).toBe(true)
  })

  it('rejects a press that travelled — that is a camera drag', () => {
    expect(isTap(down, { x: 140, y: 100, time: 120 })).toBe(false)
  })

  it('rejects a long press even if it did not move', () => {
    expect(isTap(down, { x: 100, y: 100, time: 900 })).toBe(false)
  })

  it('accepts exactly at the thresholds', () => {
    expect(isTap(down, { x: 108, y: 100, time: 300 })).toBe(true)
  })

  it('measures distance diagonally, not per axis', () => {
    // 7 px on each axis is under the limit per axis but ~9.9 px of actual travel
    expect(isTap(down, { x: 107, y: 107, time: 50 })).toBe(false)
  })
})
