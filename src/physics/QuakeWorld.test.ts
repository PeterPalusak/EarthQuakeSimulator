import { afterEach, describe, expect, it } from 'vitest'
import { BUILDING_LIST, FLOOR_HEIGHT, floorCentreY, targetPeriod } from '../sim/buildingSpecs'
import { QuakeWorld } from './QuakeWorld'
import {
  headlessWorld,
  lateralOffset,
  measureFreeVibrationPeriod,
  roofOf,
  run,
  settle,
} from './testHarness'

let world: QuakeWorld | null = null
afterEach(() => {
  world?.dispose()
  world = null
})

describe('stability at rest', () => {
  it('a 12-floor block stands still — every floor moves less than 1 cm over 5 s', async () => {
    world = await headlessWorld()
    const b = world.addBuilding('tower', 'largeBlock', [0, 0])
    settle(world, 1)

    const before = b.bodies.map((body) => ({ ...body.translation() }))
    run(world, 5)

    b.bodies.forEach((body, i) => {
      const t = body.translation()
      expect(Math.hypot(t.x - before[i].x, t.y - before[i].y, t.z - before[i].z)).toBeLessThan(
        0.01,
      )
    })
  })

  it('nothing sinks into the ground', async () => {
    world = await headlessWorld()
    const b = world.addBuilding('tower', 'largeBlock', [0, 0])
    run(world, 5)

    b.bodies.forEach((body, i) => {
      // within a centimetre of its nominal stacked height, and never below it
      expect(body.translation().y).toBeGreaterThan(floorCentreY(i) - 0.01)
      expect(body.translation().y).toBeCloseTo(floorCentreY(i), 2)
    })
  })

  it('all five types stand up with no jitter, drift or NaN', async () => {
    world = await headlessWorld()
    const placed = BUILDING_LIST.map((spec, i) =>
      world!.addBuilding(spec.id, spec.id, [i * 25 - 50, 0]),
    )
    run(world, 4)

    for (const b of placed) {
      for (let i = 0; i < b.bodies.length; i++) {
        const t = b.bodies[i].translation()
        expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)).toBe(true)
        expect(lateralOffset(b, i)).toBeLessThan(0.01)
      }
      expect(b.collapsed).toBe(false)
    }
  })

  it('two buildings one margin apart do not push each other away', async () => {
    world = await headlessWorld()
    const a = world.addBuilding('a', 'smallHouse', [0, 0])
    const b = world.addBuilding('b', 'smallHouse', [8, 0])
    run(world, 2)

    expect(lateralOffset(a, 0)).toBeLessThan(0.01)
    expect(lateralOffset(b, 0)).toBeLessThan(0.01)
  })
})

describe('period calibration — the key test', () => {
  // The core claim of the simulation: a building's natural period is ~0.1 s per storey, which
  // is why the tower and the house respond completely differently to the same quake.
  it.each(BUILDING_LIST)(
    '$label sways with a period of ~0.1 s per floor',
    async (spec) => {
      const period = await measureFreeVibrationPeriod(spec.id)
      const target = targetPeriod(spec.floors)
      expect(period).toBeGreaterThan(0)
      expect(Math.abs(period - target) / target).toBeLessThan(0.1) // within 10 %
    },
    60_000,
  )
})

describe('relative response', () => {
  it('under an identical impulse, taller buildings sway further', async () => {
    const peaks: number[] = []

    for (const spec of BUILDING_LIST) {
      const w = await headlessWorld()
      const b = w.addBuilding('x', spec.id, [0, 0])
      settle(w, 1)

      // Same impulse per unit mass for every type, so the comparison is about structure,
      // not about how heavy the building happens to be.
      const roof = roofOf(b)
      roof.applyImpulse({ x: spec.floorMass * 0.3, y: 0, z: 0 }, true)

      let peak = 0
      run(w, 3, () => {
        peak = Math.max(peak, Math.abs(roof.translation().x - b.origin[0]))
      })
      peaks.push(peak)
      w.dispose()
    }

    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1])
    }
  }, 60_000)
})

describe('determinism', () => {
  it('two identical worlds stepped the same way produce identical transforms', async () => {
    const trace = async () => {
      const w = await headlessWorld()
      const b = w.addBuilding('x', 'mediumBlock', [3, -4])
      settle(w, 0.5)
      roofOf(b).applyImpulse({ x: 1e6, y: 0, z: 2e5 }, true)
      const out: number[] = []
      run(w, 2, () => {
        for (const body of b.bodies) {
          const t = body.translation()
          out.push(t.x, t.y, t.z)
        }
      })
      w.dispose()
      return out
    }

    expect(await trace()).toEqual(await trace())
  }, 60_000)
})

describe('storey drift', () => {
  it('is the lateral offset between consecutive floors over the floor height', async () => {
    world = await headlessWorld()
    const b = world.addBuilding('x', 'smallBlock', [0, 0])
    settle(world, 1)
    expect(world.storeyDrift(b, 2)).toBeLessThan(1e-3)

    roofOf(b).applyImpulse({ x: b.spec.floorMass * 2, y: 0, z: 0 }, true)
    let peak = 0
    run(world, 2, () => {
      peak = Math.max(peak, world!.storeyDrift(b, 3))
    })
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThan(1) // a drift ratio, not a displacement
  })

  it('tracks the maximum seen, not the latest', async () => {
    world = await headlessWorld()
    const b = world.addBuilding('x', 'smallBlock', [0, 0])
    settle(world, 1)
    roofOf(b).applyImpulse({ x: b.spec.floorMass * 2, y: 0, z: 0 }, true)
    run(world, 1)

    const peak = Math.max(...b.peakDrift)
    run(world, 4) // let it damp out
    expect(Math.max(...b.peakDrift)).toBeGreaterThanOrEqual(peak)
    expect(world.storeyDrift(b, 3)).toBeLessThan(peak)
  })
})

describe('world management', () => {
  it('removes a building completely', async () => {
    world = await headlessWorld()
    world.addBuilding('a', 'smallHouse', [0, 0])
    world.addBuilding('b', 'largeHouse', [20, 0])
    expect(world.list()).toHaveLength(2)

    world.removeBuilding('a')
    expect(world.list()).toHaveLength(1)
    expect(world.get('a')).toBeUndefined()
    run(world, 1) // and the world still steps cleanly afterwards
  })

  it('steps on a fixed timestep regardless of the frame delta', async () => {
    world = await headlessWorld()
    expect(world.step(1 / 60)).toBe(2) // 2 x 1/120
    expect(world.step(1 / 240)).toBe(0) // accumulates instead
    expect(world.step(1 / 240)).toBe(1)
  })

  it('caps catch-up so a backgrounded tab cannot lock the page up', async () => {
    world = await headlessWorld()
    expect(world.step(30)).toBeLessThanOrEqual(8)
  })

  it('places floors with no gaps and no overlaps', async () => {
    world = await headlessWorld()
    const b = world.addBuilding('x', 'largeBlock', [0, 0])
    for (let i = 1; i < b.bodies.length; i++) {
      expect(b.bodies[i].translation().y - b.bodies[i - 1].translation().y).toBeCloseTo(
        FLOOR_HEIGHT,
        5,
      )
    }
  })
})
