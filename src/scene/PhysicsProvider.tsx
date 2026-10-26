import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'
import { QuakeWorld } from '../physics/QuakeWorld'
import { initRapier } from '../physics/rapier'
import { useQuakeStore } from '../state/quakeStore'
import { useAppStore } from '../state/store'
import { usePhysicsStore, usePhysicsWorld } from './physicsAccess'

export const usePhysics = usePhysicsWorld

/**
 * Owns the single `QuakeWorld` and keeps its bodies in sync with the store's `placed` array.
 * Stepping happens here, once per frame, so every consumer sees the same post-step state.
 */
export function PhysicsProvider({ children }: { children: ReactNode }) {
  const world = usePhysicsWorld()
  const placed = useAppStore((s) => s.placed)
  const resetToken = useQuakeStore((s) => s.resetToken)
  const lastReset = useRef(resetToken)

  useEffect(() => {
    let disposed = false
    let created: QuakeWorld | null = null
    initRapier().then(() => {
      if (disposed) return
      created = new QuakeWorld()
      usePhysicsStore.getState().setWorld(created)
    })
    return () => {
      disposed = true
      usePhysicsStore.getState().setWorld(null)
      created?.dispose()
    }
  }, [])

  // Reconcile the physics world against the store: add what is new, remove what is gone.
  //
  // A reset bumps `resetToken`, which tears every body down and rebuilds it from `placed`.
  // Teleporting bodies back into place instead tends to leave residual velocity and broken
  // joint state behind, so a collapsed building would never truly come back.
  useEffect(() => {
    if (!world) return
    if (resetToken !== lastReset.current) {
      lastReset.current = resetToken
      world.clear()
    }
    const wanted = new Set(placed.map((p) => p.instanceId))
    for (const b of world.list()) {
      if (!wanted.has(b.instanceId)) world.removeBuilding(b.instanceId)
    }
    for (const p of placed) {
      if (!world.get(p.instanceId)) world.addBuilding(p.instanceId, p.type, p.position)
    }
  }, [world, placed, resetToken])

  useFrame((_, delta) => {
    world?.step(delta)
  })

  return <>{children}</>
}
