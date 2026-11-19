import type { BuildingSpec } from '../sim/buildingSpecs'
import { FINGERS_PER_FLOOR } from '../sim/cladding'

/** A tiny side-on silhouette: one band per floor, so the palette reads at a glance. */
export function BuildingIcon({ spec }: { spec: BuildingSpec }) {
  const maxFloors = 12
  const w = 18
  const h = 30
  const floorH = h / maxFloors
  const barH = spec.floors * floorH
  const top = h - barH

  if (spec.appearance === 'fishFingers') {
    // Drawn as separate bars, alternating between one wide bar and a row of narrow ones, so
    // the criss-cross stacking is recognisable at 18 px.
    const courseH = floorH * 0.72
    const narrow = (w - 2 - (FINGERS_PER_FLOOR - 1)) / FINGERS_PER_FLOOR
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
        {Array.from({ length: spec.floors }, (_, i) => {
          const y = h - (i + 1) * floorH + (floorH - courseH) / 2
          return i % 2 === 0 ? (
            Array.from({ length: FINGERS_PER_FLOOR }, (_, j) => (
              <rect
                key={`${i}-${j}`}
                x={1 + j * (narrow + 1)}
                y={y}
                width={narrow}
                height={courseH}
                fill={spec.colour}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={0.3}
              />
            ))
          ) : (
            <rect
              key={i}
              x={1}
              y={y}
              width={w - 2}
              height={courseH}
              fill={spec.colour}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.3}
            />
          )
        })}
      </svg>
    )
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <rect
        x={1}
        y={top}
        width={w - 2}
        height={barH}
        rx={1}
        fill={spec.colour}
        stroke="rgba(0,0,0,0.35)"
      />
      {Array.from({ length: spec.floors - 1 }, (_, i) => (
        <line
          key={i}
          x1={1}
          x2={w - 1}
          y1={h - (i + 1) * floorH}
          y2={h - (i + 1) * floorH}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  )
}
