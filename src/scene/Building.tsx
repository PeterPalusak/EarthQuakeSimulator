import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, type Mesh } from 'three'
import { BUILDING_SPECS, FLOOR_HEIGHT, floorCentreY } from '../sim/buildingSpecs'
import type { PlacedBuilding } from '../sim/placement'
import { useAppStore } from '../state/store'
import { usePhysics } from './PhysicsProvider'
import { UNIT_BOX } from './sharedGeometry'

/**
 * One mesh per floor, driven every frame from the matching Rapier body. The physics world is
 * the source of truth; this component only reads it.
 */
export function Building({ building }: { building: PlacedBuilding }) {
  const spec = BUILDING_SPECS[building.type]
  const [w, d] = spec.footprint
  const [x, z] = building.position
  const world = usePhysics()
  const meshes = useRef<(Mesh | null)[]>([])

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

  useFrame(() => {
    const instance = world?.get(building.instanceId)
    if (!instance) return
    for (let i = 0; i < instance.bodies.length; i++) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const t = instance.bodies[i].translation()
      const r = instance.bodies[i].rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  })

  return (
    <group>
      {Array.from({ length: spec.floors }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => (meshes.current[i] = m)}
          geometry={UNIT_BOX}
          castShadow
          receiveShadow
          // Starting pose; from the first frame the physics world drives it.
          position={[x, floorCentreY(i), z]}
          scale={[w, FLOOR_HEIGHT, d]}
          onClick={(e) => {
            // Only a selection target when no build tool is active, otherwise tapping a
            // building would be ambiguous with placing one next to it.
            if (selectedType) return
            e.stopPropagation()
            selectInstance(building.instanceId)
          }}
        >
          <meshStandardMaterial color={floorColours[i]} roughness={0.85} />
        </mesh>
      ))}

      {isSelected && (
        <mesh position={[x, spec.floors * FLOOR_HEIGHT + 2, z]} raycast={() => null}>
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
