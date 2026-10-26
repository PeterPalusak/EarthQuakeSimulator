import type { BuildingTypeId } from '../sim/buildingSpecs'
import { generateGroundMotion, sampleAt, type QuakeParams } from '../sim/groundMotion'
import { FIXED_TIMESTEP, QuakeWorld } from './QuakeWorld'
import { initRapier } from './rapier'

/**
 * Plays a generated quake into a headless Rapier world and reports what happened.
 *
 * This is the same code path the app runs — `QuakeWorld` plus the phase 4 record driving the
 * kinematic ground — with the renderer and React removed. Used by the physics regression
 * tests, which is the only way those tests can assert on what the user actually sees.
 */

export interface LayoutEntry {
  type: BuildingTypeId
  position: [number, number]
}

export interface BuildingOutcome {
  type: BuildingTypeId
  /** Peak horizontal displacement of the roof relative to the ground, metres. */
  peakRoofDrift: number
  /** Peak horizontal displacement of the lowest floor relative to the ground, metres. */
  peakBaseDrift: number
  /** Peak interstorey drift ratio over the whole run. */
  peakDrift: number
  /** Where the peak drift occurred — storey index, 0 being ground-to-first-floor. */
  worstStorey: number
  collapsed: boolean
  /** How far the base ended up from where it was placed, metres. */
  finalBaseOffset: number
  /** Speed of the roof at the very last step, m/s. Instantaneous, so it aliases — compare
   *  envelopes with `lateRoofSpeed` rather than reading anything into this one. */
  finalRoofSpeed: number
  /** Highest roof speed seen at any point during the run, m/s. */
  peakRoofSpeed: number
  /** Highest roof speed over the final second — the envelope of whatever is still ringing. */
  lateRoofSpeed: number
  /**
   * Peak horizontal roof displacement over the final second, metres.
   *
   * This, not a velocity, is the honest measure of "has it stopped swaying". The solver leaves
   * a sub-millimetre, high-frequency buzz in the stack that never fully dies; it is invisible
   * and structurally meaningless, but because speed is amplitude x frequency it dominates any
   * velocity-based settling check.
   */
  lateRoofDrift: number
}

export interface QuakeOutcome {
  buildings: BuildingOutcome[]
  finalGround: { x: number; y: number; z: number }
  peakGroundOffset: number
  sawNaN: boolean
  duration: number
}

export interface RunOptions {
  /** Let storeys fail when they exceed their drift capacity. On by default. */
  collapse?: boolean
  /** Extra seconds simulated after the record ends, to let things settle or fall. */
  settleAfter?: number
  /** Called every fixed step with the world, e.g. to drive collapse logic. */
  onStep?: (world: QuakeWorld, simTime: number) => void
}

export async function runQuake(
  params: QuakeParams,
  layout: LayoutEntry[],
  { settleAfter = 2, onStep, collapse = true }: RunOptions = {},
): Promise<QuakeOutcome> {
  await initRapier()
  const world = new QuakeWorld({ collapse })

  try {
    const instances = layout.map((entry, i) =>
      world.addBuilding(`b${i}`, entry.type, entry.position),
    )

    // Let gravity and the joints settle before the shaking starts.
    for (let i = 0; i < Math.round(1 / FIXED_TIMESTEP); i++) world.stepOnce()

    const motion = generateGroundMotion(params)
    const quakeSteps = Math.round(motion.duration / FIXED_TIMESTEP)
    const settleSteps = Math.round(settleAfter / FIXED_TIMESTEP)

    const peakRoof = new Array(instances.length).fill(0)
    const peakBase = new Array(instances.length).fill(0)
    const peakSpeed = new Array(instances.length).fill(0)
    const lateSpeed = new Array(instances.length).fill(0)
    const lateDrift = new Array(instances.length).fill(0)
    let peakGroundOffset = 0
    let sawNaN = false

    let clock = 0
    world.onBeforeStep = () => {
      if (clock > motion.duration) {
        // Hold the ground explicitly at the origin rather than just stopping: a kinematic
        // body that is never given a new target keeps the last one, and the residual offset
        // would read as a permanent lean on every building.
        world.setGroundTranslation(0, 0, 0)
        return
      }
      world.setGroundTranslation(
        sampleAt(motion, motion.disp.x, clock),
        sampleAt(motion, motion.disp.y, clock),
        sampleAt(motion, motion.disp.z, clock),
      )
      clock += FIXED_TIMESTEP
    }

    const totalSteps = quakeSteps + settleSteps
    const lateFrom = totalSteps - Math.round(1 / FIXED_TIMESTEP)
    for (let step = 0; step < totalSteps; step++) {
      world.stepOnce()
      onStep?.(world, step * FIXED_TIMESTEP)

      const g = world.ground.translation()
      peakGroundOffset = Math.max(peakGroundOffset, Math.hypot(g.x, g.y, g.z))

      instances.forEach((b, i) => {
        const roof = world.floorDrift(b, b.bodies.length - 1)
        const base = world.floorDrift(b, 0)
        peakRoof[i] = Math.max(peakRoof[i], Math.hypot(roof[0], roof[1]))
        peakBase[i] = Math.max(peakBase[i], Math.hypot(base[0], base[1]))
        const v = b.bodies[b.bodies.length - 1].linvel()
        const speed = Math.hypot(v.x, v.y, v.z)
        peakSpeed[i] = Math.max(peakSpeed[i], speed)
        if (step >= lateFrom) {
          lateSpeed[i] = Math.max(lateSpeed[i], speed)
          lateDrift[i] = Math.max(lateDrift[i], Math.hypot(roof[0], roof[1]))
        }
        for (const body of b.bodies) {
          const t = body.translation()
          if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) {
            sawNaN = true
          }
        }
      })
    }

    const buildings: BuildingOutcome[] = instances.map((b, i) => {
      const worstStorey = b.peakDrift.indexOf(Math.max(...b.peakDrift))
      const baseT = b.bodies[0].translation()
      const g = world.ground.translation()
      const roofVel = b.bodies[b.bodies.length - 1].linvel()
      return {
        type: b.type,
        peakRoofDrift: peakRoof[i],
        peakBaseDrift: peakBase[i],
        peakDrift: Math.max(...b.peakDrift),
        worstStorey,
        collapsed: b.collapsed,
        finalBaseOffset: Math.hypot(
          baseT.x - g.x - b.origin[0],
          baseT.z - g.z - b.origin[1],
        ),
        finalRoofSpeed: Math.hypot(roofVel.x, roofVel.y, roofVel.z),
        peakRoofSpeed: peakSpeed[i],
        lateRoofSpeed: lateSpeed[i],
        lateRoofDrift: lateDrift[i],
      }
    })

    const g = world.ground.translation()
    return {
      buildings,
      finalGround: { x: g.x, y: g.y, z: g.z },
      peakGroundOffset,
      sawNaN,
      duration: motion.duration,
    }
  } finally {
    world.dispose()
  }
}
