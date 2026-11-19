import { create } from 'zustand'
import type { BuildingTypeId } from '../sim/buildingSpecs'
import { findSnap } from '../sim/connect'
import { canPlace, snapPosition, type PlacedBuilding } from '../sim/placement'
import type { Quarter } from '../sim/structure'

/**
 * Flat and serialisable by design — no Three.js objects, no refs. Those live in the scene and
 * are looked up by `instanceId`. Keeps the store testable in plain Vitest.
 */
export interface AppState {
  selectedType: BuildingTypeId | null
  /** An already-placed building the user tapped, for deletion. */
  selectedInstanceId: string | null
  placed: PlacedBuilding[]
  /** Orientation the next placement will use. Sticky, so a row of road is a row of taps. */
  rotation: Quarter

  select: (t: BuildingTypeId | null) => void
  selectInstance: (instanceId: string | null) => void
  /** Turns the pending placement, or the selected building if there is one. */
  rotate: () => void
  /** Returns the new instanceId, or null if the position was rejected. */
  place: (t: BuildingTypeId, pos: [number, number]) => string | null
  remove: (instanceId: string) => void
  clear: () => void
}

/**
 * Where a piece actually ends up: snapped flush onto a neighbouring road or bridge if one is
 * within reach, otherwise snapped to the 1 m grid as usual.
 *
 * Shared with the placement preview so the ghost shows exactly where the piece will land —
 * a preview that does not account for the snap would jump on release.
 */
export function resolvePlacement(
  type: BuildingTypeId,
  pos: [number, number],
  rotation: Quarter,
  placed: PlacedBuilding[],
): { position: [number, number]; connected: boolean } {
  const gridded = snapPosition(pos[0], pos[1])
  const snap = findSnap(type, gridded, rotation, placed)
  return snap ? { position: snap.position, connected: true } : { position: gridded, connected: false }
}

let instanceCounter = 0
const nextInstanceId = () => `b${++instanceCounter}`

export const useAppStore = create<AppState>((set, get) => ({
  selectedType: null,
  selectedInstanceId: null,
  placed: [],
  rotation: 0,

  select: (t) => set({ selectedType: t, selectedInstanceId: null }),

  selectInstance: (instanceId) => set({ selectedInstanceId: instanceId }),

  rotate: () =>
    set((s) => {
      const next = ((s.rotation + 1) & 3) as Quarter
      // With a building selected, turning it in place is the obvious reading of "rotate" —
      // but only where it still fits, so a turn can never shove it into a neighbour.
      if (s.selectedInstanceId) {
        const target = s.placed.find((p) => p.instanceId === s.selectedInstanceId)
        if (target) {
          const others = s.placed.filter((p) => p.instanceId !== target.instanceId)
          if (!canPlace(target.type, target.position, others, 1, next)) return { rotation: next }
          return {
            rotation: next,
            placed: s.placed.map((p) =>
              p.instanceId === target.instanceId ? { ...p, rotation: next } : p,
            ),
          }
        }
      }
      return { rotation: next }
    }),

  place: (type, pos) => {
    const { placed, rotation } = get()
    const { position, connected } = resolvePlacement(type, pos, rotation, placed)
    // A connected piece sits flush against its neighbour, so the usual 1 m breathing space
    // between structures would reject exactly the placement being asked for. Touching faces
    // are not an overlap: the box test is strict on both sides.
    if (!canPlace(type, position, placed, connected ? 0 : 1, rotation)) return null

    const instanceId = nextInstanceId()
    set({ placed: [...placed, { instanceId, type, position, rotation }] })
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
  useAppStore.setState({
    selectedType: null,
    selectedInstanceId: null,
    placed: [],
    rotation: 0,
  })
