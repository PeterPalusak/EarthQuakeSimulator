import { Scene } from './scene/Scene'
import { BuildingPalette } from './ui/BuildingPalette'
import { DamageSummary } from './ui/DamageSummary'
import { MotionDebugPanel } from './ui/MotionDebugPanel'
import { QuakeButton } from './ui/QuakeButton'
import { QuakeControls } from './ui/QuakeControls'
import { SelectionControls } from './ui/SelectionControls'

export default function App() {
  return (
    <div className="relative h-full w-full bg-slate-900">
      <Scene />
      {/* pointer-events-none on the overlay with pointer-events-auto on the actual controls is
          what lets a drag starting on empty overlay space still orbit the camera. */}
      <div className="pointer-events-none absolute inset-0">
        <BuildingPalette />
        <DamageSummary />
        <SelectionControls />
        <MotionDebugPanel />

        {/* The red button and the quake settings share one column so they cannot overlap:
            stacked along the bottom on a phone, a right-hand column on anything wider. */}
        {/* Anchored to the bottom and growing upward. Centring it vertically overflows past
            the top of a short window — a laptop in landscape — and collides with the palette. */}
        <div className="absolute inset-x-0 bottom-0 flex max-h-full flex-col items-end justify-end gap-2 overflow-y-auto p-3 pt-24 sm:inset-x-auto sm:inset-y-0 sm:right-0">
          <QuakeButton />
          <QuakeControls />
        </div>
      </div>
    </div>
  )
}
