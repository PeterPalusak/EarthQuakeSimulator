import { Line, Text } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group, Mesh } from 'three'
import {
  MARKER_MAX_RADIUS,
  MARKER_MIN_RADIUS,
  epicentrePosition,
  radiusToDistance,
} from '../sim/quakeScales'
import { useQuakeStore } from '../state/quakeStore'
import { useAppStore } from '../state/store'

/**
 * Where the quake comes from, shown on the ground and draggable.
 *
 * The slider runs to 200 km but the ground plane is 200 m across, so the marker cannot be at
 * true scale. It sits at a compressed, logarithmic radius with the real distance written
 * beside it — the alternative, pinning it to the horizon with an arrow, tells you less.
 * Dragging it sets both the distance and the bearing, and the sliders follow.
 */
export function EpicentreMarker() {
  const settings = useQuakeStore((s) => s.settings)
  const setSettings = useQuakeStore((s) => s.setSettings)
  const phase = useQuakeStore((s) => s.phase)
  const [dragging, setDragging] = useState(false)
  // While a build tool is active the user is placing buildings, so the marker must not
  // swallow taps that land on or near it — it is a 7 m disc sitting on the build area.
  const placing = useAppStore((s) => s.selectedType !== null)
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)

  const [x, z] = epicentrePosition(settings.distanceKm, settings.bearing)
  const running = phase === 'running'

  useFrame(({ clock }) => {
    if (!ring.current) return
    // A slow pulse, faster while a quake runs, so the origin of the shaking is unmistakable.
    const t = clock.elapsedTime * (running ? 4 : 1.4)
    const k = 1 + 0.18 * Math.sin(t)
    ring.current.scale.set(k, k, 1)
    const material = ring.current.material as { opacity: number }
    material.opacity = running ? 0.85 : 0.5 + 0.2 * Math.sin(t)
  })

  const moveTo = (e: ThreeEvent<PointerEvent>) => {
    const r = Math.hypot(e.point.x, e.point.z)
    if (r < 1) return
    setSettings({
      distanceKm: radiusToDistance(r),
      bearing: Math.atan2(e.point.z, e.point.x),
    })
  }

  return (
    <group ref={group} position={[x, 0.08, z]}>
      <Line
        points={[
          [-x, 0, -z],
          [0, 0, 0],
        ]}
        color="#f87171"
        lineWidth={1.5}
        dashed
        dashSize={3}
        gapSize={2}
      />

      {/* Generous invisible hit area: a thin ring is unhittable with a thumb. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={placing || running ? () => null : undefined}
        onPointerDown={(e) => {
          if (running) return
          e.stopPropagation()
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          e.stopPropagation()
          moveTo(e)
        }}
        onPointerUp={(e) => {
          if (!dragging) return
          e.stopPropagation()
          setDragging(false)
        }}
      >
        <circleGeometry args={[7, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[3.2, 4.6, 32]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[1.4, 20]} />
        <meshBasicMaterial color="#ef4444" depthWrite={false} />
      </mesh>

      <Text
        position={[0, 0.2, 8]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={2.6}
        color="#fecaca"
        outlineWidth={0.35}
        outlineColor="#450a0a"
        anchorX="center"
        anchorY="middle"
      >
        {`${Math.round(settings.distanceKm)} km away`}
      </Text>
    </group>
  )
}

export { MARKER_MAX_RADIUS, MARKER_MIN_RADIUS }
