import { FLOOR_HEIGHT } from './buildingSpecs'

/**
 * Damage assessment by interstorey drift ratio.
 *
 * Description.md §3.3 suggests a breaking *impulse* threshold on the joints. Drift ratio is
 * both better engineering and easier to implement:
 *
 *   1. It is a position difference, readable from any physics engine, with no dependence on
 *      the joint-motor API that turned out to be the version-sensitive part of phase 3.
 *   2. It gives graded damage for free, so the same number drives colour-coded damage states
 *      rather than a binary intact/collapsed.
 *   3. It is a real quantity an engineer would recognise, with published thresholds, rather
 *      than an engine-specific tuning number.
 */

export type DamageState = 'none' | 'light' | 'severe' | 'collapse'

/** Standard earthquake-engineering damage thresholds, as drift ratios. */
export const DAMAGE_THRESHOLDS = {
  light: 0.005, // 0.5 % — cracking begins
  severe: 0.015, // 1.5 % — structural damage
  collapse: 0.025, // 2.5 % — collapse
} as const

/** Horizontal offset between two consecutive floors, divided by the storey height. */
export function driftRatio(
  lower: { x: number; z: number },
  upper: { x: number; z: number },
  storeyHeight = FLOOR_HEIGHT,
): number {
  return Math.hypot(upper.x - lower.x, upper.z - lower.z) / storeyHeight
}

export function damageState(drift: number): DamageState {
  if (drift >= DAMAGE_THRESHOLDS.collapse) return 'collapse'
  if (drift >= DAMAGE_THRESHOLDS.severe) return 'severe'
  if (drift >= DAMAGE_THRESHOLDS.light) return 'light'
  return 'none'
}

export const DAMAGE_LABELS: Record<DamageState, string> = {
  none: 'Intact',
  light: 'Light damage',
  severe: 'Severe damage',
  collapse: 'Collapsed',
}

/** Green -> yellow -> orange -> red, interpolated against the building's own capacity. */
export function damageColour(drift: number, capacity: number): string {
  const t = Math.min(drift / Math.max(capacity, 1e-9), 1)
  const stops: [number, [number, number, number]][] = [
    [0, [0x7c, 0xb3, 0x42]],
    [0.4, [0xe3, 0xc5, 0x3f]],
    [0.75, [0xe0, 0x8a, 0x2f]],
    [1, [0xc2, 0x32, 0x2d]],
  ]
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      lo = stops[i - 1]
      hi = stops[i]
      break
    }
  }
  const span = hi[0] - lo[0] || 1
  const k = (t - lo[0]) / span
  const ch = (a: number, b: number) => Math.round(a + (b - a) * k)
  const [r, g, b] = [ch(lo[1][0], hi[1][0]), ch(lo[1][1], hi[1][1]), ch(lo[1][2], hi[1][2])]
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface BuildingDamage {
  /** Peak drift ratio over the whole run. */
  peak: number
  /** Index of the storey that took the most punishment — often not the one people expect. */
  worstStorey: number
  state: DamageState
  collapsed: boolean
}

export function summarise(peakDrift: number[], collapsed: boolean): BuildingDamage {
  let worstStorey = 0
  for (let i = 1; i < peakDrift.length; i++) {
    if (peakDrift[i] > peakDrift[worstStorey]) worstStorey = i
  }
  const peak = peakDrift.length ? peakDrift[worstStorey] : 0
  return {
    peak,
    worstStorey,
    state: collapsed ? 'collapse' : damageState(peak),
    collapsed,
  }
}

export interface DamageTally {
  intact: number
  damaged: number
  collapsed: number
}

export function tally(all: BuildingDamage[]): DamageTally {
  return {
    intact: all.filter((d) => d.state === 'none').length,
    damaged: all.filter((d) => d.state === 'light' || d.state === 'severe').length,
    collapsed: all.filter((d) => d.state === 'collapse').length,
  }
}
