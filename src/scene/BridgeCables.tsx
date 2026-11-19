import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type LineSegments } from 'three'
import type { BuildingSpec } from '../sim/buildingSpecs'
import type { PlacedBuilding } from '../sim/placement'
import { usePhysics } from './PhysicsProvider'

/**
 * The stay cables on the UFO bridge.
 *
 * Drawn, not simulated. Modelling each stay as its own member over-constrains the deck —
 * every stayed segment would be held by both the deck chain and its stay, two soft position
 * constraints with anchors tens of metres from the bodies they attach to, and they fight each
 * other into a deck that slowly stretches itself apart under no load at all. The pylon
 * carries the deck where the two meet instead; see `buildCableBridge` in src/sim/structure.ts.
 *
 * So these follow the bodies rather than driving them: endpoints are read from the live pylon
 * and deck transforms every frame, which means they stay attached through the shaking and go
 * slack-looking as the deck drops in a collapse, without pretending to hold anything up.
 */
export function BridgeCables({
  building,
  spec,
}: {
  building: PlacedBuilding
  spec: BuildingSpec
}) {
  const world = usePhysics()
  const lines = useRef<LineSegments>(null)

  // Two endpoints per cable, one cable per deck segment.
  const { geometry, positions } = useMemo(() => {
    const count = spec.floors * 2
    const array = new Float32Array(count * 3)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(array, 3))
    return { geometry: g, positions: array }
  }, [spec.floors])

  useFrame(() => {
    const instance = world?.get(building.instanceId)
    const mesh = lines.current
    if (!instance || !mesh) return

    const pylon = instance.nodes.findIndex((n) => n.part === 'pylon')
    const pod = instance.nodes.findIndex((n) => n.part === 'pod')
    if (pylon < 0) return

    // Cables leave from the pylon head, which is the underside of the saucer.
    const head = instance.bodies[pod >= 0 ? pod : pylon].translation()
    const headY = pod >= 0 ? head.y - instance.nodes[pod].half[1] : head.y

    let n = 0
    instance.nodes.forEach((node, i) => {
      if (node.part !== 'deck') return
      const t = instance.bodies[i].translation()
      positions[n * 3] = head.x
      positions[n * 3 + 1] = headY
      positions[n * 3 + 2] = head.z
      positions[n * 3 + 3] = t.x
      positions[n * 3 + 4] = t.y + node.half[1]
      positions[n * 3 + 5] = t.z
      n += 2
    })

    // Anything left over from a shorter frame would otherwise draw a stray line to the origin.
    for (let i = n; i < positions.length / 3; i++) {
      positions.set([0, 0, 0], i * 3)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.setDrawRange(0, n)
    mesh.visible = n > 0
  })

  return (
    <lineSegments ref={lines} geometry={geometry} raycast={() => null} frustumCulled={false}>
      <lineBasicMaterial color="#5c6670" transparent opacity={0.85} />
    </lineSegments>
  )
}
