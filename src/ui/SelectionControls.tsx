import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { useAppStore } from '../state/store'

/**
 * Shown when an already-placed building is tapped with no build tool selected.
 * Needed more for testing than for the requirement: from phase 3 on, every iteration is
 * place -> quake -> reset, and without deletion each cycle needs a page reload.
 */
export function SelectionControls() {
  const selectedInstanceId = useAppStore((s) => s.selectedInstanceId)
  const placed = useAppStore((s) => s.placed)
  const remove = useAppStore((s) => s.remove)
  const selectInstance = useAppStore((s) => s.selectInstance)

  const building = placed.find((p) => p.instanceId === selectedInstanceId)
  if (!building) return null
  const spec = BUILDING_SPECS[building.type]

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900/85 px-3 py-2 text-white shadow-lg backdrop-blur">
      <span className="text-sm">
        {spec.label}{' '}
        <span className="opacity-60">
          at {building.position[0]}, {building.position[1]} m
        </span>
      </span>
      <button
        type="button"
        aria-label={`Delete ${spec.label}`}
        onClick={() => remove(building.instanceId)}
        className="min-h-[40px] rounded-lg bg-red-600 px-3 text-sm font-semibold active:bg-red-700"
      >
        Delete
      </button>
      <button
        type="button"
        aria-label="Deselect building"
        onClick={() => selectInstance(null)}
        className="min-h-[40px] rounded-lg bg-slate-700 px-3 text-sm active:bg-slate-600"
      >
        Close
      </button>
    </div>
  )
}
