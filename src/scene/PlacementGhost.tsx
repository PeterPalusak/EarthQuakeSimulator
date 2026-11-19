import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshStandardMaterial, type Group } from 'three'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { buildStructure } from '../sim/structure'
import { useAppStore } from '../state/store'
import { ghostState } from './placementPointer'
import { UNIT_BOX } from './sharedGeometry'

const VALID = '#4ade80'
const INVALID = '#ef4444'
/** Snapped onto a neighbour — worth its own colour, or a snap is invisible until you let go. */
const CONNECTED = '#38bdf8'

/** Semi-transparent preview of the selected building, snapped to the 1 m grid under the finger. */
export function PlacementGhost() {
  const selectedType = useAppStore((s) => s.selectedType)
  const rotation = useAppStore((s) => s.rotation)
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
    material.color.set(
      !ghostState.valid ? INVALID : ghostState.connected ? CONNECTED : VALID,
    )
  })

  if (!selectedType) return null
  const spec = BUILDING_SPECS[selectedType]
  // Built with the same generator the physics will use, so the preview is the real shape at
  // the real orientation — what you see is exactly what gets placed.
  const { nodes } = buildStructure(spec, rotation)

  return (
    <group ref={group} visible={false}>
      {nodes.map((node, i) => (
        <mesh
          key={i}
          geometry={UNIT_BOX}
          material={material}
          // raycast off — otherwise the ghost intercepts its own pointer events and sticks
          raycast={() => null}
          position={node.offset}
          scale={[node.half[0] * 2, node.half[1] * 2 * 0.98, node.half[2] * 2]}
        />
      ))}
    </group>
  )
}
