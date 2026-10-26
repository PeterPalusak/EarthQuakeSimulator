import type { ThreeEvent } from '@react-three/fiber'
import { useRef } from 'react'
import { isTap, type PointerSample } from '../sim/gesture'
import { canPlace, snapPosition } from '../sim/placement'
import { useAppStore } from '../state/store'
import { GROUND_SIZE } from './Ground'
import { ghostState } from './placementPointer'

/**
 * An invisible plane at ground level that owns pointer interaction: it raycasts the finger
 * position, drives the ghost, and places a building on a tap.
 *
 * It sits just above the ground mesh so it always wins the raycast against it, and below
 * every building so tapping a building still hits the building.
 */
export function PlacementPlane() {
  const down = useRef<PointerSample | null>(null)

  const sample = (e: ThreeEvent<PointerEvent>): PointerSample => ({
    x: e.nativeEvent.clientX,
    y: e.nativeEvent.clientY,
    time: e.nativeEvent.timeStamp,
  })

  const updateGhost = (e: ThreeEvent<PointerEvent>) => {
    const { selectedType, placed } = useAppStore.getState()
    if (!selectedType) {
      ghostState.active = false
      return
    }
    const [x, z] = snapPosition(e.point.x, e.point.z)
    ghostState.active = true
    ghostState.valid = canPlace(selectedType, [x, z], placed)
    ghostState.x = x
    ghostState.z = z
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0]}
      // Not `visible={false}` — Three's raycaster skips invisible objects outright.
      renderOrder={-1}
      onPointerDown={(e) => {
        down.current = sample(e)
        updateGhost(e)
      }}
      onPointerMove={updateGhost}
      onPointerLeave={() => {
        ghostState.active = false
      }}
      onPointerUp={(e) => {
        const start = down.current
        down.current = null
        updateGhost(e)
        if (!start || !isTap(start, sample(e))) return

        const { selectedType, place, selectInstance } = useAppStore.getState()
        if (!selectedType) {
          selectInstance(null) // tapping empty ground deselects
          return
        }
        place(selectedType, [e.point.x, e.point.z])
      }}
    >
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  )
}
