import { OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH } from 'three'

/**
 * "Rotate by finger in all 3 directions":
 *   one finger drag  -> orbit (yaw + pitch)
 *   two finger pinch -> zoom
 *   two finger drag  -> pan
 *
 * Scoped to the canvas, never to `window` — on `window` it fights the UI overlay and the
 * phase 7 sliders for pointer events.
 */
export function CameraControls() {
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08} // inertia; without it, touch dragging feels sticky
      target={[0, 5, 0]} // look slightly above ground, not at the horizon
      minDistance={15}
      maxDistance={250}
      maxPolarAngle={Math.PI * 0.49} // never let the camera go below the ground plane
      minPolarAngle={0.1}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    />
  )
}
