import { expect, type Page } from '@playwright/test'

/**
 * The suite runs at a desktop viewport and at a Pixel 5, so no test may hard-code a pixel
 * position: 400 px across is the middle of the scene on one and off-screen on the other.
 * Click points are fractions of the canvas, chosen to sit clear of the overlay.
 */
export async function tapGround(page: Page, fx = 0.35, fy = 0.5) {
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } })
}

export async function waitForScene(page: Page) {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  // Rapier is a separate chunk; give it time to download and instantiate.
  await page.waitForTimeout(2000)
}

export async function placeBuilding(page: Page, label: string, fx?: number, fy?: number) {
  await page.getByRole('button', { name: label }).click()
  await tapGround(page, fx, fy)
}

/** Opens the quake settings panel if it is collapsed, as it is by default on a phone. */
export async function openQuakeSettings(page: Page) {
  const show = page.getByRole('button', { name: 'Show quake settings' })
  if (await show.isVisible().catch(() => false)) await show.click()
}

export async function runQuakeAndWait(page: Page, timeout = 180_000) {
  const quake = page.getByRole('button', { name: 'Start earthquake' })
  await quake.click()
  await expect(quake).toBeDisabled()
  await expect(quake).toBeEnabled({ timeout })
}
