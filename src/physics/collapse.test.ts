import { describe, expect, it } from 'vitest'
import { FLOOR_HEIGHT } from '../sim/buildingSpecs'
import { summarise } from '../sim/damage'
import { MEDIUM_QUAKE } from '../sim/groundMotion'
import { runQuake, type LayoutEntry } from './runQuake'
import { headlessWorld, run, settle } from './testHarness'

const SEVERE = { magnitude: 8, distanceKm: 3, seed: 4 }

describe('the two ends that must both hold', () => {
  // The app must not destroy everything on the default settings, and it must be *capable* of
  // destruction when the controls are turned up. Either failure makes it pointless, and both
  // are easy to introduce while tuning something else.

  it('a medium quake leaves a small house standing', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [{ type: 'smallHouse', position: [0, 0] }], {
      settleAfter: 5,
    })
    expect(r.buildings[0].collapsed).toBe(false)
    expect(r.buildings[0].peakDrift).toBeLessThan(0.005) // not even light damage
  }, 60_000)

  it('a medium quake leaves every building standing', async () => {
    const layout: LayoutEntry[] = [
      { type: 'smallHouse', position: [-80, 0] },
      { type: 'largeHouse', position: [-40, 0] },
      { type: 'smallBlock', position: [0, 0] },
      { type: 'mediumBlock', position: [40, 0] },
      { type: 'largeBlock', position: [80, 0] },
    ]
    const r = await runQuake(MEDIUM_QUAKE, layout, { settleAfter: 5 })
    expect(r.buildings.map((b) => b.collapsed)).toEqual([false, false, false, false, false])
  }, 120_000)

  it('a severe quake collapses the 12-floor block', async () => {
    const r = await runQuake(SEVERE, [{ type: 'largeBlock', position: [0, 0] }], {
      settleAfter: 8,
    })
    expect(r.buildings[0].collapsed).toBe(true)
  }, 120_000)

  it('a severe quake still leaves the small house standing', async () => {
    const r = await runQuake(SEVERE, [{ type: 'smallHouse', position: [0, 0] }], {
      settleAfter: 8,
    })
    expect(r.buildings[0].collapsed).toBe(false)
  }, 120_000)
})

describe('collapse behaves like structural failure', () => {
  it('debris falls, comes to rest and does not tunnel through the ground', async () => {
    const r = await runQuake(SEVERE, [{ type: 'largeBlock', position: [0, 0] }], {
      settleAfter: 12,
      onStep: (world) => {
        const b = world.get('b0')
        if (!b) return
        for (const body of b.bodies) {
          // Half a floor below ground level would mean a box had passed through the slab.
          expect(body.translation().y).toBeGreaterThan(-FLOOR_HEIGHT)
        }
      },
    })
    expect(r.buildings[0].collapsed).toBe(true)
    expect(r.buildings[0].lateRoofSpeed).toBeLessThan(0.5)
  }, 120_000)

  it('does not fling a neighbouring house across the map', async () => {
    const r = await runQuake(SEVERE, [
      { type: 'largeBlock', position: [0, 0] },
      { type: 'smallHouse', position: [18, 0] },
    ])
    expect(r.buildings[0].collapsed).toBe(true)
    expect(r.buildings[1].finalBaseOffset).toBeLessThan(2)
  }, 120_000)

  it('is deterministic: same seed and layout, same damage states', async () => {
    const layout: LayoutEntry[] = [
      { type: 'largeBlock', position: [0, 0] },
      { type: 'mediumBlock', position: [40, 0] },
    ]
    const a = await runQuake(SEVERE, layout, { settleAfter: 4 })
    const b = await runQuake(SEVERE, layout, { settleAfter: 4 })
    expect(a.buildings.map((x) => x.collapsed)).toEqual(b.buildings.map((x) => x.collapsed))
    expect(a.buildings.map((x) => x.peakDrift)).toEqual(b.buildings.map((x) => x.peakDrift))
  }, 180_000)

  it('can be switched off, and then nothing fails however hard it is shaken', async () => {
    const r = await runQuake(SEVERE, [{ type: 'largeBlock', position: [0, 0] }], {
      collapse: false,
      settleAfter: 2,
    })
    expect(r.buildings[0].collapsed).toBe(false)
    expect(r.buildings[0].peakDrift).toBeGreaterThan(0.018) // it did exceed its capacity
  }, 120_000)
})

describe('damage grading', () => {
  it('reports worse damage as the quake gets stronger', async () => {
    const drifts: number[] = []
    for (const magnitude of [5.0, 6.0, 7.0]) {
      const r = await runQuake({ magnitude, distanceKm: 10, seed: 21 }, [
        { type: 'mediumBlock', position: [0, 0] },
      ])
      drifts.push(r.buildings[0].peakDrift)
    }
    expect(drifts[1]).toBeGreaterThan(drifts[0])
    expect(drifts[2]).toBeGreaterThan(drifts[1])
  }, 180_000)

  it('identifies which storey took the worst of it', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 21 }, [
      { type: 'largeBlock', position: [0, 0] },
    ])
    const b = r.buildings[0]
    expect(b.worstStorey).toBeGreaterThanOrEqual(0)
    expect(b.worstStorey).toBeLessThan(12)
    expect(summarise([b.peakDrift], b.collapsed).peak).toBeCloseTo(b.peakDrift)
  }, 60_000)
})

describe('rubble', () => {
  it('is thrown off when a member fails, and not before', async () => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', 'largeBlock', [0, 0])
      settle(world, 1)
      expect(world.rubble()).toHaveLength(0)

      world.breakStorey(b, 4)
      run(world, 1)
      expect(world.rubble().length).toBeGreaterThan(0)
    } finally {
      world.dispose()
    }
  }, 60_000)

  it('is capped, so repeated quakes cannot sink the framerate', async () => {
    const world = await headlessWorld()
    try {
      // Far more failures than the cap allows for.
      for (let n = 0; n < 6; n++) {
        const b = world.addBuilding(`b${n}`, 'largeBlock', [n * 20 - 50, 0])
        settle(world, 0.2)
        for (let i = 0; i < b.links.length; i++) world.breakStorey(b, i)
        run(world, 0.4)
      }
      expect(world.rubble().length).toBeLessThanOrEqual(110)
    } finally {
      world.dispose()
    }
  }, 120_000)

  it('comes to rest on the ground rather than falling through it', async () => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', 'largeBlock', [0, 0])
      settle(world, 1)
      world.breakStorey(b, 2)
      run(world, 8)
      for (const chunk of world.rubble()) {
        const t = chunk.translation()
        expect(Number.isFinite(t.y)).toBe(true)
        expect(t.y).toBeGreaterThan(-2)
      }
    } finally {
      world.dispose()
    }
  }, 60_000)

  it('is cleared by a reset, along with the buildings', async () => {
    const world = await headlessWorld()
    try {
      const b = world.addBuilding('x', 'largeBlock', [0, 0])
      settle(world, 1)
      world.breakStorey(b, 3)
      run(world, 1)
      expect(world.rubble().length).toBeGreaterThan(0)

      world.clear()
      expect(world.rubble()).toHaveLength(0)
      expect(world.list()).toHaveLength(0)
    } finally {
      world.dispose()
    }
  }, 60_000)
})
