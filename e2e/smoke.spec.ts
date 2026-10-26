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
