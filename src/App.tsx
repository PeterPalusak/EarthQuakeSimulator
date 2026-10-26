import { Scene } from './scene/Scene'
import { BuildingPalette } from './ui/BuildingPalette'
import { DamageSummary } from './ui/DamageSummary'
import { MotionDebugPanel } from './ui/MotionDebugPanel'
import { QuakeButton } from './ui/QuakeButton'
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
        <QuakeButton />
      </div>
    </div>
  )
}
