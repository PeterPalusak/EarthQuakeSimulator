import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { FLOOR_HEIGHT, type BuildingSpec } from '../sim/buildingSpecs'
import { FINGER_HEIGHT_RATIO, fishFingerLayout } from '../sim/cladding'
import { damageColour } from '../sim/damage'
import { usePhysics } from './PhysicsProvider'
import { UNIT_BOX } from './sharedGeometry'

/**
 * Draws a building as courses of fish fingers rather than solid floors.
 *
 * One `InstancedMesh` for the whole building, so a forty-bar tower still costs a single draw
 * call — the alternative, a mesh per bar, would blow the 150-draw-call budget with two
 * buildings on the map.
 *
 * Each bar is positioned by composing its fixed offset within its floor with that floor's live
 * rigid-body transform, so the bars follow the physics exactly and a course that has been
 * crushed by a collapse flattens with it.
 */
export function FishFingerFloors({
  instanceId,
  spec,
}: {
  instanceId: string
  spec: BuildingSpec
}) {
  const world = usePhysics()
  const mesh = useRef<InstancedMesh>(null)

  const layout = useMemo(
    () => Array.from({ length: spec.floors }, (_, i) => fishFingerLayout(spec.footprint, i)),
    [spec],
  )
  const count = useMemo(() => layout.reduce((s, c) => s + c.length, 0), [layout])

  // Scratch objects, reused every frame so the hot path allocates nothing.
  const scratch = useMemo(
    () => ({
      bodyPos: new Vector3(),
      bodyQuat: new Quaternion(),
      bodyScale: new Vector3(1, 1, 1),
      body: new Matrix4(),
      local: new Matrix4(),
      out: new Matrix4(),
      localPos: new Vector3(),
      localQuat: new Quaternion(),
      localScale: new Vector3(),
      colour: new Color(),
      tint: new Color(),
    }),
    [],
  )

  const base = useMemo(() => new Color(spec.colour), [spec])

  // Instance colours have to exist before the first write, or three never allocates the
  // attribute and every bar renders white.
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < count; i++) m.setColorAt(i, base)
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [count, base])

  useFrame(() => {
    const m = mesh.current
    const instance = world?.get(instanceId)
    if (!m || !instance) return

    let n = 0
    for (let floor = 0; floor < instance.bodies.length; floor++) {
      const t = instance.bodies[floor].translation()
      const r = instance.bodies[floor].rotation()
      scratch.bodyPos.set(t.x, t.y, t.z)
      scratch.bodyQuat.set(r.x, r.y, r.z, r.w)
      scratch.body.compose(scratch.bodyPos, scratch.bodyQuat, scratch.bodyScale)

      // A failed storey is crushed flat, matching the flattened collider.
      const crushed = instance.joints[floor] === null
      const height = FLOOR_HEIGHT * FINGER_HEIGHT_RATIO * (crushed ? 0.3 : 1)

      const drift = instance.peakDrift[floor] ?? 0
      scratch.colour.copy(base)
      if (drift > 0) {
        scratch.tint.set(damageColour(drift, spec.driftCapacity))
        const k = Math.min(drift / spec.driftCapacity, 1)
        scratch.colour.lerp(scratch.tint, Math.min(0.15 + k * 0.85, 1))
      }

      for (const bar of layout[floor]) {
        scratch.localPos.set(bar.offsetX, 0, bar.offsetZ)
        scratch.localQuat.identity()
        scratch.localScale.set(bar.sizeX, height, bar.sizeZ)
        scratch.local.compose(scratch.localPos, scratch.localQuat, scratch.localScale)
        scratch.out.multiplyMatrices(scratch.body, scratch.local)
        m.setMatrixAt(n, scratch.out)
        m.setColorAt(n, scratch.colour)
        n++
      }
    }

    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.visible = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[UNIT_BOX, undefined, count]}
      castShadow
      receiveShadow
      // The bars are decoration; the invisible per-floor hit boxes own pointer events.
      raycast={() => null}
      frustumCulled={false}
      // Left at the origin on purpose: every instance matrix below is composed from a
      // rigid body's WORLD transform, and an instance matrix is relative to its mesh. Giving
      // the mesh the building's position too would place every bar at twice its offset.
      // Hidden until the first frame has written real matrices, so the untransformed
      // instances never flash up as a unit cube at the origin.
      visible={false}
    >
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  )
}
