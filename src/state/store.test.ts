import { beforeEach, describe, expect, it } from 'vitest'
import { resetAppStore, useAppStore } from './store'

const state = () => useAppStore.getState()

beforeEach(resetAppStore)

describe('selection', () => {
  it('starts with nothing selected', () => {
    expect(state().selectedType).toBeNull()
    expect(state().placed).toEqual([])
  })

  it('selects a building type', () => {
    state().select('smallBlock')
    expect(state().selectedType).toBe('smallBlock')
  })

  it('clears the instance selection when a build tool is picked', () => {
    state().place('smallHouse', [0, 0])
    state().selectInstance(state().placed[0].instanceId)
    state().select('largeHouse')
    expect(state().selectedInstanceId).toBeNull()
  })
})

describe('place', () => {
  it('snaps the position to the 1 m grid', () => {
    state().place('smallHouse', [3.4, -7.6])
    expect(state().placed[0].position).toEqual([3, -8])
  })

  it('gives every placed building a unique id', () => {
    state().place('smallHouse', [0, 0])
    state().place('smallHouse', [20, 0])
    const ids = state().placed.map((p) => p.instanceId)
    expect(new Set(ids).size).toBe(2)
  })

  it('refuses an overlapping position and returns null', () => {
    expect(state().place('smallHouse', [0, 0])).not.toBeNull()
    expect(state().place('smallHouse', [1, 0])).toBeNull()
    expect(state().placed).toHaveLength(1)
  })

  it('refuses a position off the ground', () => {
    expect(state().place('smallHouse', [500, 0])).toBeNull()
    expect(state().placed).toHaveLength(0)
  })
})

describe('remove and clear', () => {
  it('removes one building', () => {
    const id = state().place('smallHouse', [0, 0])!
    state().place('smallHouse', [20, 0])
    state().remove(id)
    expect(state().placed).toHaveLength(1)
    expect(state().placed[0].instanceId).not.toBe(id)
  })

  it('drops the instance selection when that building is removed', () => {
    const id = state().place('smallHouse', [0, 0])!
    state().selectInstance(id)
    state().remove(id)
    expect(state().selectedInstanceId).toBeNull()
  })

  it('clears everything', () => {
    state().place('smallHouse', [0, 0])
    state().place('smallHouse', [20, 0])
    state().clear()
    expect(state().placed).toEqual([])
  })
})

describe('rotation', () => {
  it('starts unrotated and cycles through four quarter turns', () => {
    expect(state().rotation).toBe(0)
    const seen = [state().rotation]
    for (let i = 0; i < 4; i++) {
      state().rotate()
      seen.push(state().rotation)
    }
    expect(seen).toEqual([0, 1, 2, 3, 0])
  })

  it('places at the current rotation', () => {
    state().rotate()
    state().place('road', [0, 0])
    expect(state().placed[0].rotation).toBe(1)
  })

  it('is sticky, so a row of road is a row of taps', () => {
    state().rotate()
    state().place('smallHouse', [-30, 0])
    state().place('smallHouse', [30, 0])
    expect(state().placed.map((p) => p.rotation)).toEqual([1, 1])
  })

  it('turns the selected building in place', () => {
    const id = state().place('road', [0, 0])!
    state().selectInstance(id)
    state().rotate()
    expect(state().placed[0].rotation).toBe(1)
  })

  it('refuses a turn that would push the selection into a neighbour', () => {
    // A road turned across this house would overlap it; the house stays put and so does the road.
    const road = state().place('road', [0, 0])!
    state().place('smallHouse', [0, 20])
    state().selectInstance(road)
    state().rotate()
    expect(state().placed.find((p) => p.instanceId === road)!.rotation).toBe(0)
  })

  it('rejects a placement that does not fit at the current rotation', () => {
    state().rotate()
    state().rotate() // back along X
    expect(state().place('road', [80, 0])).toBeNull()
  })
})
