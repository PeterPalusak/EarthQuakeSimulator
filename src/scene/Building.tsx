import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MeshStandardMaterial, type Mesh } from 'three'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { buildStructure } from '../sim/structure'
import { damageColour } from '../sim/damage'
import type { PlacedBuilding } from '../sim/placement'
import { useAppStore } from '../state/store'
import { FishFingerFloors } from './FishFingerFloors'
import { usePhysics } from './PhysicsProvider'
import { UNIT_BOX } from './sharedGeometry'

/**
 * One mesh per floor, driven every frame from the matching Rapier body. The physics world is
 * the source of truth; this component only reads it.
 *
 * Floors are tinted by the peak drift their storey has taken — green through yellow and orange
 * to red. That is what turns the app from a toy into something that explains a concept: after
 * a quake you can see at a glance *which* storey took the punishment, and it is usually not
 * the one people expect.
 *
 * A type with a decorative `appearance` draws its floors separately; the per-floor meshes then
 * stay as invisible hit boxes, because the decoration is instanced and cannot carry pointer
 * events of its own.
 */
export function Building({ building }: { building: PlacedBuilding }) {
  const spec = BUILDING_SPECS[building.type]
  const [x, z] = building.position
  // The same generator the physics uses, so the meshes cannot drift out of step with the
  // colliders — one description of the geometry, two consumers.
  const { nodes } = useMemo(
    () => buildStructure(spec, building.rotation),
    [spec, building.rotation],
  )
  const world = usePhysics()
  const meshes = useRef<(Mesh | null)[]>([])
  const clad = spec.appearance === 'fishFingers'

  const selectInstance = useAppStore((s) => s.selectInstance)
  const selectedType = useAppStore((s) => s.selectedType)
  const isSelected = useAppStore((s) => s.selectedInstanceId === building.instanceId)

  // A material per floor so each can carry its own damage tint. Alternating floors are
  // slightly darker so storeys stay readable at a distance without extra geometry.
  //
  // When the floors are drawn as cladding these become pure hit boxes: still raycastable —
  // three skips `visible === false` objects entirely — but writing neither colour nor depth.
  const materials = useMemo(
    () =>
      nodes.map((_node, i) =>
        clad
          ? new MeshStandardMaterial({
              transparent: true,
              opacity: 0,
              depthWrite: false,
              colorWrite: false,
            })
          : new MeshStandardMaterial({
              color: new Color(spec.colour).multiplyScalar(i % 2 === 0 ? 1 : 0.9),
              roughness: 0.85,
            }),
      ),
    [spec, clad, nodes],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const undamaged = useMemo(() => materials.map((m) => m.color.clone()), [materials])
  const tint = useRef(new Color())

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
      // A failed storey loses its columns and is crushed: the physics collider is flattened
      // on failure, and the mesh has to follow or floors visibly interpenetrate.
      // A node is crushed when the link that was holding it up has failed.
      const crushed = instance.links.some((l, li) => l.to === i && instance.joints[li] === null)
      const h = nodes[i].half
      mesh.scale.set(h[0] * 2, h[1] * 2 * (crushed ? 0.3 : 1), h[2] * 2)

      if (clad) continue // the cladding does its own tinting

      // Drift is per link; show each node the worst of whatever holds it.
      let drift = 0
      for (let li = 0; li < instance.links.length; li++) {
        if (instance.links[li].to === i) drift = Math.max(drift, instance.peakDrift[li] ?? 0)
      }
      if (drift <= 0) {
        materials[i].color.copy(undamaged[i])
      } else {
        // Blend toward the damage colour so an undamaged building keeps its own identity.
        tint.current.set(damageColour(drift, spec.driftCapacity))
        const k = Math.min(drift / spec.driftCapacity, 1)
        materials[i].color.copy(undamaged[i]).lerp(tint.current, Math.min(0.15 + k * 0.85, 1))
      }
    }
  })

  return (
    <group>
      {clad && (
        <FishFingerFloors instanceId={building.instanceId} spec={spec} />
      )}

      {nodes.map((node, i) => (
        <mesh
          key={i}
          ref={(m) => (meshes.current[i] = m)}
          geometry={UNIT_BOX}
          material={materials[i]}
          castShadow={!clad}
          receiveShadow={!clad}
          // Starting pose; from the first frame the physics world drives it.
          position={[x + node.offset[0], node.offset[1], z + node.offset[2]]}
          scale={[node.half[0] * 2, node.half[1] * 2, node.half[2] * 2]}
          onClick={(e) => {
            // Only a selection target when no build tool is active, otherwise tapping a
            // building would be ambiguous with placing one next to it.
            if (selectedType) return
            e.stopPropagation()
            selectInstance(building.instanceId)
          }}
        />
      ))}

      {isSelected && (
        <mesh
          position={[x, Math.max(...nodes.map((n) => n.offset[1] + n.half[1])) + 2, z]}
          raycast={() => null}
        >
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
