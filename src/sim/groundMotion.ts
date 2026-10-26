import { gaussian, mulberry32 } from './random'

/**
 * Synthetic earthquake ground motion.
 *
 * Pure TypeScript over numbers — no Three.js, no Rapier, no DOM (enforced by the ESLint rule
 * in eslint.config.js). That is what makes the realism of this app testable.
 *
 * The recipe is the standard engineering one for synthetic accelerograms:
 *
 *   1. Gaussian white noise at `1/dt` Hz, from a seeded PRNG.
 *   2. A Kanai–Tajimi filter, representing the soil layer, concentrating energy around a
 *      dominant ground frequency. This is what makes the result an earthquake rather than a
 *      vibration.
 *   3. A Jennings envelope — quadratic rise, strong-motion plateau, exponential decay. Real
 *      quakes build, peak and fade; constant amplitude reads as fake within half a second.
 *   4. Rescale so the peak equals the PGA implied by magnitude and distance.
 *   5. Double-integrate to displacement with baseline correction, because the scene drives a
 *      kinematic ground *position*.
 */

export type SoilType = 'rock' | 'firm' | 'soft'

export interface QuakeParams {
  /** moment magnitude Mw, 4.0 – 8.0 */
  magnitude: number
  /** epicentral distance in km, 1 – 200 */
  distanceKm: number
  seed: number
  soil?: SoilType
  /** sample interval in seconds, default 1/200 */
  dt?: number
  /**
   * Epicentre bearing in radians, measured from +X toward +Z. Splits the horizontal energy
   * between the two axes so shaking runs along the line to the epicentre (phase 7.4).
   * Defaults to an equal split.
   */
  bearing?: number
}

export interface Components<T> {
  x: T
  y: T
  z: T
}

export interface GroundMotion {
  dt: number
  /** seconds */
  duration: number
  samples: number
  /** acceleration, m/s² */
  acc: Components<Float32Array>
  /** displacement, m — this is what drives the kinematic ground body */
  disp: Components<Float32Array>
  /** peak ground acceleration, in g */
  pga: number
  params: Required<Omit<QuakeParams, 'bearing'>> & { bearing: number | null }
}

export const G = 9.81

/** Soil column parameters for the Kanai–Tajimi filter. */
const SOIL: Record<SoilType, { omega: number; zeta: number }> = {
  rock: { omega: 25.0, zeta: 0.65 }, // fg ~ 4.0 Hz
  firm: { omega: 15.7, zeta: 0.6 }, // fg ~ 2.5 Hz
  soft: { omega: 8.0, zeta: 0.85 }, // fg ~ 1.3 Hz
}

export const DEFAULT_DT = 1 / 200
export const MIN_PGA_G = 0.005
export const MAX_PGA_G = 1.5
export const MIN_DURATION = 5
export const MAX_DURATION = 60
/** Beyond this the visual reads as the world sliding rather than shaking. */
export const MAX_DISPLACEMENT = 0.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Ground-motion prediction equation in the standard attenuation form:
 *
 *     log10(PGA_g) = a + b*M - c*log10(sqrt(R^2 + h^2))
 *
 * `h` is a focal-depth term. It stops PGA running to infinity as R approaches 0, which both
 * reflects a real rupture having finite depth and stops the slider at 1 km blowing the solver up.
 *
 * The coefficients are fitted to the four sanity values tabulated in plan/04-ground-motion.md
 * (0.20 g for M5.5 at 10 km, 0.04 g at M5/50 km, 0.70 g at M7/10 km, 0.09 g at M7/150 km) and
 * reproduce all four to within 5 %. The literal constants quoted alongside that table —
 * a = -1.55, b = 0.42, c = 1.0 — do not: they give 0.45 g and 1.92 g for the first and third,
 * more than double the intended intensity. The table is the requirement, so it wins.
 */
export function predictPga(magnitude: number, distanceKm: number): number {
  const a = -1.772
  const b = 0.363
  const c = 0.833
  const h = 8
  const r = Math.sqrt(distanceKm * distanceKm + h * h)
  const log10Pga = a + b * magnitude - c * Math.log10(r)
  return clamp(10 ** log10Pga, MIN_PGA_G, MAX_PGA_G)
}

/** Bigger ruptures take longer: an M5 shakes for seconds, an M7.5 for most of a minute. */
export function predictDuration(magnitude: number, distanceKm: number): number {
  return clamp(10 ** (0.31 * magnitude - 0.77) + 0.06 * distanceKm, MIN_DURATION, MAX_DURATION)
}

/**
 * Distance shifts the dominant frequency down: high frequencies attenuate faster than low
 * ones, so a distant quake arrives as a slow deep roll.
 *
 * This single line is why the distance control changes *which building falls over* rather than
 * merely how hard everything shakes. A near quake is a sharp rattle that punishes stiff
 * houses; a distant one is a long swell that punishes tall towers.
 */
export function effectiveSoilFrequency(soil: SoilType, distanceKm: number): number {
  return SOIL[soil].omega * (1 - 0.3 * Math.min(distanceKm / 150, 1))
}

/**
 * Kanai–Tajimi: pass white noise through a second-order soil filter.
 *
 *     y'' + 2*zeta*omega*y' + omega^2*y = -w(t)
 *
 * The filtered acceleration is the absolute acceleration of the soil mass,
 * -(2*zeta*omega*y' + omega^2*y). Integrated with semi-implicit Euler, which is stable here:
 * at dt = 1/200 and omega <= 25, omega*dt <= 0.125.
 */
function kanaiTajimi(
  noise: () => number,
  samples: number,
  dt: number,
  omega: number,
  zeta: number,
): Float32Array {
  const out = new Float32Array(samples)
  let y = 0
  let yd = 0
  for (let i = 0; i < samples; i++) {
    const w = noise()
    const ydd = -w - 2 * zeta * omega * yd - omega * omega * y
    yd += ydd * dt
    y += yd * dt
    out[i] = -(2 * zeta * omega * yd + omega * omega * y)
  }
  return out
}

/**
 * Jennings envelope: quadratic rise over the first 15 % of the record, a strong-motion
 * plateau to the halfway point, then exponential decay to ~5 % of peak at the end.
 *
 * The decay constant is expressed relative to the remaining time rather than as the absolute
 * rate in plan/04-ground-motion.md — that form decays to only 67 % of peak by the end of the
 * record whatever the duration, which leaves the quake stopping abruptly mid-shake.
 */
export function envelope(t: number, duration: number): number {
  const t1 = 0.15 * duration
  const t2 = 0.5 * duration
  if (t <= 0) return 0
  if (t < t1) return (t / t1) ** 2
  if (t <= t2) return 1
  return Math.exp((-3 * (t - t2)) / (duration - t2))
}

/** Cumulative trapezoidal integration, in place into `out`. */
function integrate(src: Float32Array, dt: number, out: Float32Array): Float32Array {
  let acc = 0
  out[0] = 0
  for (let i = 1; i < src.length; i++) {
    acc += ((src[i] + src[i - 1]) / 2) * dt
    out[i] = acc
  }
  return out
}

/**
 * Baseline correction: subtract a least-squares quadratic from the displacement.
 *
 * Naive double integration of noisy acceleration drifts badly — the ground wanders tens of
 * metres away and never comes back, taking the buildings with it. This is the single most
 * likely thing in this module to go wrong, so `groundMotion.test.ts` asserts on it directly.
 */
function baselineCorrect(d: Float32Array): Float32Array {
  const n = d.length
  if (n < 3) return d

  // Normal equations for a quadratic fit, in a normalised time variable to keep the 3x3
  // system well conditioned.
  let s0 = 0,
    s1 = 0,
    s2 = 0,
    s3 = 0,
    s4 = 0
  let b0 = 0,
    b1 = 0,
    b2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const t2 = t * t
    s0 += 1
    s1 += t
    s2 += t2
    s3 += t2 * t
    s4 += t2 * t2
    b0 += d[i]
    b1 += d[i] * t
    b2 += d[i] * t2
  }

  // Solve the symmetric 3x3 [[s0,s1,s2],[s1,s2,s3],[s2,s3,s4]] * [c0,c1,c2] = [b0,b1,b2]
  const m = [
    [s0, s1, s2, b0],
    [s1, s2, s3, b1],
    [s2, s3, s4, b2],
  ]
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    const p = m[col][col]
    if (Math.abs(p) < 1e-12) return d
    for (let j = col; j < 4; j++) m[col][j] /= p
    for (let row = 0; row < 3; row++) {
      if (row === col) continue
      const f = m[row][col]
      for (let j = col; j < 4; j++) m[row][j] -= f * m[col][j]
    }
  }
  const [c0, c1, c2] = [m[0][3], m[1][3], m[2][3]]

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    d[i] -= c0 + c1 * t + c2 * t * t
  }
  // The fit does not guarantee an exact zero at the ends; a tiny linear tilt does.
  const tilt0 = d[0]
  const tiltN = d[n - 1]
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    d[i] -= tilt0 + (tiltN - tilt0) * t
  }
  return d
}

/** One horizontal or vertical component: filtered noise, enveloped, scaled to `peak`. */
function component(
  seed: number,
  samples: number,
  dt: number,
  omega: number,
  zeta: number,
  duration: number,
  peak: number,
): Float32Array {
  const acc = kanaiTajimi(gaussian(mulberry32(seed)), samples, dt, omega, zeta)

  let maxAbs = 0
  for (let i = 0; i < samples; i++) {
    acc[i] *= envelope(i * dt, duration)
    const a = Math.abs(acc[i])
    if (a > maxAbs) maxAbs = a
  }

  // Scale AFTER filtering and enveloping, so neither step changes the intensity.
  const scale = maxAbs > 0 ? peak / maxAbs : 0
  for (let i = 0; i < samples; i++) acc[i] *= scale
  return acc
}

/** The Description's "for now, have a medium earthquake": M5.5 at 10 km, PGA ~ 0.2 g. */
export const MEDIUM_QUAKE: QuakeParams = { magnitude: 5.5, distanceKm: 10, seed: 1 }

export function generateGroundMotion(params: QuakeParams): GroundMotion {
  const {
    magnitude,
    distanceKm,
    seed,
    soil = 'firm',
    dt = DEFAULT_DT,
    bearing,
  } = params

  const duration = predictDuration(magnitude, distanceKm)
  const samples = Math.round(duration / dt) + 1
  const pga = predictPga(magnitude, distanceKm)
  const peak = pga * G

  const omega = effectiveSoilFrequency(soil, distanceKm)
  const zeta = SOIL[soil].zeta

  // Independent noise streams per axis. Sharing one stream would make the ground move along a
  // single diagonal line, which looks visibly artificial.
  const seedX = seed | 0
  const seedZ = (seed ^ 0x9e3779b9) | 0
  const seedY = (seed ^ 0x85ebca6b) | 0

  // Directionality: a quake due north shakes predominantly along Z. Without a bearing the
  // energy is split evenly. The weights keep the resultant horizontal peak equal to the PGA.
  const wx = bearing === undefined ? 1 : Math.abs(Math.cos(bearing))
  const wz = bearing === undefined ? 1 : Math.abs(Math.sin(bearing))
  // Never let an axis go fully silent — a purely 1-D shake looks like a conveyor belt.
  const ax = 0.25 + 0.75 * wx
  const az = 0.25 + 0.75 * wz

  const acc = {
    x: component(seedX, samples, dt, omega, zeta, duration, peak * ax),
    // Vertical motion is weaker and sharper than horizontal: half the amplitude, and a
    // stiffer soil response so its energy sits at higher frequency.
    y: component(seedY, samples, dt, omega * 1.6, zeta, duration, peak * 0.5),
    z: component(seedZ, samples, dt, omega, zeta, duration, peak * az),
  }

  const disp = {
    x: new Float32Array(samples),
    y: new Float32Array(samples),
    z: new Float32Array(samples),
  }
  const vel = new Float32Array(samples)
  for (const axis of ['x', 'y', 'z'] as const) {
    integrate(acc[axis], dt, vel)
    // Velocity drifts too, and an uncorrected velocity baseline becomes a ramp in
    // displacement that no quadratic fit can fully remove.
    baselineCorrect(vel)
    integrate(vel, dt, disp[axis])
    baselineCorrect(disp[axis])
  }

  // Clamp peak displacement to something physical, preserving the waveform shape.
  let maxDisp = 0
  for (const axis of ['x', 'y', 'z'] as const) {
    for (let i = 0; i < samples; i++) maxDisp = Math.max(maxDisp, Math.abs(disp[axis][i]))
  }
  if (maxDisp > MAX_DISPLACEMENT) {
    const k = MAX_DISPLACEMENT / maxDisp
    for (const axis of ['x', 'y', 'z'] as const) {
      for (let i = 0; i < samples; i++) disp[axis][i] *= k
    }
  }

  return {
    dt,
    duration,
    samples,
    acc,
    disp,
    pga,
    params: {
      magnitude,
      distanceKm,
      seed,
      soil,
      dt,
      bearing: bearing ?? null,
    },
  }
}

/** Linear interpolation into a record at time `t` seconds. Allocation-free playback. */
export function sampleAt(motion: GroundMotion, series: Float32Array, t: number): number {
  const x = t / motion.dt
  const i = Math.min(Math.max(Math.floor(x), 0), motion.samples - 2)
  const f = Math.min(Math.max(x - i, 0), 1)
  return series[i] + (series[i + 1] - series[i]) * f
}
