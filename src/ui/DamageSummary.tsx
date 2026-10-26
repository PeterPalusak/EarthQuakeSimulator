import { useEffect, useState } from 'react'
import { usePhysicsWorld } from '../scene/physicsAccess'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import {
  DAMAGE_LABELS,
  damageColour,
  summarise,
  tally,
  type BuildingDamage,
} from '../sim/damage'
import { useQuakeStore } from '../state/quakeStore'
import { useAppStore } from '../state/store'

interface Row extends BuildingDamage {
  instanceId: string
  label: string
  capacity: number
}

/** Shown when a quake finishes: how many buildings survived, and where the damage landed. */
export function DamageSummary() {
  const phase = useQuakeStore((s) => s.phase)
  const placed = useAppStore((s) => s.placed)
  const world = usePhysicsWorld()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (phase !== 'finished' || !world) {
      setRows(null)
      setDismissed(false)
      return
    }
    setRows(
      placed.map((p) => {
        const instance = world.get(p.instanceId)
        const spec = BUILDING_SPECS[p.type]
        return {
          instanceId: p.instanceId,
          label: spec.label,
          capacity: spec.driftCapacity,
          ...summarise(instance?.peakDrift ?? [], instance?.collapsed ?? false),
        }
      }),
    )
  }, [phase, world, placed])

  if (!rows || rows.length === 0 || dismissed) return null
  const counts = tally(rows)

  return (
    <div
      data-testid="damage-summary"
      className="pointer-events-auto absolute left-3 top-28 max-h-[55vh] w-60 overflow-y-auto rounded-xl bg-slate-900/85 p-3 text-white shadow-lg backdrop-blur"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">After the quake</h2>
        <button
          type="button"
          aria-label="Close damage summary"
          onClick={() => setDismissed(true)}
          className="-mt-1 min-h-[28px] rounded px-2 text-xs opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      </div>

      <p className="mb-2 text-xs" data-testid="damage-counts">
        <span className="text-emerald-400">{counts.intact} intact</span> ·{' '}
        <span className="text-amber-400">{counts.damaged} damaged</span> ·{' '}
        <span className="text-red-400">{counts.collapsed} collapsed</span>
      </p>

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.instanceId} className="text-[11px] leading-tight">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: damageColour(r.peak, r.capacity) }}
              />
              <span className="font-medium">{r.label}</span>
              <span className="ml-auto opacity-70">{DAMAGE_LABELS[r.state]}</span>
            </div>
            <div className="pl-4 font-mono opacity-60">
              peak drift {(r.peak * 100).toFixed(2)}% at storey {r.worstStorey + 1}
              {' · '}limit {(r.capacity * 100).toFixed(1)}%
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
