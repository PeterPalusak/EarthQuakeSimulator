import { useEffect } from 'react'
import { BUILDING_LIST, partLabel } from '../sim/buildingSpecs'
import { useAppStore } from '../state/store'
import { BuildingIcon } from './BuildingIcon'

export function BuildingPalette() {
  const selectedType = useAppStore((s) => s.selectedType)
  const select = useAppStore((s) => s.select)
  const placed = useAppStore((s) => s.placed)
  const clear = useAppStore((s) => s.clear)
  const rotation = useAppStore((s) => s.rotation)
  const rotate = useAppStore((s) => s.rotate)

  // R to turn, the convention anyone who has placed objects in a game already knows. Phones
  // get the button; this is just the desktop shortcut for the same action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      rotate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate])

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 p-2 sm:p-3">
      {/* Constrained height so the canvas owns everything below it — an overflow container
          here otherwise swallows vertical drags near the top of the screen on Android. */}
      <div className="pointer-events-auto flex gap-2 overflow-x-auto rounded-xl bg-slate-900/75 p-2 shadow-lg backdrop-blur">
        {BUILDING_LIST.map((spec) => {
          const isSelected = selectedType === spec.id
          return (
            <button
              key={spec.id}
              type="button"
              aria-label={spec.label}
              aria-pressed={isSelected}
              onClick={() => select(isSelected ? null : spec.id)}
              className={[
                // 44x44 px minimum: smaller is unhittable with a thumb on a phone
                'flex min-h-[56px] min-w-[72px] flex-col items-center justify-end gap-1',
                'rounded-lg px-2 py-1.5 text-center text-white transition',
                isSelected
                  ? 'bg-slate-700 ring-2 ring-amber-400'
                  : 'bg-slate-800/80 ring-1 ring-white/10 active:bg-slate-700',
              ].join(' ')}
            >
              <BuildingIcon spec={spec} />
              <span className="whitespace-nowrap text-[11px] font-medium leading-tight">
                {spec.label}
              </span>
              <span className="text-[10px] leading-none opacity-70">
                {partLabel(spec)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="pointer-events-auto ml-auto flex flex-col items-end gap-1">
        <button
          type="button"
          aria-label="Rotate 90 degrees"
          title="Rotate (R)"
          onClick={rotate}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-slate-900/75 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur active:bg-slate-700"
        >
          <span
            aria-hidden="true"
            className="inline-block transition-transform"
            style={{ transform: `rotate(${rotation * 90}deg)` }}
          >
            &#8631;
          </span>
          {rotation * 90}&deg;
        </button>
        <span
          data-testid="placed-count"
          className="rounded-lg bg-slate-900/75 px-2 py-1 text-xs text-white shadow backdrop-blur"
        >
          {placed.length} placed
        </span>
        {placed.length > 0 && (
          <button
            type="button"
            aria-label="Clear all buildings"
            onClick={clear}
            className="min-h-[36px] rounded-lg bg-slate-900/75 px-3 py-1 text-xs font-medium text-white shadow backdrop-blur active:bg-slate-700"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
