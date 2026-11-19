import { describe, expect, it } from 'vitest'
import { BUILDING_LIST, FLOOR_HEIGHT, floorCentreY } from './buildingSpecs'
import {
  GROUND,
  buildStructure,
  linkAxis,
  rotateFootprint,
  rotateHalf,
  rotateQuarter,
  type Quarter,
} from './structure'

describe('rotateQuarter', () => {
  it('is the identity at zero', () => {
    expect(rotateQuarter([3, 7, -2], 0)).toEqual([3, 7, -2])
  })

  it('leaves the vertical axis alone', () => {
    for (const q of [0, 1, 2, 3] as Quarter[]) {
      expect(rotateQuarter([0, 5, 0], q)).toEqual([0, 5, 0])
    }
  })

  it('returns to where it started after four turns', () => {
    let v = [4, 1, 9] as [number, number, number]
    for (let i = 0; i < 4; i++) v = rotateQuarter(v, 1)
    expect(v).toEqual([4, 1, 9])
  })

  it('turns +X into -Z and round again', () => {
    expect(rotateQuarter([1, 0, 0], 1)).toEqual([0, 0, -1])
    expect(rotateQuarter([1, 0, 0], 2)).toEqual([-1, 0, 0])
    expect(rotateQuarter([1, 0, 0], 3)).toEqual([0, 0, 1])
  })

  it('preserves length', () => {
    for (const q of [0, 1, 2, 3] as Quarter[]) {
      const [x, y, z] = rotateQuarter([3, 4, 12], q)
      expect(Math.hypot(x, y, z)).toBeCloseTo(13, 9)
    }
  })
})

describe('rotateHalf and rotateFootprint', () => {
  it('swap width and depth on odd quarters only', () => {
    expect(rotateHalf([2, 9, 5], 0)).toEqual([2, 9, 5])
    expect(rotateHalf([2, 9, 5], 1)).toEqual([5, 9, 2])
    expect(rotateHalf([2, 9, 5], 2)).toEqual([2, 9, 5])
    expect(rotateHalf([2, 9, 5], 3)).toEqual([5, 9, 2])
    expect(rotateFootprint([16, 12], 1)).toEqual([12, 16])
    expect(rotateFootprint([16, 12], 2)).toEqual([16, 12])
  })
})

/**
 * The important one. `storeyStiffness` in buildingSpecs.ts is calibration output, measured
 * against the original hard-coded vertical stack. If the generator ever stops reproducing that
 * arrangement exactly, every published natural period silently becomes a lie — so pin the
 * geometry against the formulae the old loop used, not against a snapshot.
 */
describe('the stack layout reproduces the original hard-coded geometry', () => {
  it.each(BUILDING_LIST)('$label', (spec) => {
    const { nodes, links } = buildStructure(spec)

    expect(nodes).toHaveLength(spec.floors)
    expect(links).toHaveLength(spec.floors)

    const [w, d] = spec.footprint
    nodes.forEach((n, i) => {
      // old: setTranslation(ox, floorCentreY(i), oz) and cuboid(w/2, FLOOR_HEIGHT/2, d/2)
      expect(n.offset).toEqual([0, floorCentreY(i), 0])
      expect(n.half).toEqual([w / 2, FLOOR_HEIGHT / 2, d / 2])
      expect(n.mass).toBe(spec.floorMass)
      expect(n.part).toBe('floor')
    })

    links.forEach((l, i) => {
      // old: lower = i === 0 ? ground : bodies[i-1]
      expect(l.from).toBe(i === 0 ? GROUND : i - 1)
      expect(l.to).toBe(i)
      // old: a1 = i === 0 ? {x: ox, y: 0, z: oz} : {0, +H/2, 0}; a2 = {0, -H/2, 0}
      expect(l.anchorFrom).toEqual(i === 0 ? [0, 0, 0] : [0, FLOOR_HEIGHT / 2, 0])
      expect(l.anchorTo).toEqual([0, -FLOOR_HEIGHT / 2, 0])
      expect(l.stiffness).toBe(spec.storeyStiffness)
      expect(l.damping).toBe(spec.storeyDamping)
      expect(l.span).toBe(FLOOR_HEIGHT)
      expect(l.capacity).toBe(spec.driftCapacity)
    })
  })

  it('every link is vertical, so perpendicular drift is horizontal drift', () => {
    for (const spec of BUILDING_LIST) {
      for (const link of buildStructure(spec).links) {
        expect(linkAxis(link)).toEqual([0, 1, 0])
      }
    }
  })

  it('rests stack the floors with no gaps and no overlaps', () => {
    const { links } = buildStructure(BUILDING_LIST[4])
    expect(links[0].rest).toEqual([0, floorCentreY(0), 0])
    for (let i = 1; i < links.length; i++) {
      expect(links[i].rest).toEqual([0, FLOOR_HEIGHT, 0])
    }
  })
})

describe('rotating a stack', () => {
  it.each([0, 1, 2, 3] as Quarter[])('quarter %i keeps the floors stacked vertically', (q) => {
    const spec = BUILDING_LIST[4]
    const { nodes } = buildStructure(spec, q)
    nodes.forEach((n, i) => {
      // A vertical stack is on the rotation axis, so only the half-extents can change.
      expect(n.offset).toEqual([0, floorCentreY(i), 0])
    })
    const [w, d] = spec.footprint
    const [hx, , hz] = nodes[0].half
    expect([hx * 2, hz * 2]).toEqual(rotateFootprint([w, d], q))
  })
})
