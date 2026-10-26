import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Matrix4, Object3D, SphereGeometry } from 'three'
import { usePhysics } from './PhysicsProvider'

/**
 * Short-lived dust bursts where a storey fails.
 *
 * The highest-value visual in phase 6: a collapse without dust looks abrupt and weightless,
 * like a model being taken apart, rather than like several hundred tonnes of concrete
 * arriving at the ground.
 *
 * One instanced mesh for the whole scene, recycled from a fixed pool — no allocation per
 * puff, no extra draw calls as collapses pile up.
 */

const MAX_PUFFS = 180
const LIFETIME = 2.6 // seconds

interface Puff {
  age: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
}

const DUST = new Color('#cfc6b4')

export function CollapseDust() {
  const world = usePhysics()
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new SphereGeometry(1, 6, 5), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const puffs = useRef<Puff[]>(
    Array.from({ length: MAX_PUFFS }, () => ({
      age: Infinity,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
    })),
  )
  const cursor = useRef(0)
  /** Storeys already given a burst, so a failure does not emit every frame. */
  const seen = useRef(new Set<string>())
  const dummy = useMemo(() => new Object3D(), [])
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])

  const spawn = (x: number, y: number, z: number, spread: number) => {
    for (let i = 0; i < 7; i++) {
      const p = puffs.current[cursor.current]
      cursor.current = (cursor.current + 1) % MAX_PUFFS
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      p.age = 0
      p.x = x + Math.cos(a) * r
      p.y = y + (Math.random() - 0.5) * 1.5
      p.z = z + Math.sin(a) * r
      p.vx = Math.cos(a) * (1.5 + Math.random() * 2.5)
      p.vy = 0.6 + Math.random() * 1.6
      p.vz = Math.sin(a) * (1.5 + Math.random() * 2.5)
      p.size = 1.2 + Math.random() * 2.2
    }
  }

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(delta, 0.1)

    // Emit for any storey that has failed since the last frame.
    if (world) {
      for (const b of world.list()) {
        if (!b.collapsed) continue
        for (let i = 0; i < b.joints.length; i++) {
          if (b.joints[i]) continue
          const key = `${b.instanceId}:${i}`
          if (seen.current.has(key)) continue
          seen.current.add(key)
          const t = b.bodies[i].translation()
          spawn(t.x, t.y, t.z, Math.max(...b.spec.footprint) / 2)
        }
      }
      // Forget buildings that no longer exist, so a reset can burst again.
      if (seen.current.size > 0 && world.list().every((b) => !b.collapsed)) {
        seen.current.clear()
      }
    }

    let n = 0
    for (const p of puffs.current) {
      if (p.age === Infinity) continue
      p.age += dt
      if (p.age > LIFETIME) {
        p.age = Infinity
        continue
      }
      // Drag, then a slow buoyant rise — dust hangs rather than falling back.
      const drag = Math.exp(-1.6 * dt)
      p.vx *= drag
      p.vz *= drag
      p.vy = p.vy * drag + 0.35 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      const k = p.age / LIFETIME
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.setScalar(p.size * (0.5 + k * 2.2))
      dummy.updateMatrix()
      m.setMatrixAt(n, dummy.matrix)
      n++
      if (n >= MAX_PUFFS) break
    }
    for (let i = n; i < MAX_PUFFS; i++) m.setMatrixAt(i, hidden)
    m.instanceMatrix.needsUpdate = true
    m.visible = n > 0
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, MAX_PUFFS]}
      frustumCulled={false}
      raycast={() => null}
    >
      <meshBasicMaterial color={DUST} transparent opacity={0.22} depthWrite={false} />
    </instancedMesh>
  )
}
