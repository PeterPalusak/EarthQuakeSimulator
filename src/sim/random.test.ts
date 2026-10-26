import { describe, expect, it } from 'vitest'
import { gaussian, mulberry32 } from './random'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = Array.from({ length: 5 }, mulberry32(42))
    const b = Array.from({ length: 5 }, mulberry32(42))
    expect(a).toEqual(b)
  })

  it('differs between seeds', () => {
    expect(Array.from({ length: 5 }, mulberry32(1))).not.toEqual(
      Array.from({ length: 5 }, mulberry32(2)),
    )
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const x = rng()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('gaussian', () => {
  it('produces roughly standard-normal values', () => {
    const g = gaussian(mulberry32(7))
    const xs = Array.from({ length: 10_000 }, g)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.05)
    expect(sd).toBeGreaterThan(0.95)
    expect(sd).toBeLessThan(1.05)
  })

  it('is deterministic for a given seed', () => {
    const a = Array.from({ length: 20 }, gaussian(mulberry32(3)))
    const b = Array.from({ length: 20 }, gaussian(mulberry32(3)))
    expect(a).toEqual(b)
  })
})
