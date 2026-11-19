import { describe, expect, it } from 'vitest'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { MEDIUM_QUAKE } from '../sim/groundMotion'
import { findJunctions } from '../sim/connect'
import { GROUND, GROUND_DECK_Y, buildStructure } from '../sim/structure'
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

  it('a bridge starts and ends at ground level, and is carried on piers in between', () => {
    const { nodes, links } = buildStructure(BUILDING_SPECS.bridge)
    const deck = nodes.filter((n) => n.part === 'deck')
    const piers = nodes.filter((n) => n.part === 'pier')
    expect(deck.length).toBe(BUILDING_SPECS.bridge.floors)
    expect(piers.length).toBeGreaterThan(0)

    // The ends come down to the ground, so a road can run onto them.
    expect(deck[0].offset[1]).toBeCloseTo(GROUND_DECK_Y, 6)
    expect(deck.at(-1)!.offset[1]).toBeCloseTo(GROUND_DECK_Y, 6)
    // ...and the middle is up at full height.
    expect(Math.max(...deck.map((n) => n.offset[1]))).toBeCloseTo(
      BUILDING_SPECS.bridge.deckHeight!,
      6,
    )

    // Every pier carries a deck segment at full height; nothing props up the ramps.
    const grounded = links.filter((l) => l.from === GROUND)
    for (const l of grounded) {
      expect(['pier', 'deck']).toContain(nodes[l.to].part)
    }
    for (const p of piers) expect(p.offset[1]).toBeGreaterThan(1)
  })

  it('a bridge climbs monotonically to its crest and back down', () => {
    const deck = buildStructure(BUILDING_SPECS.bridge)
      .nodes.filter((n) => n.part === 'deck')
      .map((n) => n.offset[1])
    const peak = deck.indexOf(Math.max(...deck))
    for (let i = 1; i <= peak; i++) expect(deck[i]).toBeGreaterThanOrEqual(deck[i - 1])
    for (let i = deck.length - 1; i > peak; i--) {
      expect(deck[i - 1]).toBeGreaterThanOrEqual(deck[i])
    }
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

      // Isolate a segment up on the main span — an end segment now rests on the ground and
      // has nowhere to fall to.
      const target = b.nodes.findIndex(
        (n, i) =>
          n.part === 'deck' &&
          n.offset[1] > 5 &&
          b.links.some((l) => l.to === i && b.nodes[l.from]?.part === 'pier'),
      )
      expect(target).toBeGreaterThan(0)
      const toCut = b.links
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.to === target || l.from === target)
        .map(({ i }) => i)
      expect(toCut.length).toBeGreaterThanOrEqual(2)

      const before = b.bodies.map((body) => body.translation().y)
      for (const i of toCut) world.breakStorey(b, i)
      run(world, 6)

      const fell = b.bodies.map((body, i) => before[i] - body.translation().y > 0.5)
      expect(fell[target]).toBe(true) // the isolated segment came down
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
  it('the UFO bridge runs from ground to ground, with the saucer on top of the pylon', () => {
    const { nodes } = buildStructure(BUILDING_SPECS.ufoBridge)
    const deck = nodes.filter((n) => n.part === 'deck')
    const pod = nodes.find((n) => n.part === 'pod')!
    const pylon = nodes.find((n) => n.part === 'pylon')!
    expect(deck[0].offset[1]).toBeCloseTo(GROUND_DECK_Y, 6)
    expect(deck.at(-1)!.offset[1]).toBeCloseTo(GROUND_DECK_Y, 6)
    expect(Math.max(...deck.map((n) => n.offset[1]))).toBeCloseTo(
      BUILDING_SPECS.ufoBridge.deckHeight!,
      6,
    )
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

describe('junctions', () => {
  const roadLength = BUILDING_SPECS.road.footprint[0]

  it('ties two abutting roads together, and lets go when one is removed', async () => {
    const world = await headlessWorld()
    try {
      world.addBuilding('a', 'road', [0, 0])
      world.addBuilding('b', 'road', [roadLength, 0])
      world.setJunctions(
        findJunctions([
          { instanceId: 'a', type: 'road', position: [0, 0], rotation: 0 },
          { instanceId: 'b', type: 'road', position: [roadLength, 0], rotation: 0 },
        ]),
      )
      expect(world.junctionCount()).toBe(1)

      world.removeBuilding('b')
      expect(world.junctionCount()).toBe(0)
      run(world, 1) // and the world still steps cleanly with the joint gone
    } finally {
      world.dispose()
    }
  }, 60_000)

  it('a joined road and bridge rest without deforming at the join', async () => {
    const bridgeLength = BUILDING_SPECS.bridge.footprint[0]
    const x = bridgeLength / 2 + roadLength / 2
    const placed = [
      { instanceId: 'br', type: 'bridge' as const, position: [0, 0] as [number, number], rotation: 0 as const },
      { instanceId: 'rd', type: 'road' as const, position: [x, 0] as [number, number], rotation: 0 as const },
    ]
    const world = await headlessWorld()
    try {
      for (const p of placed) world.addBuilding(p.instanceId, p.type, p.position, p.rotation)
      world.setJunctions(findJunctions(placed))
      expect(world.junctionCount()).toBe(1)

      settle(world, 2)
      run(world, 3)
      for (const id of ['br', 'rd']) {
        const b = world.get(id)!
        for (let i = 0; i < b.links.length; i++) {
          expect(world.storeyDrift(b, i)).toBeLessThan(3e-3)
        }
      }
    } finally {
      world.dispose()
    }
  }, 120_000)

  it('holds the pieces together through a quake that neither collapses', async () => {
    const placed = [
      { instanceId: 'a', type: 'road' as const, position: [0, 0] as [number, number], rotation: 0 as const },
      { instanceId: 'b', type: 'road' as const, position: [roadLength, 0] as [number, number], rotation: 0 as const },
    ]
    const r = await runQuake(MEDIUM_QUAKE, [
      { type: 'road', position: [0, 0] },
      { type: 'road', position: [roadLength, 0] },
    ], {
      settleAfter: 3,
      onStep: (world, t) => {
        if (t > 0) return
        world.setJunctions(
          findJunctions(placed).map((j) => ({
            ...j,
            a: j.a === 'a' ? 'b0' : 'b1',
            b: j.b === 'a' ? 'b0' : 'b1',
          })),
        )
      },
    })
    expect(r.sawNaN).toBe(false)
    expect(r.buildings.map((b) => b.collapsed)).toEqual([false, false])
  }, 120_000)
})
