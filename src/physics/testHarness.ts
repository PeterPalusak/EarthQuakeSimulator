import { FIXED_TIMESTEP, QuakeWorld, type BuildingInstance } from './QuakeWorld'
import { initRapier } from './rapier'
import type { BuildingTypeId } from '../sim/buildingSpecs'

/** Shared helpers for the headless physics tests. No renderer, no React. */

export async function headlessWorld(options: ConstructorParameters<typeof QuakeWorld>[0] = {}) {
  await initRapier()
  return new QuakeWorld(options)
}

export function settle(world: QuakeWorld, seconds = 2) {
  for (let i = 0; i < Math.round(seconds / FIXED_TIMESTEP); i++) world.stepOnce()
}

export function run(world: QuakeWorld, seconds: number, onStep?: (step: number) => void) {
  const steps = Math.round(seconds / FIXED_TIMESTEP)
  for (let i = 0; i < steps; i++) {
    onStep?.(i)
    world.stepOnce()
  }
}

export const roofOf = (b: BuildingInstance) => b.bodies[b.bodies.length - 1]

/** Horizontal distance of a floor from where the building was placed. */
export function lateralOffset(b: BuildingInstance, i: number): number {
  const t = b.bodies[i].translation()
  return Math.hypot(t.x - b.origin[0], t.z - b.origin[1])
}

/**
 * Free-vibration period of a building's roof, measured by upward zero crossings after a
 * lateral impulse. Damping is zeroed for the measurement — it would otherwise skew the period.
 */
export async function measureFreeVibrationPeriod(type: BuildingTypeId): Promise<number> {
  const { BUILDING_SPECS, targetPeriod } = await import('../sim/buildingSpecs')
  const spec = BUILDING_SPECS[type]
  const damping = spec.storeyDamping
  spec.storeyDamping = 0

  // Collapse off: the measurement impulse is deliberately large, and a storey tearing out
  // mid-measurement would change the structure being measured.
  const world = await headlessWorld({ collapse: false })
  try {
    const b = world.addBuilding('calib', type, [0, 0])
    settle(world, 2)

    const roof = roofOf(b)
    roof.applyImpulse({ x: spec.floorMass * 0.2, y: 0, z: 0 }, true)

    const xs: number[] = []
    const steps = Math.round((targetPeriod(spec.floors) * 12) / FIXED_TIMESTEP)
    for (let i = 0; i < steps; i++) {
      world.stepOnce()
      xs.push(roof.translation().x)
    }

    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const crossings: number[] = []
    for (let i = 1; i < xs.length; i++) {
      if (xs[i - 1] - mean <= 0 && xs[i] - mean > 0) crossings.push(i * FIXED_TIMESTEP)
    }
    if (crossings.length < 3) return NaN
    const used = crossings.slice(0, 5)
    return (used.at(-1)! - used[0]) / (used.length - 1)
  } finally {
    world.dispose()
    spec.storeyDamping = damping
  }
}
