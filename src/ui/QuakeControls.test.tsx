// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PRESETS, distanceToSlider } from '../sim/quakeScales'
import { resetQuakeStore, useQuakeStore } from '../state/quakeStore'
import { QuakeControls } from './QuakeControls'

beforeEach(resetQuakeStore)
afterEach(cleanup)

const settings = () => useQuakeStore.getState().settings

describe('QuakeControls', () => {
  it('renders both sliders with accessible names', () => {
    render(<QuakeControls />)
    expect(screen.getByRole('slider', { name: 'Earthquake magnitude' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Epicentre distance' })).toBeInTheDocument()
  })

  it('starts at the medium earthquake from the requirement', () => {
    render(<QuakeControls />)
    expect(screen.getByRole('slider', { name: 'Earthquake magnitude' })).toHaveValue('5.5')
    expect(screen.getByTestId('intensity-preview')).toHaveTextContent('0.200 g')
  })

  it('moving the magnitude slider updates the store and the readout', () => {
    render(<QuakeControls />)
    const slider = screen.getByRole('slider', { name: 'Earthquake magnitude' })
    fireEvent.change(slider, { target: { value: '7.2' } })
    expect(settings().magnitude).toBeCloseTo(7.2)
    expect(screen.getByText(/Major/)).toBeInTheDocument()
  })

  it('the distance slider is logarithmic', () => {
    render(<QuakeControls />)
    const slider = screen.getByRole('slider', { name: 'Epicentre distance' })
    fireEvent.change(slider, { target: { value: '1' } })
    expect(settings().distanceKm).toBeCloseTo(200)
    fireEvent.change(slider, { target: { value: '0' } })
    expect(settings().distanceKm).toBeCloseTo(1)
    fireEvent.change(slider, { target: { value: String(distanceToSlider(25)) } })
    expect(settings().distanceKm).toBeCloseTo(25)
  })

  it('a stronger quake shows a higher PGA in the readout', () => {
    render(<QuakeControls />)
    const before = screen.getByTestId('intensity-preview').textContent
    fireEvent.change(screen.getByRole('slider', { name: 'Earthquake magnitude' }), {
      target: { value: '7.5' },
    })
    expect(screen.getByTestId('intensity-preview').textContent).not.toBe(before)
    expect(screen.getByTestId('intensity-preview')).toHaveTextContent(/1\.\d\d\d g/)
  })

  it('a preset sets both values at once and marks itself selected', async () => {
    const user = userEvent.setup()
    render(<QuakeControls />)
    const distant = PRESETS.find((p) => p.id === 'distant')!
    const button = screen.getByRole('button', { name: distant.name })
    await user.click(button)
    expect(settings().magnitude).toBe(distant.magnitude)
    expect(settings().distanceKm).toBe(distant.distanceKm)
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables itself while a quake is running', () => {
    render(<QuakeControls />)
    act(() => useQuakeStore.getState().start())
    expect(screen.getByRole('slider', { name: 'Earthquake magnitude' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'The big one' })).toBeDisabled()
  })
})
