import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, Matrix4, Object3D, type InstancedMesh } from 'three'
import { usePhysics } from './PhysicsProvider'
import { UNIT_BOX } from './sharedGeometry'

/**
 * Masonry thrown off by a failing member.
 *
 * The structural bodies already fall and pile up on their own; this is the debris that comes
 * off them, and it is most of what makes a collapse read as a building breaking rather than
 * as a stack of boxes being rearranged.
 *
 * One `InstancedMesh` for every chunk in the scene, so a hundred of them is one draw call.
 * `QuakeWorld` caps and recycles the bodies, because a user running quake after quake without
 * resetting is the case that would otherwise sink the framerate.
 */

/** Must not be below `QuakeWorld.MAX_RUBBLE`, or chunks would be dropped from the render. */
const MAX = 128

const CONCRETE = new Color('#9a948c')

export function Rubble() {
  const world = usePhysics()
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])

  useFrame(() => {
    const m = mesh.current
    if (!m || !world) return

    const chunks = world.rubble()
    const n = Math.min(chunks.length, MAX)
    for (let i = 0; i < n; i++) {
      const t = chunks[i].translation()
      const r = chunks[i].rotation()
      const c = chunks[i].collider(0)
      const h = c?.halfExtents()
      dummy.position.set(t.x, t.y, t.z)
      dummy.quaternion.set(r.x, r.y, r.z, r.w)
      dummy.scale.set((h?.x ?? 0.3) * 2, (h?.y ?? 0.2) * 2, (h?.z ?? 0.3) * 2)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    for (let i = n; i < MAX; i++) m.setMatrixAt(i, hidden)
    m.instanceMatrix.needsUpdate = true
    m.visible = n > 0
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[UNIT_BOX, undefined, MAX]}
      castShadow
      receiveShadow
      raycast={() => null}
      frustumCulled={false}
      visible={false}
    >
      <meshStandardMaterial color={CONCRETE} roughness={0.95} />
    </instancedMesh>
  )
}
