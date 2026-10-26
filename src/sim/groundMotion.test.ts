import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DT,
  G,
  MAX_DISPLACEMENT,
  MAX_DURATION,
  MEDIUM_QUAKE,
  MIN_DURATION,
  effectiveSoilFrequency,
  generateGroundMotion,
  predictDuration,
  predictPga,
  sampleAt,
  type GroundMotion,
  type QuakeParams,
} from './groundMotion'

const peak = (a: Float32Array) => {
  let m = 0
  for (const v of a) m = Math.max(m, Math.abs(v))
  return m
}

const horizontalPeak = (m: GroundMotion) => Math.max(peak(m.acc.x), peak(m.acc.z))

const allFinite = (a: Float32Array) => a.every((v) => Number.isFinite(v))

const everySeries = (m: GroundMotion) => [
  m.acc.x,
  m.acc.y,
  m.acc.z,
  m.disp.x,
  m.disp.y,
  m.disp.z,
]

describe('determinism', () => {
  it('the same seed gives identical output', () => {
    const a = generateGroundMotion(MEDIUM_QUAKE)
    const b = generateGroundMotion(MEDIUM_QUAKE)
    expect(Array.from(a.acc.x)).toEqual(Array.from(b.acc.x))
    expect(Array.from(a.disp.z)).toEqual(Array.from(b.disp.z))
  })

  it('a different seed gives different output with similar statistics', () => {
    const a = generateGroundMotion({ ...MEDIUM_QUAKE, seed: 1 })
    const b = generateGroundMotion({ ...MEDIUM_QUAKE, seed: 2 })
    expect(Array.from(a.acc.x)).not.toEqual(Array.from(b.acc.x))
    expect(a.pga).toBeCloseTo(b.pga, 6)
    expect(Math.abs(peak(a.acc.x) - peak(b.acc.x)) / peak(a.acc.x)).toBeLessThan(0.2)
  })
})

describe('intensity', () => {
  it('the peak acceleration equals the requested PGA, within 1%', () => {
    const m = generateGroundMotion(MEDIUM_QUAKE)
    expect(horizontalPeak(m)).toBeCloseTo(m.pga * G, 4)
    expect(Math.abs(horizontalPeak(m) - m.pga * G) / (m.pga * G)).toBeLessThan(0.01)
  })

  it('PGA decreases monotonically with distance', () => {
    const distances = [1, 2, 5, 10, 20, 50, 100, 150, 200]
    const pgas = distances.map((d) => predictPga(6.0, d))
    for (let i = 1; i < pgas.length; i++) expect(pgas[i]).toBeLessThan(pgas[i - 1])
  })

  it('PGA increases monotonically with magnitude', () => {
    const mags = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]
    const pgas = mags.map((m) => predictPga(m, 20))
    for (let i = 1; i < pgas.length; i++) expect(pgas[i]).toBeGreaterThan(pgas[i - 1])
  })

  it.each([
    { magnitude: 5.5, distanceKm: 10, expected: 0.2, reads: 'medium — the phase 5 default' },
    { magnitude: 5.0, distanceKm: 50, expected: 0.04, reads: 'barely felt' },
    { magnitude: 7.0, distanceKm: 10, expected: 0.7, reads: 'severe' },
    { magnitude: 7.0, distanceKm: 150, expected: 0.09, reads: 'long slow roll' },
  ])('M$magnitude at $distanceKm km reads as $reads (~$expected g)', (c) => {
    const pga = predictPga(c.magnitude, c.distanceKm)
    expect(Math.abs(pga - c.expected) / c.expected).toBeLessThan(0.3)
  })

  it('clamps extreme combinations into a solver-safe range', () => {
    expect(predictPga(8, 1)).toBeLessThanOrEqual(1.5)
    expect(predictPga(4, 200)).toBeGreaterThanOrEqual(0.005)
  })
})

describe('duration', () => {
  it('increases with magnitude', () => {
    const ds = [4, 5, 6, 7].map((m) => predictDuration(m, 10))
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1])
  })

  it('stays inside the 5–60 s clamp across the whole parameter range', () => {
    for (let m = 4; m <= 8; m += 0.5) {
      for (const d of [1, 10, 50, 100, 200]) {
        const dur = predictDuration(m, d)
        expect(dur).toBeGreaterThanOrEqual(MIN_DURATION)
        expect(dur).toBeLessThanOrEqual(MAX_DURATION)
      }
    }
  })

  it('is reflected in the generated record length', () => {
    const m = generateGroundMotion(MEDIUM_QUAKE)
    expect(m.samples).toBe(Math.round(m.duration / m.dt) + 1)
  })
})

describe('envelope', () => {
  const m = generateGroundMotion(MEDIUM_QUAKE)
  const p = peak(m.acc.x)

  it('starts quiet', () => {
    const head = m.acc.x.slice(0, Math.floor(m.samples * 0.01))
    expect(peak(head)).toBeLessThan(p * 0.2)
  })

  it('ends quiet', () => {
    const tail = m.acc.x.slice(Math.floor(m.samples * 0.99))
    expect(peak(tail)).toBeLessThan(p * 0.2)
  })

  it('peaks in the middle half of the record, not at an end', () => {
    let peakIndex = 0
    for (let i = 0; i < m.samples; i++) {
      if (Math.abs(m.acc.x[i]) > Math.abs(m.acc.x[peakIndex])) peakIndex = i
    }
    expect(peakIndex / m.samples).toBeGreaterThan(0.1)
    expect(peakIndex / m.samples).toBeLessThan(0.75)
  })
})

/** Naive DFT magnitude spectrum — fine at these sizes and needs no dependency. */
function spectrum(signal: Float32Array, dt: number, maxHz = 12, bins = 120) {
  const n = Math.min(signal.length, 4096)
  const out: { hz: number; mag: number }[] = []
  for (let b = 1; b <= bins; b++) {
    const hz = (b / bins) * maxHz
    const w = 2 * Math.PI * hz * dt
    let re = 0
    let im = 0
    for (let i = 0; i < n; i++) {
      re += signal[i] * Math.cos(w * i)
      im += signal[i] * Math.sin(w * i)
    }
    out.push({ hz, mag: Math.hypot(re, im) })
  }
  return out
}

const centroid = (s: { hz: number; mag: number }[]) =>
  s.reduce((acc, p) => acc + p.hz * p.mag, 0) / s.reduce((acc, p) => acc + p.mag, 0)

/**
 * A single realisation's spectrum is noisy enough that its argmax bounces around by a factor
 * of two. Averaging power across seeds estimates the underlying process spectrum, which is
 * what the Kanai–Tajimi filter actually shapes.
 */
function averagedSpectrum(params: Omit<QuakeParams, 'seed'>, seeds = 12) {
  let acc: { hz: number; mag: number }[] | null = null
  for (let s = 1; s <= seeds; s++) {
    const m = generateGroundMotion({ ...params, seed: s * 7919 })
    const sp = spectrum(m.acc.x, m.dt)
    if (!acc) acc = sp.map((p) => ({ hz: p.hz, mag: p.mag ** 2 }))
    else sp.forEach((p, i) => (acc![i].mag += p.mag ** 2))
  }
  return acc!
}

describe('frequency content', () => {
  it('the spectral peak sits near the soil frequency', () => {
    const s = averagedSpectrum({ magnitude: 6, distanceKm: 5, soil: 'firm' })
    const dominant = s.reduce((a, b) => (b.mag > a.mag ? b : a))
    const expectedHz = effectiveSoilFrequency('firm', 5) / (2 * Math.PI)
    expect(Math.abs(dominant.hz - expectedHz) / expectedHz).toBeLessThan(0.4)
  })

  it('soft soil shakes at a lower frequency than firm, and firm than rock', () => {
    const centroidOf = (soil: 'rock' | 'firm' | 'soft') =>
      centroid(averagedSpectrum({ magnitude: 6, distanceKm: 5, soil }))
    expect(centroidOf('soft')).toBeLessThan(centroidOf('firm'))
    expect(centroidOf('firm')).toBeLessThan(centroidOf('rock'))
  })

  it('a distant quake is lower-frequency than a near one — the physics behind the distance control', () => {
    const near = generateGroundMotion({ magnitude: 7, distanceKm: 5, seed: 3 })
    const far = generateGroundMotion({ magnitude: 7, distanceKm: 150, seed: 3 })
    expect(centroid(spectrum(far.acc.x, far.dt))).toBeLessThan(
      centroid(spectrum(near.acc.x, near.dt)),
    )
  })

  it('softer soil shifts the response to lower frequency than rock', () => {
    expect(effectiveSoilFrequency('soft', 10)).toBeLessThan(effectiveSoilFrequency('firm', 10))
    expect(effectiveSoilFrequency('firm', 10)).toBeLessThan(effectiveSoilFrequency('rock', 10))
  })
})

describe('integration to displacement', () => {
  const m = generateGroundMotion(MEDIUM_QUAKE)

  it('starts at zero', () => {
    expect(Math.abs(m.disp.x[0])).toBeLessThan(1e-6)
    expect(Math.abs(m.disp.z[0])).toBeLessThan(1e-6)
  })

  it('ends within 2 cm of zero — the ground does not drift away', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(Math.abs(m.disp[axis][m.samples - 1])).toBeLessThan(0.02)
    }
  })

  it('never exceeds the displacement clamp, for any parameters', () => {
    for (const p of [
      { magnitude: 8, distanceKm: 1, seed: 1 },
      { magnitude: 7.5, distanceKm: 8, seed: 2 },
      { magnitude: 4, distanceKm: 200, seed: 3 },
    ] satisfies QuakeParams[]) {
      const g = generateGroundMotion(p)
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(peak(g.disp[axis])).toBeLessThanOrEqual(MAX_DISPLACEMENT + 1e-9)
      }
    }
  })

  it('actually moves — a flat record would mean the integration collapsed', () => {
    expect(peak(m.disp.x)).toBeGreaterThan(1e-4)
  })
})

describe('components', () => {
  const m = generateGroundMotion(MEDIUM_QUAKE)

  it('the two horizontals are uncorrelated', () => {
    const n = m.samples
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / n
    const mx = mean(m.acc.x)
    const mz = mean(m.acc.z)
    let cov = 0
    let vx = 0
    let vz = 0
    for (let i = 0; i < n; i++) {
      const dx = m.acc.x[i] - mx
      const dz = m.acc.z[i] - mz
      cov += dx * dz
      vx += dx * dx
      vz += dz * dz
    }
    expect(Math.abs(cov / Math.sqrt(vx * vz))).toBeLessThan(0.3)
  })

  it('the vertical component is about half the horizontal', () => {
    expect(peak(m.acc.y) / horizontalPeak(m)).toBeCloseTo(0.5, 1)
  })

  it('bearing steers the horizontal energy toward the epicentre', () => {
    const alongX = generateGroundMotion({ ...MEDIUM_QUAKE, bearing: 0 })
    const alongZ = generateGroundMotion({ ...MEDIUM_QUAKE, bearing: Math.PI / 2 })
    expect(peak(alongX.acc.x)).toBeGreaterThan(peak(alongX.acc.z))
    expect(peak(alongZ.acc.z)).toBeGreaterThan(peak(alongZ.acc.x))
  })
})

describe('robustness', () => {
  it.each([
    { magnitude: 4, distanceKm: 200 },
    { magnitude: 8, distanceKm: 1 },
    { magnitude: 6, distanceKm: 1 },
    { magnitude: 4, distanceKm: 1 },
    { magnitude: 8, distanceKm: 200 },
  ])('M$magnitude at $distanceKm km produces finite arrays', (p) => {
    const m = generateGroundMotion({ ...p, seed: 42 })
    for (const series of everySeries(m)) expect(allFinite(series)).toBe(true)
  })

  it('produces no NaN or Infinity for any soil type', () => {
    for (const soil of ['rock', 'firm', 'soft'] as const) {
      const m = generateGroundMotion({ ...MEDIUM_QUAKE, soil })
      for (const series of everySeries(m)) expect(allFinite(series)).toBe(true)
    }
  })

  it('generates a 60 s record at 200 Hz in well under 50 ms', () => {
    const start = performance.now()
    generateGroundMotion({ magnitude: 8, distanceKm: 100, seed: 7 })
    expect(performance.now() - start).toBeLessThan(50)
  })

  it('records the parameters it actually used', () => {
    const m = generateGroundMotion(MEDIUM_QUAKE)
    expect(m.params).toMatchObject({ magnitude: 5.5, distanceKm: 10, soil: 'firm' })
    expect(m.dt).toBe(DEFAULT_DT)
  })
})

describe('sampleAt', () => {
  const m = generateGroundMotion(MEDIUM_QUAKE)

  it('returns the exact sample on a sample boundary', () => {
    expect(sampleAt(m, m.disp.x, 0)).toBeCloseTo(m.disp.x[0], 10)
    expect(sampleAt(m, m.disp.x, 10 * m.dt)).toBeCloseTo(m.disp.x[10], 10)
  })

  it('interpolates between samples', () => {
    const mid = sampleAt(m, m.disp.x, 10.5 * m.dt)
    expect(mid).toBeCloseTo((m.disp.x[10] + m.disp.x[11]) / 2, 10)
  })

  it('clamps outside the record instead of returning undefined', () => {
    expect(Number.isFinite(sampleAt(m, m.disp.x, -5))).toBe(true)
    expect(Number.isFinite(sampleAt(m, m.disp.x, m.duration * 10))).toBe(true)
  })
})
