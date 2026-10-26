import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshStandardMaterial, type Group } from 'three'
import { BUILDING_SPECS, FLOOR_HEIGHT, floorCentreY } from '../sim/buildingSpecs'
import { useAppStore } from '../state/store'
import { ghostState } from './placementPointer'
import { UNIT_BOX } from './sharedGeometry'

const VALID = '#4ade80'
const INVALID = '#ef4444'

/** Semi-transparent preview of the selected building, snapped to the 1 m grid under the finger. */
export function PlacementGhost() {
  const selectedType = useAppStore((s) => s.selectedType)
  const group = useRef<Group>(null)

  // One shared material for every floor, so a single colour write re-tints the whole ghost.
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: VALID,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.visible = ghostState.active
    if (!g.visible) return
    g.position.set(ghostState.x, 0, ghostState.z)
    material.color.set(ghostState.valid ? VALID : INVALID)
  })

  if (!selectedType) return null
  const spec = BUILDING_SPECS[selectedType]
  const [w, d] = spec.footprint

  return (
    <group ref={group} visible={false}>
      {Array.from({ length: spec.floors }, (_, i) => (
        <mesh
          key={i}
          geometry={UNIT_BOX}
          material={material}
          // raycast off — otherwise the ghost intercepts its own pointer events and sticks
          raycast={() => null}
          position={[0, floorCentreY(i), 0]}
          scale={[w, FLOOR_HEIGHT * 0.98, d]}
        />
      ))}
    </group>
  )
}
