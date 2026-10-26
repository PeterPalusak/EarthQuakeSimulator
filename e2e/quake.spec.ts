import { expect, test } from '@playwright/test'
import { openQuakeSettings, placeBuilding, runQuakeAndWait, waitForScene } from './helpers'

test.describe('quake controls', () => {
  test('presets set both sliders and the intensity readout follows', async ({ page }) => {
    await waitForScene(page)
    await openQuakeSettings(page)

    const preview = page.getByTestId('intensity-preview')
    const moderate = await preview.textContent()

    await page.getByRole('button', { name: 'The big one' }).click()
    await expect(page.getByRole('button', { name: 'The big one' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(preview).not.toHaveText(moderate ?? '')
    await expect(page.getByRole('slider', { name: 'Earthquake magnitude' })).toHaveValue('8')
  })

  // "The big one" is an M8, which shakes for about 50 seconds of simulated time.
  test('a severe quake collapses a tall block and the summary says so', async ({ page }) => {
    test.setTimeout(300_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await waitForScene(page)
    await placeBuilding(page, 'Large block')
    await expect(page.getByTestId('placed-count')).toHaveText('1 placed')

    await openQuakeSettings(page)
    await page.getByRole('button', { name: 'The big one' }).click()
    await runQuakeAndWait(page)

    await expect(page.getByTestId('damage-summary')).toBeVisible()
    await expect(page.getByTestId('damage-counts')).toContainText('1 collapsed')

    expect(errors).toEqual([])
  })

  test('a moderate quake leaves a house intact', async ({ page }) => {
    test.setTimeout(120_000)
    await waitForScene(page)
    await placeBuilding(page, 'Small house')

    await openQuakeSettings(page)
    await page.getByRole('button', { name: 'Moderate local' }).click()
    await runQuakeAndWait(page, 60_000)

    await expect(page.getByTestId('damage-counts')).toContainText('0 collapsed')
    await expect(page.getByTestId('damage-counts')).toContainText('1 intact')
  })
})
