import { describe, expect, it } from 'vitest'
import { BUILDING_SPECS, type BuildingTypeId } from './buildingSpecs'
import { SNAP_RADIUS, findJunctions, findSnap, isLinear, structureEnds } from './connect'
import type { PlacedBuilding } from './placement'
import { buildStructure, type Quarter } from './structure'

let n = 0
const at = (
  type: BuildingTypeId,
  position: [number, number],
  rotation: Quarter = 0,
): PlacedBuilding => ({ instanceId: `p${++n}`, type, position, rotation })

describe('isLinear', () => {
  it('is true for the things that are lines', () => {
    for (const id of ['road', 'bridge', 'ufoBridge'] as const) {
      expect(isLinear(BUILDING_SPECS[id])).toBe(true)
    }
  })

  it('is false for buildings and towers', () => {
    for (const id of ['smallHouse', 'largeBlock', 'tvTower', 'fishFingerHouse'] as const) {
      expect(isLinear(BUILDING_SPECS[id])).toBe(false)
    }
  })
})

describe('structureEnds', () => {
  it('gives the two outward faces, half a length either side of the centre', () => {
    const [w] = BUILDING_SPECS.road.footprint
    const [a, b] = structureEnds('road', [0, 0], 0)
    expect(a.face[0]).toBeCloseTo(-w / 2, 6)
    expect(b.face[0]).toBeCloseTo(w / 2, 6)
    expect(a.face[1]).toBeCloseTo(0, 6)
  })

  it('follows the rotation', () => {
    const [w] = BUILDING_SPECS.road.footprint
    const [a, b] = structureEnds('road', [0, 0], 1)
    expect(a.face[1]).toBeCloseTo(-w / 2, 6)
    expect(b.face[1]).toBeCloseTo(w / 2, 6)
    expect(a.face[0]).toBeCloseTo(0, 6)
  })

  it('follows the placement', () => {
    const [a] = structureEnds('road', [10, -5], 0)
    expect(a.face[1]).toBeCloseTo(-5, 6)
  })

  it('names deck nodes, never a pier', () => {
    const { nodes } = buildStructure(BUILDING_SPECS.bridge, 0)
    for (const e of structureEnds('bridge', [0, 0], 0)) {
      expect(nodes[e.node].part).toBe('deck')
    }
  })

  it('names the segments at ground level, so a road can meet them', () => {
    const { nodes } = buildStructure(BUILDING_SPECS.bridge, 0)
    for (const e of structureEnds('bridge', [0, 0], 0)) {
      expect(nodes[e.node].offset[1]).toBeLessThan(1)
    }
  })

  it('returns nothing for a building', () => {
    expect(structureEnds('largeBlock', [0, 0], 0)).toEqual([])
  })
})

describe('findSnap', () => {
  const roadLength = BUILDING_SPECS.road.footprint[0]

  it('snaps a road flush onto the end of another', () => {
    const existing = [at('road', [0, 0], 0)]
    // Placed a few metres short of flush, and slightly off the line.
    const snap = findSnap('road', [roadLength - 4, 2], 0, existing)
    expect(snap).not.toBeNull()
    expect(snap!.position[0]).toBeCloseTo(roadLength, 6)
    expect(snap!.position[1]).toBeCloseTo(0, 6)
  })

  it('leaves a piece that is nowhere near anything alone', () => {
    expect(findSnap('road', [0, 0], 0, [at('road', [90, 0], 0)])).toBeNull()
  })

  it('does not reach further than the snap radius', () => {
    const existing = [at('road', [0, 0], 0)]
    expect(findSnap('road', [roadLength + SNAP_RADIUS + 1, 0], 0, existing)).toBeNull()
    expect(findSnap('road', [roadLength + SNAP_RADIUS - 1, 0], 0, existing)).not.toBeNull()
  })

  it('ignores pieces running across it — that is a T-junction, not a continuation', () => {
    expect(findSnap('road', [roadLength - 2, 0], 0, [at('road', [0, 0], 1)])).toBeNull()
  })

  it('joins a road to a bridge, and the bridge is the longer piece', () => {
    const bridgeLength = BUILDING_SPECS.bridge.footprint[0]
    const existing = [at('bridge', [0, 0], 0)]
    const snap = findSnap('road', [bridgeLength / 2 + roadLength / 2 - 3, 0], 0, existing)
    expect(snap).not.toBeNull()
    expect(snap!.position[0]).toBeCloseTo(bridgeLength / 2 + roadLength / 2, 6)
  })

  it('snaps to whichever end is nearer', () => {
    const existing = [at('road', [0, 0], 0)]
    const left = findSnap('road', [-roadLength + 3, 0], 0, existing)!
    expect(left.position[0]).toBeCloseTo(-roadLength, 6)
  })

  it('never offers a snap for a building', () => {
    expect(findSnap('largeBlock', [roadLength / 2, 0], 0, [at('road', [0, 0], 0)])).toBeNull()
  })

  it('snaps along Z when both are turned', () => {
    const existing = [at('road', [0, 0], 1)]
    const snap = findSnap('road', [0, roadLength - 3], 1, existing)
    expect(snap).not.toBeNull()
    expect(snap!.position[1]).toBeCloseTo(roadLength, 6)
    expect(snap!.position[0]).toBeCloseTo(0, 6)
  })
})

describe('findJunctions', () => {
  const roadLength = BUILDING_SPECS.road.footprint[0]

  it('finds nothing among pieces that do not touch', () => {
    expect(findJunctions([at('road', [0, 0]), at('road', [roadLength + 5, 0])])).toEqual([])
  })

  it('finds the junction between two flush roads', () => {
    const a = at('road', [0, 0])
    const b = at('road', [roadLength, 0])
    const js = findJunctions([a, b])
    expect(js).toHaveLength(1)
    expect([js[0].a, js[0].b].sort()).toEqual([a.instanceId, b.instanceId].sort())
  })

  it('chains three pieces into two junctions', () => {
    const js = findJunctions([
      at('road', [0, 0]),
      at('road', [roadLength, 0]),
      at('road', [roadLength * 2, 0]),
    ])
    expect(js).toHaveLength(2)
  })

  it('ignores buildings standing next to a road', () => {
    expect(findJunctions([at('road', [0, 0]), at('largeBlock', [roadLength / 2 + 8, 0])]))
      .toEqual([])
  })

  it('names end deck nodes on both sides', () => {
    const a = at('road', [0, 0])
    const b = at('road', [roadLength, 0])
    const [j] = findJunctions([a, b])
    const endsA = structureEnds(a.type, a.position, a.rotation).map((e) => e.node)
    const endsB = structureEnds(b.type, b.position, b.rotation).map((e) => e.node)
    expect(endsA).toContain(j.aNode)
    expect(endsB).toContain(j.bNode)
  })

  it('does not join pieces that merely cross', () => {
    expect(findJunctions([at('road', [0, 0], 0), at('road', [roadLength / 2, 0], 1)]))
      .toEqual([])
  })
})
