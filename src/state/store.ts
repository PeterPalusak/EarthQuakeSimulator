import { create } from 'zustand'
import type { BuildingTypeId } from '../sim/buildingSpecs'
import { canPlace, snapPosition, type PlacedBuilding } from '../sim/placement'

/**
 * Flat and serialisable by design — no Three.js objects, no refs. Those live in the scene and
 * are looked up by `instanceId`. Keeps the store testable in plain Vitest.
 */
export interface AppState {
  selectedType: BuildingTypeId | null
  /** An already-placed building the user tapped, for deletion. */
  selectedInstanceId: string | null
  placed: PlacedBuilding[]

  select: (t: BuildingTypeId | null) => void
  selectInstance: (instanceId: string | null) => void
  /** Returns the new instanceId, or null if the position was rejected. */
  place: (t: BuildingTypeId, pos: [number, number]) => string | null
  remove: (instanceId: string) => void
  clear: () => void
}

let instanceCounter = 0
const nextInstanceId = () => `b${++instanceCounter}`

export const useAppStore = create<AppState>((set, get) => ({
  selectedType: null,
  selectedInstanceId: null,
  placed: [],

  select: (t) => set({ selectedType: t, selectedInstanceId: null }),

  selectInstance: (instanceId) => set({ selectedInstanceId: instanceId }),

  place: (type, pos) => {
    const position = snapPosition(pos[0], pos[1])
    const { placed } = get()
    if (!canPlace(type, position, placed)) return null

    const instanceId = nextInstanceId()
    set({ placed: [...placed, { instanceId, type, position }] })
    return instanceId
  },

  remove: (instanceId) =>
    set((s) => ({
      placed: s.placed.filter((p) => p.instanceId !== instanceId),
      selectedInstanceId: s.selectedInstanceId === instanceId ? null : s.selectedInstanceId,
    })),

  clear: () => set({ placed: [], selectedInstanceId: null }),
}))

/** Test helper — zustand stores are module singletons, so tests must reset them. */
export const resetAppStore = () =>
  useAppStore.setState({ selectedType: null, selectedInstanceId: null, placed: [] })
