import { expect, test } from '@playwright/test'

test('scene loads and renders without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(1500) // let a few frames render

  expect(errors).toEqual([])
})

test('select a building type and place it by tapping the ground', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: 'Small house' }).click()
  await expect(page.getByRole('button', { name: 'Small house' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await expect(page.getByTestId('placed-count')).toHaveText('0 placed')
  await page.locator('canvas').click({ position: { x: 400, y: 400 } })
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')
})

test('place a building and run a quake', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'Small house' }).click()
  await page.locator('canvas').click({ position: { x: 400, y: 400 } })
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')

  const quake = page.getByRole('button', { name: 'Start earthquake' })
  await quake.click()
  await expect(quake).toBeDisabled()
  await expect(quake).toBeEnabled({ timeout: 60_000 })

  // Reset only appears once a quake has run, and returns the scene to idle.
  await page.getByRole('button', { name: 'Reset buildings' }).click()
  await expect(page.getByRole('button', { name: 'Reset buildings' })).toBeHidden()
  await expect(page.getByTestId('placed-count')).toHaveText('1 placed')

  expect(errors).toEqual([])
})
