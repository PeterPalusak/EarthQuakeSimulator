import { BoxGeometry } from 'three'

/**
 * Every floor of every building is a box. Share one unit-cube geometry and scale the mesh,
 * rather than creating a geometry per floor — otherwise draw calls and GPU uploads climb fast.
 */
export const UNIT_BOX = new BoxGeometry(1, 1, 1)
