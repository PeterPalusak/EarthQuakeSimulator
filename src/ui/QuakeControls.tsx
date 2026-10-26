import { useState } from 'react'
import {
  MAX_MAGNITUDE,
  MIN_MAGNITUDE,
  PRESETS,
  distanceLabel,
  distanceToSlider,
  magnitudeLabel,
  sliderToDistance,
} from '../sim/quakeScales'
import { previewIntensity, useQuakeStore } from '../state/quakeStore'

/**
 * Magnitude and epicentre distance: *"Later I would like to have a choice of how strong the
 * earthquake can be and how far away of the place it can be located."*
 *
 * Native `<input type="range">` throughout. It has correct touch behaviour, keyboard support
 * and accessibility for free, and a custom slider on a touchscreen is a surprising amount of
 * work to get right and will fight OrbitControls for pointer events.
 */
export function QuakeControls() {
  const settings = useQuakeStore((s) => s.settings)
  const setSettings = useQuakeStore((s) => s.setSettings)
  const phase = useQuakeStore((s) => s.phase)
  const running = phase === 'running'
  // Collapsible because the panel sits over the build area — full width along the bottom on a
  // phone — and the ground underneath it has to stay reachable.
  // Collapsed by default on a phone, where the panel would otherwise take a third of the
  // screen before the user has even placed a building.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640)

  // Cheap: these are closed-form, so moving a slider never generates a full record.
  const { pga, duration } = previewIntensity(settings)
  const distance = Math.round(settings.distanceKm)

  // Sliders must not let their drags reach the canvas, or adjusting one orbits the camera.
  const stop = (e: React.PointerEvent | React.TouchEvent) => e.stopPropagation()

  return (
    <div
      onPointerDown={stop}
      onTouchStart={stop}
      className="pointer-events-auto w-full max-w-md sm:w-72"
    >
      <div className="rounded-xl bg-slate-900/85 p-3 text-white shadow-lg backdrop-blur">
        <button
          type="button"
          aria-label={open ? 'Hide quake settings' : 'Show quake settings'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-m-1 mb-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg p-1 text-left text-xs font-semibold"
        >
          <span>Earthquake</span>
          <span className="ml-auto font-mono font-normal opacity-70">
            M {settings.magnitude.toFixed(1)} · {distance} km
          </span>
          <span aria-hidden="true" className="opacity-60">
            {open ? '▾' : '▸'}
          </span>
        </button>

        {open && (
        <>
        <label className="block">
          <span className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Magnitude</span>
            <span className="font-mono">
              {settings.magnitude.toFixed(1)}{' '}
              <span className="opacity-70">{magnitudeLabel(settings.magnitude)}</span>
            </span>
          </span>
          <input
            type="range"
            aria-label="Earthquake magnitude"
            min={MIN_MAGNITUDE}
            max={MAX_MAGNITUDE}
            step={0.1}
            value={settings.magnitude}
            disabled={running}
            onChange={(e) => setSettings({ magnitude: +e.target.value })}
            className="mt-1 w-full accent-red-500 disabled:opacity-50"
          />
        </label>

        <label className="mt-2 block">
          <span className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Epicentre distance</span>
            <span className="font-mono">
              {distance} km <span className="opacity-70">{distanceLabel(distance)}</span>
            </span>
          </span>
          <input
            type="range"
            aria-label="Epicentre distance"
            min={0}
            max={1}
            step={0.001}
            value={distanceToSlider(settings.distanceKm)}
            disabled={running}
            onChange={(e) => setSettings({ distanceKm: sliderToDistance(+e.target.value) })}
            className="mt-1 w-full accent-red-500 disabled:opacity-50"
          />
        </label>

        {/* What connects two abstract sliders to a consequence the user can feel. */}
        <p data-testid="intensity-preview" className="mt-2 font-mono text-[11px] opacity-80">
          shaking {pga.toFixed(3)} g · lasting {duration.toFixed(0)} s
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active =
              Math.abs(settings.magnitude - p.magnitude) < 0.05 &&
              Math.abs(settings.distanceKm - p.distanceKm) < 0.5
            return (
              <button
                key={p.id}
                type="button"
                aria-label={p.name}
                aria-pressed={active}
                title={p.shows}
                disabled={running}
                onClick={() => setSettings({ magnitude: p.magnitude, distanceKm: p.distanceKm })}
                className={[
                  'min-h-[36px] flex-1 whitespace-nowrap rounded-lg px-2 text-[11px] font-medium transition',
                  active
                    ? 'bg-slate-700 ring-2 ring-amber-400'
                    : 'bg-slate-800 ring-1 ring-white/10 active:bg-slate-700',
                  'disabled:opacity-50',
                ].join(' ')}
              >
                {p.name}
              </button>
            )
          })}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
