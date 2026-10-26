/**
 * Phase 3.4 — derive `storeyStiffness` per building type instead of guessing it.
 *
 * For each type: build the stack headlessly, push the roof, let it ring with damping off,
 * measure the free-vibration period between successive peaks, and bisect on stiffness until
 * the period is within tolerance of `targetPeriod(floors)` = 0.1 s per storey.
 *
 * Run with `npm run calibrate`, then paste the printed numbers into src/sim/buildingSpecs.ts.
 * The *assertion* version of this lives in src/physics/QuakeWorld.test.ts so later tuning
 * cannot silently break the periods.
 */
import { QuakeWorld, FIXED_TIMESTEP } from '../src/physics/QuakeWorld'
import { initRapier } from '../src/physics/rapier'
import { BUILDING_LIST, BUILDING_SPECS, targetPeriod } from '../src/sim/buildingSpecs'

await initRapier()

/** Measure the free-vibration period of a stack built with `stiffness`. */
function measurePeriod(type: keyof typeof BUILDING_SPECS, stiffness: number): number {
  const spec = BUILDING_SPECS[type]
  const original = { k: spec.storeyStiffness, c: spec.storeyDamping }
  // Damping is kept near zero during calibration, or it skews the measured period.
  spec.storeyStiffness = stiffness
  spec.storeyDamping = 0

  const w = new QuakeWorld()
  const b = w.addBuilding('calib', type, [0, 0])

  // Let gravity settle the stack before exciting it.
  for (let i = 0; i < 240; i++) w.stepOnce()

  const roof = b.bodies[b.bodies.length - 1]
  roof.applyImpulse({ x: spec.floorMass * 0.2, y: 0, z: 0 }, true)

  const target = targetPeriod(spec.floors)
  const steps = Math.ceil((target * 12) / FIXED_TIMESTEP)
  const xs: number[] = []
  for (let i = 0; i < steps; i++) {
    w.stepOnce()
    xs.push(roof.translation().x)
  }
  w.dispose()

  spec.storeyStiffness = original.k
  spec.storeyDamping = original.c

  // Upward zero crossings of the roof displacement, after removing any static offset.
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const crossings: number[] = []
  for (let i = 1; i < xs.length; i++) {
    if (xs[i - 1] - mean <= 0 && xs[i] - mean > 0) crossings.push(i * FIXED_TIMESTEP)
  }
  if (crossings.length < 3) return NaN
  // Early cycles only: Rapier's constraint solver bleeds amplitude over time, and the later
  // crossings are noise riding on a decayed signal.
  const used = crossings.slice(0, 5)
  return (used.at(-1)! - used[0]) / (used.length - 1)
}

console.log('type            floors  target T   measured T   stiffness (N/m)   damping (N.s/m)')
console.log('-'.repeat(84))

for (const spec of BUILDING_LIST) {
  const target = targetPeriod(spec.floors)

  // T scales as 1/sqrt(k), so a fixed-point iteration on k *= (T_measured / T_target)^2
  // converges in two or three passes — far more robust than bisecting on a noisy measurement.
  let k = spec.storeyStiffness
  let measured = NaN

  for (let iter = 0; iter < 8; iter++) {
    const t = measurePeriod(spec.id, k)
    if (!Number.isFinite(t)) {
      k /= 2 // too stiff to resolve at this timestep — soften and retry
      continue
    }
    measured = t
    if (Math.abs(measured - target) / target < 0.005) break
    k *= (measured / target) ** 2
  }

  // Damping ratio of 5 % of critical for the first mode: c = 2 * zeta * k / omega1
  const omega1 = (2 * Math.PI) / target
  const damping = (2 * 0.05 * k) / omega1

  const err = ((measured - target) / target) * 100
  console.log(
    `${spec.id.padEnd(15)} ${String(spec.floors).padStart(2)}    ${target.toFixed(3)} s   ` +
      `${measured.toFixed(4)} s (${err >= 0 ? '+' : ''}${err.toFixed(1)}%)   ` +
      `${k.toExponential(3).padStart(10)}      ${damping.toExponential(3)}`,
  )
}
