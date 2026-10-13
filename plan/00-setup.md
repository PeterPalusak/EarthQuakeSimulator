# Phase 0 — Project setup

**Goal:** a scaffolded, type-checked, testable repo that builds and deploys nothing interesting yet.

**Depends on:** nothing.

**Why it is its own phase:** every later phase assumes the fixed-timestep decision, the seeded
PRNG and the `src/sim` import boundary. Retrofitting those is painful; establishing them on an
empty repo costs an hour.

---

## Tasks

### 0.1 Scaffold in place

The repository root *is* the project root. Do not create a subfolder.

```bash
npm create vite@latest . -- --template react-ts
```

Vite will warn that the directory is not empty — that is expected (`README.md`, `.gitignore`,
`Description.md`, `Implementation_Plan.md`, `plan/`). Choose to continue without overwriting.
Afterwards, verify by hand that `Description.md` and `README.md` are untouched.

### 0.2 Dependencies

```bash
npm i three @react-three/fiber @react-three/drei @react-three/rapier zustand
npm i -D @types/three tailwindcss @tailwindcss/vite vite-plugin-pwa
npm i -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event
npm i -D @vitejs/plugin-basic-ssl @playwright/test r3f-perf
npx playwright install chromium
```

### 0.3 `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  base: '/EarthQuakeSimulator/',      // GitHub Pages project path — see plan/08-deployment.md
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),                        // HTTPS on the LAN so the phone can install the PWA
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Rapier's WASM binary must be precached or the app is useless offline
        globPatterns: ['**/*.{js,css,html,wasm,png,svg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Earth Quake Generator',
        short_name: 'Quake Gen',
        display: 'fullscreen',         // no browser chrome — reclaims screen for the 3D view
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
    environment: 'node',               // sim tests need no DOM; component tests opt into jsdom
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

> `base` is only correct for GitHub Pages. If deploying to Cloudflare Pages or Netlify instead,
> set it to `'/'`. Getting this wrong produces a blank page with 404s on every asset and no
> useful error message.

### 0.4 `npm` scripts

```json
{
  "scripts": {
    "dev":        "vite",
    "dev:lan":    "vite --host",
    "build":      "tsc -b && vite build",
    "preview":    "vite preview --host",
    "test":       "vitest run",
    "test:watch": "vitest",
    "test:e2e":   "playwright test",
    "lint":       "eslint ."
  }
}
```

### 0.5 Enforce the `src/sim` import boundary

The rule from the index — `src/sim/**` imports no rendering or physics library — only survives if
a machine checks it. In `eslint.config.js`:

```js
{
  files: ['src/sim/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['three', 'three/*', '@react-three/*', '@dimforge/*'],
          message: 'src/sim must stay pure TypeScript — it is the testable core. See Implementation_Plan.md.' },
      ],
    }],
  },
}
```

### 0.6 Seeded PRNG — `src/sim/random.ts`

Needed before phase 4, and trivial, so do it now.

```ts
/** mulberry32 — small, fast, good enough for synthetic ground motion. Deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box–Muller. White noise must be Gaussian, not uniform, to filter into realistic motion. */
export function gaussian(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s }
    let u = 0, v = 0, s = 0
    do {
      u = rng() * 2 - 1
      v = rng() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const mul = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * mul
    return u * mul
  }
}
```

### 0.7 Folder skeleton

Create the directories with a `.gitkeep` so the structure is visible from commit one:

```
src/
  state/        ui/        scene/        sim/
e2e/
public/         # icon-192.png, icon-512.png
```

### 0.8 Global CSS — the Android gesture fix

In `src/index.css`, after the Tailwind import. This is small and easy to forget, and without it
the touch controls in phase 1 are unusable on a phone:

```css
html, body, #root { height: 100%; margin: 0; overscroll-behavior: none; }

canvas {
  touch-action: none;        /* stop the browser stealing pinch as page-zoom */
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

`overscroll-behavior: none` kills pull-to-refresh. Without it, an upward drag to orbit the camera
reloads the page instead.

### 0.9 CI

Add `.github/workflows/deploy.yml` from [Description.md](../Description.md) §3.7, but **comment
out the deploy job for now** — leave only checkout → install → `npm test` → `npm run build`.
Deployment is switched on in phase 8. The point today is that every push is type-checked and
tested from the very first commit.

---

## Tests for this phase

One test, proving the toolchain works end to end:

```ts
// src/sim/random.test.ts
it('is deterministic for a given seed', () => {
  const a = Array.from({ length: 5 }, mulberry32(42))
  const b = Array.from({ length: 5 }, mulberry32(42))
  expect(a).toEqual(b)
})

it('differs between seeds', () => {
  expect(Array.from({ length: 5 }, mulberry32(1)))
    .not.toEqual(Array.from({ length: 5 }, mulberry32(2)))
})

it('produces roughly standard-normal values', () => {
  const g = gaussian(mulberry32(7))
  const xs = Array.from({ length: 10000 }, g)
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
  expect(Math.abs(mean)).toBeLessThan(0.05)
  expect(sd).toBeGreaterThan(0.95)
  expect(sd).toBeLessThan(1.05)
})
```

---

## Definition of done

- [ ] `npm run dev` serves a page at `localhost:5173`
- [ ] `npm run build` completes with no TypeScript errors
- [ ] `npm test` passes the three PRNG tests
- [ ] ESLint rejects a deliberate `import * as THREE from 'three'` added to a file in `src/sim/`
- [ ] CI runs green on push
- [ ] `Description.md`, `README.md` and `plan/` survived the Vite scaffold intact

---

## Gotchas

- **Vite scaffolding into a non-empty directory.** It offers to remove existing files. Decline,
  and verify the markdown files afterwards.
- **Tailwind v4 is configured through the Vite plugin**, not a `tailwind.config.js` and not a
  PostCSS file. Guides written for v3 will send you down the wrong path.
- **`@vitejs/plugin-basic-ssl` makes `npm run dev` serve HTTPS**, so the phone will show a
  certificate warning the first time. Accept it once per device. It is also why the dev URL is
  `https://`, not `http://`.
