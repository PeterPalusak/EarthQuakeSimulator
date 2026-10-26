import { describe, expect, it } from 'vitest'
import {
  MAX_DISTANCE_KM,
  MIN_DISTANCE_KM,
  PRESETS,
  distanceLabel,
  distanceToSlider,
  epicentrePosition,
  magnitudeLabel,
  markerRadius,
  radiusToDistance,
  sliderToDistance,
} from './quakeScales'
import { generateGroundMotion, predictPga } from './groundMotion'

describe('the logarithmic distance slider', () => {
  it('maps 0 to 1 km and 1 to 200 km', () => {
    expect(sliderToDistance(0)).toBeCloseTo(MIN_DISTANCE_KM)
    expect(sliderToDistance(1)).toBeCloseTo(MAX_DISTANCE_KM)
  })

  it('is monotonic in between', () => {
    let previous = 0
    for (let s = 0; s <= 1; s += 0.05) {
      const d = sliderToDistance(s)
      expect(d).toBeGreaterThan(previous)
      previous = d
    }
  })

  it('gives the near range most of the travel, where the behaviour changes', () => {
    // half the slider covers 1-14 km, not 1-100 km
    expect(sliderToDistance(0.5)).toBeLessThan(20)
  })

  it('round-trips through distanceToSlider', () => {
    for (const km of [1, 3, 10, 30, 100, 200]) {
      expect(sliderToDistance(distanceToSlider(km))).toBeCloseTo(km, 6)
    }
  })

  it('clamps outside the range rather than extrapolating', () => {
    expect(sliderToDistance(-1)).toBeCloseTo(MIN_DISTANCE_KM)
    expect(sliderToDistance(5)).toBeCloseTo(MAX_DISTANCE_KM)
    expect(distanceToSlider(0.1)).toBe(0)
    expect(distanceToSlider(10_000)).toBe(1)
  })
})

describe('labels', () => {
  it('describes magnitude in plain language', () => {
    expect(magnitudeLabel(4.0)).toBe('Light')
    expect(magnitudeLabel(5.5)).toBe('Moderate')
    expect(magnitudeLabel(6.2)).toBe('Strong')
    expect(magnitudeLabel(7.4)).toBe('Major')
    expect(magnitudeLabel(8.0)).toBe('Great')
  })

  it('describes distance in plain language', () => {
    expect(distanceLabel(2)).toBe('Right here')
    expect(distanceLabel(10)).toBe('Nearby')
    expect(distanceLabel(40)).toBe('Some way off')
    expect(distanceLabel(150)).toBe('Far away')
  })
})

describe('the epicentre marker', () => {
  it('stays on the ground plane across the whole distance range', () => {
    for (const km of [1, 10, 50, 200]) {
      const [x, z] = epicentrePosition(km, 0.7)
      expect(Math.hypot(x, z)).toBeLessThan(100)
    }
  })

  it('moves outward as the distance grows', () => {
    expect(markerRadius(200)).toBeGreaterThan(markerRadius(10))
    expect(markerRadius(10)).toBeGreaterThan(markerRadius(1))
  })

  it('round-trips radius back to distance, so dragging and the slider agree', () => {
    for (const km of [1, 5, 25, 120, 200]) {
      expect(radiusToDistance(markerRadius(km))).toBeCloseTo(km, 5)
    }
  })

  it('follows the bearing', () => {
    const [x0, z0] = epicentrePosition(50, 0)
    const [x1, z1] = epicentrePosition(50, Math.PI / 2)
    expect(x0).toBeGreaterThan(0)
    expect(Math.abs(z0)).toBeLessThan(1e-9)
    expect(Math.abs(x1)).toBeLessThan(1e-9)
    expect(z1).toBeGreaterThan(0)
  })
})

describe('presets', () => {
  it('all produce a valid, finite ground motion', () => {
    for (const p of PRESETS) {
      const m = generateGroundMotion({
        magnitude: p.magnitude,
        distanceKm: p.distanceKm,
        seed: 1,
      })
      expect(Number.isFinite(m.pga)).toBe(true)
      expect(m.acc.x.every((v) => Number.isFinite(v))).toBe(true)
      expect(m.disp.x.every((v) => Number.isFinite(v))).toBe(true)
    }
  })

  it('have unique ids and names', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length)
  })

  it('stay inside the slider ranges', () => {
    for (const p of PRESETS) {
      expect(p.magnitude).toBeGreaterThanOrEqual(4)
      expect(p.magnitude).toBeLessThanOrEqual(8)
      expect(p.distanceKm).toBeGreaterThanOrEqual(MIN_DISTANCE_KM)
      expect(p.distanceKm).toBeLessThanOrEqual(MAX_DISTANCE_KM)
    }
  })

  it('"The big one" is the most intense of them', () => {
    const intensity = (p: (typeof PRESETS)[number]) => predictPga(p.magnitude, p.distanceKm)
    const big = PRESETS.find((p) => p.id === 'bigone')!
    for (const p of PRESETS) {
      if (p.id !== 'bigone') expect(intensity(big)).toBeGreaterThan(intensity(p))
    }
  })

  it('"Distant rumble" is lower frequency than "Sharp & close"', () => {
    const distant = PRESETS.find((p) => p.id === 'distant')!
    const sharp = PRESETS.find((p) => p.id === 'sharp')!
    expect(distant.distanceKm).toBeGreaterThan(sharp.distanceKm)
  })
})
