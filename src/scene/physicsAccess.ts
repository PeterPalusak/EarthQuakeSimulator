import { create } from 'zustand'
import type { QuakeWorld } from '../physics/QuakeWorld'

/**
 * The live physics world, published outside the react-three-fiber tree.
 *
 * The damage summary is part of the HTML overlay, not the canvas, so it sits outside the
 * `<Canvas>` React root and cannot reach an r3f context. A tiny store serves both sides.
 */
interface PhysicsHandle {
  world: QuakeWorld | null
  setWorld: (world: QuakeWorld | null) => void
}

export const usePhysicsStore = create<PhysicsHandle>((set) => ({
  world: null,
  setWorld: (world) => set({ world }),
}))

export const usePhysicsWorld = () => usePhysicsStore((s) => s.world)
