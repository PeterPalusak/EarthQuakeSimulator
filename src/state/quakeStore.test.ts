import { beforeEach, describe, expect, it } from 'vitest'
import { previewIntensity, resetQuakeStore, useQuakeStore } from './quakeStore'

const state = () => useQuakeStore.getState()

beforeEach(resetQuakeStore)

describe('quake state machine', () => {
  it('starts idle with no motion', () => {
    expect(state().phase).toBe('idle')
    expect(state().motion).toBeNull()
  })

  it('start() moves idle -> running and populates motion', () => {
    state().start()
    expect(state().phase).toBe('running')
    expect(state().motion).not.toBeNull()
    expect(state().motion!.samples).toBeGreaterThan(0)
    expect(state().elapsed).toBe(0)
  })

  it('tick() past the duration moves running -> finished', () => {
    state().start()
    const duration = state().motion!.duration
    state().tick(duration / 2)
    expect(state().phase).toBe('running')
    state().tick(duration)
    expect(state().phase).toBe('finished')
    expect(state().elapsed).toBe(duration)
  })

  it('tick() does nothing while idle', () => {
    state().tick(1)
    expect(state().elapsed).toBe(0)
    expect(state().phase).toBe('idle')
  })

  it('start() while running is a no-op', () => {
    state().start()
    const motion = state().motion
    state().tick(0.5)
    state().start()
    expect(state().motion).toBe(motion)
    expect(state().elapsed).toBe(0.5)
  })

  it('reset() returns to idle, clears motion and bumps the reset token', () => {
    state().start()
    const before = state().resetToken
    state().reset()
    expect(state().phase).toBe('idle')
    expect(state().motion).toBeNull()
    expect(state().elapsed).toBe(0)
    expect(state().resetToken).toBe(before + 1)
  })

  it('two consecutive runs use different seeds', () => {
    state().start()
    const first = state().motion!
    state().reset()
    state().start()
    const second = state().motion!
    expect(second.params.seed).not.toBe(first.params.seed)
    expect(Array.from(second.acc.x)).not.toEqual(Array.from(first.acc.x))
  })

  it('can run again after finishing', () => {
    state().start()
    state().tick(1e6)
    expect(state().phase).toBe('finished')
    state().start()
    expect(state().phase).toBe('running')
  })
})

describe('settings', () => {
  it('defaults to the medium earthquake from the requirement', () => {
    expect(state().settings.magnitude).toBe(5.5)
    expect(state().settings.distanceKm).toBe(10)
    expect(previewIntensity(state().settings).pga).toBeCloseTo(0.2, 1)
  })

  it('a quake uses the chosen settings', () => {
    state().setSettings({ magnitude: 7, distanceKm: 100 })
    state().start()
    expect(state().motion!.params.magnitude).toBe(7)
    expect(state().motion!.params.distanceKm).toBe(100)
  })

  it('raising the magnitude raises the PGA; raising the distance lowers it', () => {
    const base = previewIntensity({ magnitude: 5.5, distanceKm: 10, bearing: 0 })
    const stronger = previewIntensity({ magnitude: 6.5, distanceKm: 10, bearing: 0 })
    const further = previewIntensity({ magnitude: 5.5, distanceKm: 80, bearing: 0 })
    expect(stronger.pga).toBeGreaterThan(base.pga)
    expect(further.pga).toBeLessThan(base.pga)
  })

  it('a bigger magnitude shakes for longer', () => {
    expect(previewIntensity({ magnitude: 7, distanceKm: 10, bearing: 0 }).duration).toBeGreaterThan(
      previewIntensity({ magnitude: 5, distanceKm: 10, bearing: 0 }).duration,
    )
  })
})
