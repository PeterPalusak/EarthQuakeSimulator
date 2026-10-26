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
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-end gap-2 p-3 sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:justify-center">
          <QuakeButton />
          <QuakeControls />
        </div>
      </div>
    </div>
  )
}
