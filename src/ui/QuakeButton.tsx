import { useAppStore } from '../state/store'
import { previewIntensity, useQuakeStore } from '../state/quakeStore'

/** The red button from the requirement: right side, vertically centred, unmistakable. */
export function QuakeButton() {
  const phase = useQuakeStore((s) => s.phase)
  const start = useQuakeStore((s) => s.start)
  const reset = useQuakeStore((s) => s.reset)
  const elapsed = useQuakeStore((s) => s.elapsed)
  const motion = useQuakeStore((s) => s.motion)
  const settings = useQuakeStore((s) => s.settings)
  const placedCount = useAppStore((s) => s.placed.length)

  const running = phase === 'running'
  const preview = previewIntensity(settings)
  const duration = motion?.duration ?? preview.duration
  const pga = motion?.pga ?? preview.pga
  const progress = running && motion ? Math.min(elapsed / motion.duration, 1) : 0

  return (
    <div className="pointer-events-auto absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Start earthquake"
        disabled={running}
        onClick={start}
        className="relative h-24 w-24 rounded-full bg-red-600 text-base font-bold tracking-wide text-white
                   shadow-lg ring-4 ring-red-900/40 transition active:scale-95
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? `${(duration - elapsed).toFixed(1)}s` : 'QUAKE'}
        {running && (
          <span
            aria-hidden="true"
            className="absolute inset-x-3 bottom-5 h-1 overflow-hidden rounded-full bg-red-900/50"
          >
            <span
              className="block h-full bg-white/80"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        )}
      </button>

      {/* Scaffolding for phase 7, but it earns its place now: during tuning you constantly
          need to know whether you are watching a 0.2 g shake or solver nonsense. */}
      <div
        data-testid="quake-readout"
        className="rounded-lg bg-slate-900/75 px-2 py-1 text-center font-mono text-[10px] leading-tight text-white shadow backdrop-blur"
      >
        <div>M {settings.magnitude.toFixed(1)}</div>
        <div>{settings.distanceKm} km</div>
        <div>{pga.toFixed(3)} g</div>
        <div>{duration.toFixed(1)} s</div>
      </div>

      {phase !== 'idle' && (
        <button
          type="button"
          aria-label="Reset buildings"
          onClick={reset}
          disabled={running}
          className="min-h-[40px] rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white shadow active:bg-slate-600 disabled:opacity-50"
        >
          Reset
        </button>
      )}

      {placedCount === 0 && phase === 'idle' && (
        <p className="max-w-28 text-center text-[10px] leading-tight text-white/70">
          Pick a building above, then tap the ground
        </p>
      )}
    </div>
  )
}
