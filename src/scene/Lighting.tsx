export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#bcd4ff', '#6b7f5e', 0.6]} />
      <directionalLight
        castShadow
        position={[50, 80, 30]}
        intensity={2.2}
        shadow-mapSize={[2048, 2048]}
        // Shadow acne on the flat ground is otherwise guaranteed — fix with a bias,
        // never by turning shadows off. They are the main cue for where a building sits.
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        // Widened to cover the whole 200 m ground, or shadows vanish at the edges.
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
    </>
  )
}
