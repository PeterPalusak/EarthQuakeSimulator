import { BoxGeometry, CylinderGeometry } from 'three'

/**
 * Every floor of every building is a box. Share one unit-cube geometry and scale the mesh,
 * rather than creating a geometry per floor — otherwise draw calls and GPU uploads climb fast.
 */
export const UNIT_BOX = new BoxGeometry(1, 1, 1)

/**
 * A unit cylinder, scaled the same way as the box: a node's half-extents become its radii and
 * half-height. Used for the parts that are plainly not boxes — the saucer on the UFO bridge,
 * the TV tower's observation ring and its antenna mast.
 */
export const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 16)
