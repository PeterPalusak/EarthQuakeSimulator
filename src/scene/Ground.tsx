import { Grid } from '@react-three/drei'

export const GROUND_SIZE = 200 // metres, square, centred on the origin
export const GROUND_HALF = GROUND_SIZE / 2

/**
 * The flat base. A plain mesh in phase 1; it becomes a kinematic Rapier body in phase 3/5
 * and starts moving in phase 5 — the mesh and material do not change.
 *
 * The grid is not decoration: it previews the 1 m placement snapping from phase 2 and gives
 * the eye a fixed reference for judging shake amplitude in phase 5.
 */
export function GroundVisual() {
  return (
    <>
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
    </>
  )
}

export function Ground() {
  return <GroundVisual />
}
