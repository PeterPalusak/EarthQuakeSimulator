import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => ({
  // '/' everywhere except GitHub Pages, which serves from a project subpath.
  // The Pages workflow sets VITE_BASE=/EarthQuakeSimulator/ — see plan/08-deployment.md
  // and plan/09-container-and-azure.md. vite.config runs in Node, so process.env works here.
  base: process.env.VITE_BASE ?? '/',
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
