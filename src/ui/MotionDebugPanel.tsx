import { useMemo, useState } from 'react'
import {
  G,
  MEDIUM_QUAKE,
  generateGroundMotion,
  type GroundMotion,
  type QuakeParams,
} from '../sim/groundMotion'

/**
 * Dev-only plot of the generated acceleration and displacement records.
 *
 * Worth the thirty minutes it costs: a wrong envelope or a drifting baseline is obvious in a
 * plot and invisible in a column of numbers. Gated on `import.meta.env.DEV` so it never ships.
 */

const WIDTH = 520
const ROW_HEIGHT = 46

function Trace({
  series,
  label,
  unit,
  colour,
}: {
  series: Float32Array
  label: string
  unit: string
  colour: string
}) {
  const { path, peak } = useMemo(() => {
    let max = 0
    for (const v of series) max = Math.max(max, Math.abs(v))
    const scale = max > 0 ? (ROW_HEIGHT / 2 - 2) / max : 0
    // One point per pixel column: a 12 000-sample path would be pointless and slow.
    const step = Math.max(1, Math.floor(series.length / WIDTH))
    let d = ''
    for (let i = 0, x = 0; i < series.length; i += step, x++) {
      d += `${i === 0 ? 'M' : 'L'}${x} ${(ROW_HEIGHT / 2 - series[i] * scale).toFixed(2)}`
    }
    return { path: d, peak: max }
  }, [series])

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-right font-mono text-[10px] opacity-70">{label}</span>
      <svg width={WIDTH} height={ROW_HEIGHT} className="shrink-0 rounded bg-slate-950/60">
        <line
          x1={0}
          x2={WIDTH}
          y1={ROW_HEIGHT / 2}
          y2={ROW_HEIGHT / 2}
          stroke="#334155"
          strokeWidth={1}
        />
        <path d={path} fill="none" stroke={colour} strokeWidth={1} />
      </svg>
      <span className="w-24 shrink-0 font-mono text-[10px] opacity-70">
        ±{peak.toPrecision(3)} {unit}
      </span>
    </div>
  )
}

export function MotionDebugPanel() {
  const [open, setOpen] = useState(false)
  const [params, setParams] = useState<QuakeParams>(MEDIUM_QUAKE)

  const motion: GroundMotion | null = useMemo(
    () => (open ? generateGroundMotion(params) : null),
    [open, params],
  )

  if (!import.meta.env.DEV) return null

  return (
    <div className="pointer-events-auto absolute bottom-28 left-3 text-white">
      <button
        type="button"
        aria-label="Toggle ground motion debug plot"
        onClick={() => setOpen((v) => !v)}
        className="min-h-[36px] rounded-lg bg-slate-900/80 px-3 text-xs font-medium shadow backdrop-blur active:bg-slate-700"
      >
        {open ? 'Hide' : 'Show'} signal
      </button>

      {open && motion && (
        <div className="mt-2 max-w-[calc(100vw-1.5rem)] overflow-x-auto rounded-xl bg-slate-900/90 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1">
              M
              <input
                type="range"
                min={4}
                max={8}
                step={0.1}
                value={params.magnitude}
                onChange={(e) => setParams({ ...params, magnitude: +e.target.value })}
              />
              <span className="w-8 font-mono">{params.magnitude.toFixed(1)}</span>
            </label>
            <label className="flex items-center gap-1">
              R
              <input
                type="range"
                min={1}
                max={200}
                step={1}
                value={params.distanceKm}
                onChange={(e) => setParams({ ...params, distanceKm: +e.target.value })}
              />
              <span className="w-12 font-mono">{params.distanceKm} km</span>
            </label>
            <span className="font-mono opacity-80">
              PGA {motion.pga.toFixed(3)} g · {motion.duration.toFixed(1)} s ·{' '}
              {motion.samples} samples
            </span>
          </div>

          <Trace series={motion.acc.x} label="acc x" unit="m/s²" colour="#f87171" />
          <Trace series={motion.acc.y} label="acc y" unit="m/s²" colour="#fbbf24" />
          <Trace series={motion.acc.z} label="acc z" unit="m/s²" colour="#60a5fa" />
          <Trace series={motion.disp.x} label="disp x" unit="m" colour="#4ade80" />
          <Trace series={motion.disp.y} label="disp y" unit="m" colour="#a78bfa" />
          <Trace series={motion.disp.z} label="disp z" unit="m" colour="#2dd4bf" />

          <p className="mt-1 font-mono text-[10px] opacity-60">
            peak acc should equal PGA x g = {(motion.pga * G).toFixed(3)} m/s²; displacement
            must start and end at zero.
          </p>
        </div>
      )}
    </div>
  )
}
