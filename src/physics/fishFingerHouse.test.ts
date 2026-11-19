import { describe, expect, it } from 'vitest'
import { BUILDING_SPECS } from '../sim/buildingSpecs'
import { MEDIUM_QUAKE } from '../sim/groundMotion'
import { runQuake, type LayoutEntry } from './runQuake'

/**
 * The fish finger house exists to be compared against the medium block: same eight floors on
 * the same 14 x 12 m footprint, so anything that differs between them comes from what they are
 * made of and nothing else. These tests pin that difference.
 */

const SIDE_BY_SIDE: LayoutEntry[] = [
  { type: 'mediumBlock', position: [0, 0] },
  { type: 'fishFingerHouse', position: [40, 0] },
]
const [BLOCK, FISH] = [0, 1]

describe('the fish finger house against its concrete twin', () => {
  it('survives the default medium quake, like the block beside it', async () => {
    const r = await runQuake(MEDIUM_QUAKE, SIDE_BY_SIDE, { settleAfter: 4 })
    expect(r.buildings[BLOCK].collapsed).toBe(false)
    expect(r.buildings[FISH].collapsed).toBe(false)
  }, 120_000)

  it('collapses at a quake the concrete block shrugs off', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 3 }, SIDE_BY_SIDE, {
      settleAfter: 6,
    })
    expect(r.buildings[FISH].collapsed).toBe(true)
    expect(r.buildings[BLOCK].collapsed).toBe(false)
  }, 180_000)

  it('is driven past its own capacity while the block is still well inside its own', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 3 }, SIDE_BY_SIDE, {
      collapse: false,
    })
    const utilisation = (i: number, id: keyof typeof BUILDING_SPECS) =>
      r.buildings[i].peakDrift / BUILDING_SPECS[id].driftCapacity
    expect(utilisation(FISH, 'fishFingerHouse')).toBeGreaterThan(1)
    expect(utilisation(BLOCK, 'mediumBlock')).toBeLessThan(0.75)
  }, 180_000)

  it('being floppy, it suffers more than the block under a distant low-frequency quake', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 150, seed: 77 }, SIDE_BY_SIDE, {
      collapse: false,
    })
    expect(r.buildings[FISH].peakDrift).toBeGreaterThan(r.buildings[BLOCK].peakDrift)
  }, 120_000)

  it('does not take the block down with it when it goes', async () => {
    const r = await runQuake({ magnitude: 7, distanceKm: 10, seed: 3 }, [
      { type: 'fishFingerHouse', position: [0, 0] },
      { type: 'mediumBlock', position: [18, 0] },
    ])
    expect(r.buildings[0].collapsed).toBe(true)
    expect(r.buildings[1].collapsed).toBe(false)
    expect(r.buildings[1].finalBaseOffset).toBeLessThan(1)
  }, 180_000)

  it('stands up on its own under gravity, like every other type', async () => {
    const r = await runQuake({ magnitude: 4, distanceKm: 200, seed: 1 }, [
      { type: 'fishFingerHouse', position: [0, 0] },
    ])
    expect(r.sawNaN).toBe(false)
    expect(r.buildings[0].collapsed).toBe(false)
    expect(r.buildings[0].finalBaseOffset).toBeLessThan(0.1)
  }, 120_000)
})
