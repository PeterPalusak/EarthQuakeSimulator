import { describe, expect, it } from 'vitest'
import { PRESETS } from '../sim/quakeScales'
import { runQuake, type LayoutEntry } from './runQuake'

const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!
  return { magnitude: p.magnitude, distanceKm: p.distanceKm, seed: 77 }
}

const HOUSE_AND_TOWER: LayoutEntry[] = [
  { type: 'smallHouse', position: [-40, 0] },
  { type: 'smallBlock', position: [0, 0] },
  { type: 'largeBlock', position: [45, 0] },
]

describe('the headline claim of the finished application', () => {
  /**
   * Distant large quakes punish tall buildings; near small quakes punish short ones.
   *
   * This depends on the distance-dependent frequency shift in groundMotion, the period
   * calibration in buildingSpecs, and the drift measurement in QuakeWorld all being correct at
   * the same time — so it is both the most valuable test in the suite and the one most likely
   * to catch a regression anywhere in the physics chain.
   */
  it('distant large quakes punish tall buildings; near small quakes punish short ones', async () => {
    const distant = await runQuake(preset('distant'), HOUSE_AND_TOWER, { collapse: false })
    const near = await runQuake(preset('sharp'), HOUSE_AND_TOWER, { collapse: false })

    const byType = (r: Awaited<ReturnType<typeof runQuake>>) =>
      Object.fromEntries(r.buildings.map((b) => [b.type, b.peakDrift]))

    const d = byType(distant)
    const n = byType(near)

    // Under the distant rumble the tower suffers more than the house.
    expect(d.largeBlock).toBeGreaterThan(d.smallHouse)

    // And the short, stiff buildings fare relatively better far away than close up.
    expect(n.smallBlock / n.largeBlock).toBeGreaterThan(d.smallBlock / d.largeBlock)
    expect(n.smallHouse / n.largeBlock).toBeGreaterThan(d.smallHouse / d.largeBlock)
  }, 240_000)

  it('"The big one" collapses something; "Moderate local" collapses nothing', async () => {
    const moderate = await runQuake(preset('moderate'), HOUSE_AND_TOWER, { settleAfter: 4 })
    expect(moderate.buildings.some((b) => b.collapsed)).toBe(false)

    const big = await runQuake(preset('bigone'), HOUSE_AND_TOWER, { settleAfter: 6 })
    expect(big.buildings.some((b) => b.collapsed)).toBe(true)
  }, 240_000)
})

describe('the controls change the quake', () => {
  it('a higher magnitude drives more drift', async () => {
    const weak = await runQuake({ magnitude: 5, distanceKm: 10, seed: 31 }, HOUSE_AND_TOWER, {
      collapse: false,
    })
    const strong = await runQuake({ magnitude: 7, distanceKm: 10, seed: 31 }, HOUSE_AND_TOWER, {
      collapse: false,
    })
    expect(strong.buildings[2].peakDrift).toBeGreaterThan(weak.buildings[2].peakDrift)
  }, 240_000)

  it('a greater distance drives less drift at the same magnitude', async () => {
    const near = await runQuake({ magnitude: 6.5, distanceKm: 5, seed: 31 }, HOUSE_AND_TOWER, {
      collapse: false,
    })
    const far = await runQuake({ magnitude: 6.5, distanceKm: 180, seed: 31 }, HOUSE_AND_TOWER, {
      collapse: false,
    })
    const total = (r: Awaited<ReturnType<typeof runQuake>>) =>
      r.buildings.reduce((s, b) => s + b.peakDrift, 0)
    expect(total(far)).toBeLessThan(total(near))
  }, 240_000)

  it('the bearing steers the shaking toward the epicentre', async () => {
    const alongX = await runQuake(
      { magnitude: 7, distanceKm: 10, seed: 31, bearing: 0 },
      [{ type: 'largeBlock', position: [0, 0] }],
      { collapse: false, settleAfter: 0 },
    )
    const alongZ = await runQuake(
      { magnitude: 7, distanceKm: 10, seed: 31, bearing: Math.PI / 2 },
      [{ type: 'largeBlock', position: [0, 0] }],
      { collapse: false, settleAfter: 0 },
    )
    // Same energy, different direction — so the totals should be comparable but not identical.
    expect(alongX.buildings[0].peakDrift).toBeGreaterThan(0)
    expect(alongZ.buildings[0].peakDrift).toBeGreaterThan(0)
    expect(alongX.buildings[0].peakDrift).not.toBe(alongZ.buildings[0].peakDrift)
  }, 240_000)

  it('every preset runs without blowing the solver up', async () => {
    for (const p of PRESETS) {
      const r = await runQuake(
        { magnitude: p.magnitude, distanceKm: p.distanceKm, seed: 5 },
        [{ type: 'largeBlock', position: [0, 0] }],
        { settleAfter: 2 },
      )
      expect(r.sawNaN).toBe(false)
    }
  }, 300_000)

  it('the extremes of both sliders stay stable', async () => {
    for (const params of [
      { magnitude: 8, distanceKm: 1, seed: 2 },
      { magnitude: 4, distanceKm: 200, seed: 2 },
      { magnitude: 8, distanceKm: 200, seed: 2 },
      { magnitude: 4, distanceKm: 1, seed: 2 },
    ]) {
      const r = await runQuake(params, [{ type: 'largeBlock', position: [0, 0] }], {
        settleAfter: 1,
      })
      expect(r.sawNaN).toBe(false)
    }
  }, 300_000)
})
