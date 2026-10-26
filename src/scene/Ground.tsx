import { Grid } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { usePhysics } from './PhysicsProvider'

export const GROUND_SIZE = 200 // metres, square, centred on the origin

/**
 * The flat base, and in phase 5 the thing that shakes. Its transform is read from the
 * kinematic Rapier ground body, so the visible grid moves exactly as the physics ground does
 * — which is what makes the shake legible: the grid is the fixed reference the eye uses to
 * judge how far the buildings are lagging behind.
 */
export function Ground() {
  const world = usePhysics()
  const group = useRef<Group>(null)

  useFrame(() => {
    const t = world?.ground.translation()
    if (t && group.current) group.current.position.set(t.x, t.y, t.z)
  })

  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color="#6b7f5e" />
      </mesh>
      <Grid
        args={[GROUND_SIZE, GROUND_SIZE]}
        position={[0, 0.01, 0]}
        cellSize={1}
        sectionSize={10}
        cellColor="#5a6b4f"
        sectionColor="#44523c"
        fadeDistance={160}
        infiniteGrid={false}
      />
    </group>
  )
}
