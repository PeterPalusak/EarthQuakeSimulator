import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { FIXED_TIMESTEP } from '../physics/QuakeWorld'
import { sampleAt } from '../sim/groundMotion'
import { useQuakeStore } from '../state/quakeStore'
import { usePhysics } from './PhysicsProvider'

/**
 * Drives the kinematic ground from the phase 4 displacement record.
 *
 * **Shake the ground, never the buildings.** The buildings are dynamic bodies anchored to the
 * ground; they respond through their own inertia, exactly like the real thing. Applying forces
 * to buildings directly would be far easier and would look like a puppet show: every building
 * moving in lockstep, with no resonance, no height dependence, and no reason for one building
 * to fail while its neighbour survives. The entire value of phases 3 and 4 evaporates if this
 * principle is broken under schedule pressure.
 *
 * The camera is deliberately *not* parented to the ground. A camera that shakes with the
 * ground makes the ground look stationary and the buildings look like they are flailing for no
 * reason — precisely backwards.
 */
export function QuakeDriver() {
  const world = usePhysics()
  const phase = useQuakeStore((s) => s.phase)

  /** Seconds into the current record, advanced on the physics clock rather than frame deltas. */
  const clock = useRef(0)
  const playing = useRef<object | null>(null)
  const stepsThisFrame = useRef(0)

  useEffect(() => {
    if (!world) return

    world.onBeforeStep = () => {
      const { phase: current, motion } = useQuakeStore.getState()

      if (current !== 'running' || !motion) {
        playing.current = null
        const t = world.ground.translation()
        // Settle the ground back to the origin, so a quake interrupted by a reset does not
        // leave the world a few centimetres off.
        if (t.x !== 0 || t.y !== 0 || t.z !== 0) world.setGroundTranslation(0, 0, 0)
        return
      }

      if (playing.current !== motion) {
        playing.current = motion
        clock.current = 0
        world.wakeAll()
      }

      // Interpolate: the record is 200 Hz and the simulation 120 Hz, and sampling unevenly
      // adds a high-frequency buzz on top of the intended motion.
      world.setGroundTranslation(
        sampleAt(motion, motion.disp.x, clock.current),
        sampleAt(motion, motion.disp.y, clock.current),
        sampleAt(motion, motion.disp.z, clock.current),
      )
      clock.current += FIXED_TIMESTEP
      stepsThisFrame.current++
    }

    return () => {
      world.onBeforeStep = null
    }
  }, [world])

  // Advance the store's clock by exactly the simulated time, not by the frame delta, so the
  // progress readout can never drift away from what the physics actually played.
  useFrame(() => {
    if (stepsThisFrame.current === 0) return
    useQuakeStore.getState().tick(stepsThisFrame.current * FIXED_TIMESTEP)
    stepsThisFrame.current = 0
  })

  useEffect(() => {
    if (phase === 'running') world?.wakeAll()
  }, [phase, world])

  return null
}
