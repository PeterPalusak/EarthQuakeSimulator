import { useFrame } from '@react-three/fiber'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { QuakeWorld } from '../physics/QuakeWorld'
import { initRapier } from '../physics/rapier'
import { useAppStore } from '../state/store'

const PhysicsContext = createContext<QuakeWorld | null>(null)

export const usePhysics = () => useContext(PhysicsContext)

/**
 * Owns the single `QuakeWorld` and keeps its bodies in sync with the store's `placed` array.
 * Stepping happens here, once per frame, so every consumer sees the same post-step state.
 */
export function PhysicsProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState<QuakeWorld | null>(null)
  const placed = useAppStore((s) => s.placed)

  useEffect(() => {
    let disposed = false
    let created: QuakeWorld | null = null
    initRapier().then(() => {
      if (disposed) return
      created = new QuakeWorld()
      setWorld(created)
    })
    return () => {
      disposed = true
      created?.dispose()
      setWorld(null)
    }
  }, [])

  // Reconcile the physics world against the store: add what is new, remove what is gone.
  useEffect(() => {
    if (!world) return
    const wanted = new Set(placed.map((p) => p.instanceId))
    for (const b of world.list()) {
      if (!wanted.has(b.instanceId)) world.removeBuilding(b.instanceId)
    }
    for (const p of placed) {
      if (!world.get(p.instanceId)) world.addBuilding(p.instanceId, p.type, p.position)
    }
  }, [world, placed])

  useFrame((_, delta) => {
    world?.step(delta)
  })

  const value = useMemo(() => world, [world])
  return <PhysicsContext.Provider value={value}>{children}</PhysicsContext.Provider>
}
