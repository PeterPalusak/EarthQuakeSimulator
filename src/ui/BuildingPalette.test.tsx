// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { BUILDING_LIST } from '../sim/buildingSpecs'
import { resetAppStore, useAppStore } from '../state/store'
import { BuildingPalette } from './BuildingPalette'

beforeEach(resetAppStore)
afterEach(cleanup)

describe('BuildingPalette', () => {
  it('renders exactly five building buttons, one per type', () => {
    render(<BuildingPalette />)
    for (const spec of BUILDING_LIST) {
      expect(screen.getByRole('button', { name: spec.label })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(5)
  })

  it('selecting a type sets selectedType in the store', async () => {
    const user = userEvent.setup()
    render(<BuildingPalette />)
    await user.click(screen.getByRole('button', { name: 'Small house' }))
    expect(useAppStore.getState().selectedType).toBe('smallHouse')
  })

  it('marks the selected button with aria-pressed', async () => {
    const user = userEvent.setup()
    render(<BuildingPalette />)
    const button = screen.getByRole('button', { name: 'Medium block' })
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('tapping the selected type again clears the selection', async () => {
    const user = userEvent.setup()
    render(<BuildingPalette />)
    const button = screen.getByRole('button', { name: 'Large block' })
    await user.click(button)
    await user.click(button)
    expect(useAppStore.getState().selectedType).toBeNull()
  })

  it('shows the placed count and only offers Clear all when something is placed', async () => {
    const user = userEvent.setup()
    render(<BuildingPalette />)
    expect(screen.getByTestId('placed-count')).toHaveTextContent('0 placed')
    expect(screen.queryByRole('button', { name: 'Clear all buildings' })).toBeNull()

    useAppStore.getState().place('smallHouse', [0, 0])
    expect(await screen.findByTestId('placed-count')).toHaveTextContent('1 placed')

    await user.click(screen.getByRole('button', { name: 'Clear all buildings' }))
    expect(useAppStore.getState().placed).toEqual([])
  })
})
