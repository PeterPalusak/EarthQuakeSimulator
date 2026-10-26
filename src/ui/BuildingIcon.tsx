import type { BuildingSpec } from '../sim/buildingSpecs'

/** A tiny side-on silhouette: one band per floor, so the palette reads at a glance. */
export function BuildingIcon({ spec }: { spec: BuildingSpec }) {
  const maxFloors = 12
  const w = 18
  const h = 30
  const floorH = h / maxFloors
  const barH = spec.floors * floorH

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <rect
        x={1}
        y={h - barH}
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
