import { expect, test } from '@playwright/test'
import { placeBuilding, runQuakeAndWait, tapGround, waitForScene } from './helpers'

test('scene loads and renders without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await waitForScene(page)
  expect(errors).toEqual([])
})

test('select a building type and place it by tapping the ground', async ({ page }) => {
  await waitForScene(page)

  await page.getByRole('button', { name: 'Small house' }).click()
  await expect(page.getByRole('button', { name: 'Small house' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await expect(page.getByTestId('placed-count')).toHaveText('0 placed')
  await tapGround(page)
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')
})

test('place a building and run a quake', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await waitForScene(page)
  await placeBuilding(page, 'Small house')
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')

  await runQuakeAndWait(page, 60_000)

  // Reset only appears once a quake has run, and returns the scene to idle with the
  // buildings still placed.
  await page.getByRole('button', { name: 'Reset buildings' }).click()
  await expect(page.getByRole('button', { name: 'Reset buildings' })).toBeHidden()
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')

  expect(errors).toEqual([])
})
