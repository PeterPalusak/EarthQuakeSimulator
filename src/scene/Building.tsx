import { useMemo } from 'react'
import { Color } from 'three'
import { BUILDING_SPECS, FLOOR_HEIGHT, floorCentreY } from '../sim/buildingSpecs'
import type { PlacedBuilding } from '../sim/placement'
import { useAppStore } from '../state/store'
import { UNIT_BOX } from './sharedGeometry'

/**
 * Phase 2: a static stack of floor meshes. Phase 3 replaces each floor with a Rapier rigid
 * body without changing the specs, the palette or the placement logic.
 */
export function Building({ building }: { building: PlacedBuilding }) {
  const spec = BUILDING_SPECS[building.type]
  const [w, d] = spec.footprint
  const [x, z] = building.position
  const selectInstance = useAppStore((s) => s.selectInstance)
  const selectedType = useAppStore((s) => s.selectedType)
  const isSelected = useAppStore((s) => s.selectedInstanceId === building.instanceId)

  // Alternate every other floor very slightly, so storeys are readable at a distance
  // without any extra geometry or textures.
  const floorColours = useMemo(() => {
    const base = new Color(spec.colour)
    return Array.from({ length: spec.floors }, (_, i) =>
      base.clone().multiplyScalar(i % 2 === 0 ? 1 : 0.9),
    )
  }, [spec])

  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: spec.floors }, (_, i) => (
        <mesh
          key={i}
          geometry={UNIT_BOX}
          castShadow
          receiveShadow
          position={[0, floorCentreY(i), 0]}
          scale={[w, FLOOR_HEIGHT, d]}
          onClick={(e) => {
            // Only act as a selection target when no build tool is active, otherwise
            // tapping a building would be ambiguous with placing next to it.
            if (selectedType) return
            e.stopPropagation()
            selectInstance(building.instanceId)
          }}
        >
          <meshStandardMaterial color={floorColours[i]} roughness={0.85} />
        </mesh>
      ))}

      {isSelected && (
        <mesh position={[0, spec.floors * FLOOR_HEIGHT + 2, 0]} raycast={() => null}>
          <sphereGeometry args={[0.8, 12, 8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      )}
    </group>
  )
}

export function Buildings() {
  const placed = useAppStore((s) => s.placed)
  return (
    <>
      {placed.map((b) => (
        <Building key={b.instanceId} building={b} />
      ))}
    </>
  )
}
