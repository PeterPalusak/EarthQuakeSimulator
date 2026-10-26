import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Buildings } from './Building'
import { CameraControls } from './CameraControls'
import { CollapseDust } from './CollapseDust'
import { EpicentreMarker } from './EpicentreMarker'
import { Ground } from './Ground'
import { Lighting } from './Lighting'
import { PerfOverlay } from './PerfOverlay'
import { PhysicsProvider } from './PhysicsProvider'
import { PlacementGhost } from './PlacementGhost'
import { PlacementPlane } from './PlacementPlane'
import { QuakeDriver } from './QuakeDriver'

export function Scene() {
  return (
    <Canvas
      shadows
      // The single highest-value performance line in the project: a phone at native DPR 3
      // renders 2.25x the pixels of DPR 2 for no visible gain on a 6" screen.
      dpr={[1, 2]}
      camera={{ position: [60, 45, 60], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#9fb8d8']} />
      <fog attach="fog" args={['#9fb8d8', 180, 420]} />
      <Suspense fallback={null}>
        <Lighting />
        {/* PhysicsProvider steps the world once per frame, before its children read it. */}
        <PhysicsProvider>
          <QuakeDriver />
          <Ground />
          <PlacementPlane />
          <Buildings />
          <CollapseDust />
        </PhysicsProvider>
        <EpicentreMarker />
        <PlacementGhost />
        <CameraControls />
        <PerfOverlay />
      </Suspense>
    </Canvas>
  )
}
