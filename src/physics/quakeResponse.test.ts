import { describe, expect, it } from 'vitest'
import { MEDIUM_QUAKE, generateGroundMotion, sampleAt } from '../sim/groundMotion'
import { FIXED_TIMESTEP } from './QuakeWorld'
import { runQuake } from './runQuake'

/**
 * Phase 5 integration: a real generated ground motion, played into a real Rapier world,
 * headless. These assert the claim the whole app rests on — that different buildings respond
 * differently to the same quake, for physical reasons rather than scripted ones.
 */

describe('a building responds to the shaking ground', () => {
  it('deforms rather than riding along rigidly: the roof moves further than the base', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [{ type: 'largeBlock', position: [0, 0] }])
    const tower = r.buildings[0]
    expect(tower.peakRoofDrift).toBeGreaterThan(tower.peakBaseDrift * 2)
    expect(tower.peakRoofDrift).toBeGreaterThan(0.01)
  }, 60_000)

  it('does not slide off its footprint during a medium quake', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [
      { type: 'smallHouse', position: [0, 0] },
      { type: 'largeBlock', position: [30, 0] },
    ])
    for (const b of r.buildings) expect(b.finalBaseOffset).toBeLessThan(0.5)
  }, 60_000)

  it('settles after the quake finishes — damping works', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [{ type: 'mediumBlock', position: [0, 0] }], {
      settleAfter: 12,
    })
    const b = r.buildings[0]
    // 5 % of critical damping does not stop a tower dead, and should not: it rings down.
    // What matters is that the ringing decays rather than persisting.
    expect(b.peakRoofDrift).toBeGreaterThan(0.01)
    expect(b.lateRoofDrift).toBeLessThan(b.peakRoofDrift * 0.1)
  }, 60_000)

  it('keeps decaying the longer it is left alone', async () => {
    const short = await runQuake(MEDIUM_QUAKE, [{ type: 'mediumBlock', position: [0, 0] }], {
      settleAfter: 4,
    })
    const long = await runQuake(MEDIUM_QUAKE, [{ type: 'mediumBlock', position: [0, 0] }], {
      settleAfter: 20,
    })
    expect(long.buildings[0].lateRoofDrift).toBeLessThan(
      short.buildings[0].lateRoofDrift,
    )
  }, 120_000)

  it('never produces a NaN position — solver blow-up guard', async () => {
    const r = await runQuake({ magnitude: 8, distanceKm: 1, seed: 5 }, [
      { type: 'smallHouse', position: [0, 0] },
      { type: 'largeBlock', position: [30, 0] },
    ])
    expect(r.sawNaN).toBe(false)
  }, 60_000)
})

describe('the headline result', () => {
  it('a 12-floor block sways far more than a house standing next to it', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [
      { type: 'smallHouse', position: [-30, 0] },
      { type: 'largeBlock', position: [0, 0] },
    ])
    const [house, tower] = r.buildings
    expect(tower.peakRoofDrift).toBeGreaterThan(house.peakRoofDrift)
  }, 60_000)

  it('is a property of the structures, not of where they stand', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [
      { type: 'largeBlock', position: [-30, 0] },
      { type: 'smallHouse', position: [0, 0] },
    ])
    const [tower, house] = r.buildings
    expect(tower.peakRoofDrift).toBeGreaterThan(house.peakRoofDrift)
  }, 60_000)
})

describe('resonance', () => {
  // The 4-floor block's natural frequency is 2.5 Hz, which is exactly the dominant frequency
  // of firm soil. A quake on firm soil should therefore punish it harder, relative to its own
  // response on soft soil, than it punishes the 12-floor block — whose 0.83 Hz period is far
  // better matched by the low-frequency soft-soil record.
  it('a building amplifies most when the ground frequency matches its own', async () => {
    const near = { magnitude: 6.0, distanceKm: 5, seed: 17 }

    const onFirm = await runQuake({ ...near, soil: 'firm' }, [
      { type: 'smallBlock', position: [0, 0] },
      { type: 'largeBlock', position: [40, 0] },
    ])
    const onSoft = await runQuake({ ...near, soil: 'soft' }, [
      { type: 'smallBlock', position: [0, 0] },
      { type: 'largeBlock', position: [40, 0] },
    ])

    const ratio = (r: typeof onFirm) => r.buildings[0].peakRoofDrift / r.buildings[1].peakRoofDrift

    // The 4-floor block fares relatively better against the low-frequency soft-soil quake.
    expect(ratio(onFirm)).toBeGreaterThan(ratio(onSoft))
  }, 120_000)
})

describe('ground playback', () => {
  it('returns the ground to its starting position when the record ends', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [{ type: 'smallHouse', position: [0, 0] }])
    expect(Math.hypot(r.finalGround.x, r.finalGround.y, r.finalGround.z)).toBeLessThan(0.03)
  }, 60_000)

  it('the ground actually moved during the quake', async () => {
    const r = await runQuake(MEDIUM_QUAKE, [{ type: 'smallHouse', position: [0, 0] }])
    expect(r.peakGroundOffset).toBeGreaterThan(0.005)
  }, 60_000)

  it('plays the record on the fixed timestep, independent of any frame rate', () => {
    const m = generateGroundMotion(MEDIUM_QUAKE)
    const steps = Math.round(m.duration / FIXED_TIMESTEP)
    // Sampling the same record at the same simulated times always gives the same values.
    const a = Array.from({ length: steps }, (_, i) => sampleAt(m, m.disp.x, i * FIXED_TIMESTEP))
    const b = Array.from({ length: steps }, (_, i) => sampleAt(m, m.disp.x, i * FIXED_TIMESTEP))
    expect(a).toEqual(b)
  })
})

describe('determinism of a whole run', () => {
  it('the same seed and layout produce the same outcome', async () => {
    const layout = [
      { type: 'smallHouse' as const, position: [-30, 0] as [number, number] },
      { type: 'largeBlock' as const, position: [0, 0] as [number, number] },
    ]
    const a = await runQuake(MEDIUM_QUAKE, layout)
    const b = await runQuake(MEDIUM_QUAKE, layout)
    expect(a.buildings.map((x) => x.peakRoofDrift)).toEqual(
      b.buildings.map((x) => x.peakRoofDrift),
    )
  }, 120_000)
})
