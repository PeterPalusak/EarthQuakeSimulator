import { create } from 'zustand'
import {
  MEDIUM_QUAKE,
  generateGroundMotion,
  predictDuration,
  predictPga,
  type GroundMotion,
  type QuakeParams,
} from '../sim/groundMotion'

export type QuakePhase = 'idle' | 'running' | 'finished'

export interface QuakeSettings {
  /** 4.0 – 8.0 */
  magnitude: number
  /** 1 – 200 km */
  distanceKm: number
  /** Bearing of the epicentre in radians, from +X toward +Z. */
  bearing: number
}

export interface QuakeState {
  phase: QuakePhase
  /** Generated on start and held for playback. Null while idle. */
  motion: GroundMotion | null
  /** Seconds since the quake started. */
  elapsed: number
  settings: QuakeSettings

  start: () => void
  tick: (dt: number) => void
  /** Back to idle, ready for another run. */
  reset: () => void
  setSettings: (patch: Partial<QuakeSettings>) => void
  /** Bumped by `reset()`; the scene watches it to rebuild the physics bodies. */
  resetToken: number
}

export const DEFAULT_SETTINGS: QuakeSettings = {
  magnitude: MEDIUM_QUAKE.magnitude,
  distanceKm: MEDIUM_QUAKE.distanceKm,
  bearing: Math.PI / 4,
}

/** A fresh seed per press, so two runs of the same settings are never identical. */
const freshSeed = () => (Math.random() * 0xffffffff) >>> 0

export const useQuakeStore = create<QuakeState>((set, get) => ({
  phase: 'idle',
  motion: null,
  elapsed: 0,
  settings: { ...DEFAULT_SETTINGS },
  resetToken: 0,

  start: () => {
    // A second press mid-quake would corrupt `elapsed`, so starting while running is a no-op.
    if (get().phase === 'running') return
    const { magnitude, distanceKm, bearing } = get().settings
    // Generated on press, not on mount: a 60 s record is wasted work if the button is
    // never tapped, and generating per frame would make the result framerate-dependent.
    const motion = generateGroundMotion({
      magnitude,
      distanceKm,
      bearing,
      seed: freshSeed(),
    } satisfies QuakeParams)
    set({ phase: 'running', motion, elapsed: 0 })
  },

  tick: (dt) => {
    const { phase, motion, elapsed } = get()
    if (phase !== 'running' || !motion) return
    const next = elapsed + dt
    if (next >= motion.duration) set({ elapsed: motion.duration, phase: 'finished' })
    else set({ elapsed: next })
  },

  reset: () =>
    set((s) => ({
      phase: 'idle',
      motion: null,
      elapsed: 0,
      resetToken: s.resetToken + 1,
    })),

  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
}))

/** Cheap derived readout for the UI — no full record generated. */
export const previewIntensity = (s: QuakeSettings) => ({
  pga: predictPga(s.magnitude, s.distanceKm),
  duration: predictDuration(s.magnitude, s.distanceKm),
})

export const resetQuakeStore = () =>
  useQuakeStore.setState({
    phase: 'idle',
    motion: null,
    elapsed: 0,
    settings: { ...DEFAULT_SETTINGS },
    resetToken: 0,
  })
