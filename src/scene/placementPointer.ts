/**
 * Ghost state lives outside React on purpose: it changes on every pointer move, and routing
 * that through a store would re-render the whole overlay 60 times a second. `PlacementGhost`
 * reads it in `useFrame` and writes straight to the mesh transform.
 */
export const ghostState = {
  active: false,
  valid: false,
  /** True when the ghost has snapped onto the end of an existing road or bridge. */
  connected: false,
  x: 0,
  z: 0,
}
