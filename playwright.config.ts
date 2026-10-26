import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Headless Chromium falls back to software WebGL, which is slow and renders differently.
    // ANGLE + SwiftShader at least keeps WebGL2 available in CI.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-pixel', use: { ...devices['Pixel 5'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
