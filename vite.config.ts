import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * '/' everywhere except GitHub Pages, which serves a project site from a subpath — get this
 * wrong and you get a blank page with a 404 on every asset and no useful error.
 *
 * Normalised rather than used raw, because Vite needs a leading *and* trailing slash and the
 * value arrives from several places that disagree: the Pages workflow derives it from
 * `configure-pages`, whose `base_path` output has no trailing slash and is a bare '/' for a
 * user site, and the Dockerfile passes it as a build argument. See plan/08-deployment.md and
 * plan/09-container-and-azure.md. vite.config runs in Node, so process.env works here.
 */
function resolveBase(): string {
  const raw = process.env.VITE_BASE?.trim()
  if (!raw) return '/'
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed ? `/${trimmed}/` : '/'
}

export default defineConfig(({ mode }) => ({
  base: resolveBase(),
  plugins: [
    react(),
    tailwindcss(),
    // HTTPS on the LAN so the phone can install the PWA. Dev only — `vite preview` stays
    // plain HTTP so Playwright and the container smoke test need no certificate handling.
    ...(mode === 'development' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Rapier's WASM binary must be precached or the app is useless offline
        globPatterns: ['**/*.{js,css,html,wasm,png,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Earth Quake Generator',
        short_name: 'Quake Gen',
        display: 'fullscreen', // no browser chrome — reclaims screen for the 3D view
        orientation: 'any',
        background_color: '#111827',
        theme_color: '#111827',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node', // sim tests need no DOM; component tests opt into jsdom
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30_000,
  },
}))
