import { describe, expect, it } from 'vitest'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { MEDIUM_QUAKE } from '../sim/groundMotion'
import { GROUND, buildStructure } from '../sim/structure'
import { runQuake, type LayoutEntry } from './runQuake'
import { headlessWorld, run, settle } from './testHarness'

/**
 * Roads and bridges are the first structures that are not vertical stacks, so these guard the
 * things a stack could never get wrong: that a horizontal chain rests at zero deformation, and
 * that losing a support drops only what that support was carrying.
 */

const BOTH: LayoutEntry[] = [
  { type: 'road', position: [-40, 0] },
  { type: 'bridge', position: [30, 0] },
]

describe('geometry', () => {
  it('a road lies on the ground and is tied to it along its whole length', () => {
    const { nodes, links } = buildStructure(BUILDING_SPECS.road)
    expect(nodes.every((n) => n.part === 'deck')).toBe(true)
    // Every segment has its own ground tie, plus a tie to the segment behind it.
    expect(links.filter((l) => l.from === GROUND)).toHaveLength(nodes.length)
    expect(links.filter((l) => l.from !== GROUND)).toHaveLength(nodes.length - 1)
    // Segments sit just above ground level, not buried in it.
    for (const n of nodes) expect(n.offset[1]).toBeGreaterThan(0)
  })

  it('a bridge carries its deck on piers, with unsupported spans between them', () => {
    const { nodes, links } = buildStructure(BUILDING_SPECS.bridge)
    const piers = nodes.filter((n) => n.part === 'pier')
    const deck = nodes.filter((n) => n.part === 'deck')
    expect(piers.length).toBe(3)
    expect(deck.length).toBe(BUILDING_SPECS.bridge.floors)
    // Only the piers reach the ground — the deck hangs between them.
    const grounded = links.filter((l) => l.from === GROUND)
    expect(grounded).toHaveLength(piers.length)
    for (const l of grounded) expect(nodes[l.to].part).toBe('pier')
    for (const n of deck) expect(n.offset[1]).toBeGreaterThan(5)
  })

  it('every link rests with its two anchors coincident', () => {
    // A zero-rest-length spring whose anchors do not already meet drags the structure until
    // they do, which reads as a permanent drift that can never be shed.
    for (const id of ['road', 'bridge'] as const) {
      const { nodes, links } = buildStructure(BUILDING_SPECS[id])
      for (const link of links) {
        const from =
          link.from === GROUND ? [0, 0, 0] : nodes[link.from].offset
        const to = nodes[link.to].offset
        for (const axis of [0, 1, 2]) {
          expect(from[axis] + link.anchorFrom[axis]).toBeCloseTo(
            to[axis] + link.anchorTo[axis],
            9,
          )
        }
      }
    }
  })
})

describe('at rest', () => {
  it.each(['road', 'bridge'] as const)('a %s stands with no deformation', async (id) => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', id, [0, 0])
      settle(world, 2)
      run(world, 3)
      for (let i = 0; i < b.links.length; i++) {
        expect(world.storeyDrift(b, i)).toBeLessThan(1e-3)
      }
      expect(b.collapsed).toBe(false)
    } finally {
      world.dispose()
    }
  }, 60_000)
})

describe('the damage ladder', () => {
  it('a medium quake leaves both intact', async () => {
    const r = await runQuake(MEDIUM_QUAKE, BOTH, { settleAfter: 4 })
    expect(r.buildings.map((b) => b.collapsed)).toEqual([false, false])
  }, 120_000)

  it('M7 at 10 km drops the bridge but not the road', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 3 }, BOTH, {
      settleAfter: 8,
    })
    const [road, bridge] = r.buildings
    expect(bridge.collapsed).toBe(true)
    expect(road.collapsed).toBe(false)
  }, 180_000)

  it('the bridge is the more fragile of the two at every intensity', async () => {
    for (const magnitude of [5.5, 6.5, 7]) {
      const r = await runQuake({ magnitude, distanceKm: 10, seed: 3 }, BOTH, {
        collapse: false,
      })
      const [road, bridge] = r.buildings
      expect(bridge.peakDrift / BUILDING_SPECS.bridge.driftCapacity).toBeGreaterThan(
        road.peakDrift / BUILDING_SPECS.road.driftCapacity,
      )
    }
  }, 240_000)

  it('neither destabilises the solver at the extremes', async () => {
    for (const params of [
      { magnitude: 8, distanceKm: 1, seed: 2 },
      { magnitude: 4, distanceKm: 200, seed: 2 },
    ]) {
      const r = await runQuake(params, BOTH, { settleAfter: 3 })
      expect(r.sawNaN).toBe(false)
    }
  }, 240_000)
})

describe('losing a support', () => {
  it('a continuous deck redistributes when one pier connection fails', async () => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', 'bridge', [0, 0])
      settle(world, 2)

      const pierLink = b.links.findIndex(
        (l) => l.from !== GROUND && b.nodes[l.from].part === 'pier',
      )
      expect(pierLink).toBeGreaterThanOrEqual(0)
      const before = b.bodies.map((body) => body.translation().y)

      world.breakStorey(b, pierLink)
      run(world, 5)

      // The deck is continuous and two piers still stand, so every segment keeps a path to
      // the ground and nothing comes down. Redundancy is why real bridges are built this way.
      b.bodies.forEach((body, i) => {
        expect(before[i] - body.translation().y).toBeLessThan(0.5)
      })
    } finally {
      world.dispose()
    }
  }, 120_000)

  it('a segment that loses every support falls, and only that segment', async () => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', 'bridge', [0, 0])
      settle(world, 2)

      // Isolate the end segment: cut its pier and its one neighbour.
      const toCut = b.links
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.to === 0 || (l.from === 0 && b.nodes[l.to].part === 'deck'))
        .map(({ i }) => i)
      expect(toCut.length).toBeGreaterThanOrEqual(2)

      const before = b.bodies.map((body) => body.translation().y)
      for (const i of toCut) world.breakStorey(b, i)
      run(world, 6)

      const fell = b.bodies.map((body, i) => before[i] - body.translation().y > 0.5)
      expect(fell[0]).toBe(true) // the isolated segment came down
      expect(fell.filter(Boolean).length).toBeLessThan(b.bodies.length) // the rest held

      for (const body of b.bodies) {
        expect(Number.isFinite(body.translation().y)).toBe(true)
        expect(body.translation().y).toBeGreaterThan(-5) // nothing tunnelled through
      }
    } finally {
      world.dispose()
    }
  }, 120_000)
})

describe('the showpieces', () => {
  it('the UFO bridge hangs its deck level, with the saucer on top of the pylon', () => {
    const { nodes } = buildStructure(BUILDING_SPECS.ufoBridge)
    const deck = nodes.filter((n) => n.part === 'deck')
    const pod = nodes.find((n) => n.part === 'pod')!
    const pylon = nodes.find((n) => n.part === 'pylon')!
    expect(new Set(deck.map((n) => n.offset[1])).size).toBe(1) // one deck height
    expect(pod.offset[1]).toBeGreaterThan(pylon.offset[1] + pylon.half[1])
    // Asymmetric on purpose: the pylon sits near one end, not in the middle.
    expect(Math.abs(pylon.offset[0])).toBeGreaterThan(BUILDING_SPECS.ufoBridge.footprint[0] / 6)
  })

  it('the TV tower tapers, and carries its mass high up', () => {
    const { nodes } = buildStructure(BUILDING_SPECS.tvTower)
    const shaft = nodes.filter((n) => n.part === 'floor')
    expect(shaft.at(-1)!.half[0]).toBeLessThan(shaft[0].half[0] * 0.5)
    const ring = nodes.find((n) => n.part === 'pod')!
    const mast = nodes.find((n) => n.part === 'mast')!
    expect(ring.half[0]).toBeGreaterThan(shaft.at(-1)!.half[0]) // overhangs the shaft
    expect(ring.mass).toBeGreaterThan(shaft.at(-1)!.mass)
    expect(mast.offset[1]).toBeGreaterThan(ring.offset[1])
    expect(mast.mass).toBeLessThan(ring.mass * 0.2) // light, so it whips rather than topples
  })

  it.each(['ufoBridge', 'tvTower'] as const)('a %s stands with no deformation', async (id) => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', id, [0, 0])
      settle(world, 2)
      run(world, 3)
      for (let i = 0; i < b.links.length; i++) {
        expect(world.storeyDrift(b, i)).toBeLessThan(2e-3)
      }
      expect(b.collapsed).toBe(false)
    } finally {
      world.dispose()
    }
  }, 60_000)

  it('both survive a medium quake and both are hurt by a megathrust', async () => {
    const pair: LayoutEntry[] = [
      { type: 'ufoBridge', position: [0, -35] },
      { type: 'tvTower', position: [0, 35] },
    ]
    const medium = await runQuake(MEDIUM_QUAKE, pair, { settleAfter: 4 })
    expect(medium.buildings.map((b) => b.collapsed)).toEqual([false, false])

    const huge = await runQuake({ magnitude: 8, distanceKm: 20, seed: 1 }, pair, {
      collapse: false,
    })
    huge.buildings.forEach((b, i) => {
      expect(b.peakDrift).toBeGreaterThan(medium.buildings[i].peakDrift * 2)
    })
  }, 240_000)

  it('the UFO bridge is the more fragile of the two', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 3 }, [
      { type: 'ufoBridge', position: [0, -35] },
      { type: 'tvTower', position: [0, 35] },
    ], { collapse: false })
    const [bridge, tower] = r.buildings
    expect(bridge.peakDrift / BUILDING_SPECS.ufoBridge.driftCapacity).toBeGreaterThan(
      tower.peakDrift / BUILDING_SPECS.tvTower.driftCapacity,
    )
  }, 120_000)
})
