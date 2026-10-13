# Phase 1 — 3D scene & camera

**Goal:** a flat ground plane you can orbit, pinch-zoom and pan with your fingers on a phone.

**Depends on:** phase 0.

**Requirements covered:** *"Have a 3D environment which you can rotate by finger (in all 3
directions)"*, *"At the moment the base will be just flat."*

This phase has no physics, no buildings and no UI. It exists so the camera feel is right before
anything else is layered on top — camera problems found in phase 6 are expensive, and camera feel
can only be judged on a real touchscreen.

---

## Tasks

### 1.1 `src/scene/Scene.tsx` — the canvas

```tsx
<Canvas
  shadows
  dpr={[1, 2]}                      // cap at 2× — retina phones will otherwise render 3× and crawl
  camera={{ position: [60, 45, 60], fov: 50, near: 0.1, far: 1000 }}
  gl={{ antialias: true, powerPreference: 'high-performance' }}
>
  <Lighting />
  <Ground />
  <CameraControls />
  {import.meta.env.DEV && <Perf position="top-left" />}
</Canvas>
```

The camera starts at ~85 m out, looking down at roughly 30°. That frames a 12-floor (36 m) block
comfortably while still showing enough ground to place several buildings.

`dpr={[1, 2]}` is the single highest-value performance line in the project. A phone at native
device pixel ratio 3 renders 2.25× more pixels than at 2, for no visible gain on a 6" screen.

### 1.2 `src/scene/CameraControls.tsx` — "rotate in all 3 directions"

```tsx
<OrbitControls
  makeDefault
  enableDamping dampingFactor={0.08}   // inertia; without it, touch dragging feels sticky
  target={[0, 5, 0]}                   // look slightly above ground, not at the horizon
  minDistance={15} maxDistance={250}
  maxPolarAngle={Math.PI * 0.49}       // never let the camera go below the ground plane
  minPolarAngle={0.1}
  touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
  mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
/>
```

Gesture mapping, which is what the requirement is really asking for:

| Gesture | Result |
|---|---|
| One finger drag | Orbit — yaw left/right, pitch up/down |
| Two finger pinch | Zoom in / out |
| Two finger drag | Pan across the ground |

`maxPolarAngle` just under π/2 is important: let the camera dip below the ground plane and the
scene turns inside out, which is deeply confusing and reads as a bug.

### 1.3 `src/scene/Ground.tsx`

A flat plane plus a grid. The grid is not decoration — it previews the 1 m placement snapping from
phase 2 and gives the eye a reference for judging shake amplitude in phase 5.

```tsx
<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
  <planeGeometry args={[200, 200]} />
  <meshStandardMaterial color="#6b7f5e" />
</mesh>
<Grid
  args={[200, 200]} cellSize={1} sectionSize={10}
  cellColor="#5a6b4f" sectionColor="#44523c"
  fadeDistance={160} infiniteGrid={false}
/>
```

Keep this a plain mesh for now. It becomes a kinematic Rapier body in phase 3 and starts moving in
phase 5 — the mesh and material do not change.

### 1.4 `src/scene/Lighting.tsx`

```tsx
<hemisphereLight args={['#bcd4ff', '#6b7f5e', 0.6]} />
<directionalLight
  castShadow position={[50, 80, 30]} intensity={2.2}
  shadow-mapSize={[2048, 2048]}
  shadow-camera-left={-100} shadow-camera-right={100}
  shadow-camera-top={100} shadow-camera-bottom={-100}
/>
```

Shadows matter more than they look like they should: they are the main cue for *where a building
sits on the ground*, and in phase 5 a shadow that stays put while the building sways is what makes
the sway read as motion rather than as the camera moving.

Widen the shadow camera frustum to cover the whole 200 m ground, otherwise shadows vanish at the
edges of the build area.

### 1.5 `src/App.tsx` — layout shell

Full-bleed canvas, with the UI as an absolutely positioned overlay. Create the empty slots now so
phases 2 and 5 have somewhere to plug in:

```tsx
<div className="relative h-full w-full bg-slate-900">
  <Scene />
  <div className="pointer-events-none absolute inset-0">
    {/* top bar  → phase 2 BuildingPalette */}
    {/* right    → phase 5 QuakeButton */}
  </div>
</div>
```

`pointer-events-none` on the overlay with `pointer-events-auto` on the actual controls is what
lets a drag that starts on empty overlay space still orbit the camera. Without it, the overlay
swallows the gesture and the camera appears frozen over most of the screen.

---

## Tests for this phase

Automated coverage here is thin on purpose — there is no logic yet, and asserting on WebGL output
costs more than it returns. One E2E smoke test:

```ts
// e2e/smoke.spec.ts
test('scene loads and renders', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(1000)        // let a few frames render
  expect(errors).toEqual([])
})
```

Run Playwright **headed or with `--use-gl=angle`**; headless Chromium falls back to software
WebGL, which is slow and renders differently.

The real test for this phase is manual, on a phone — see the checklist below.

---

## Definition of done

- [ ] Ground plane with grid renders, lit, with a visible horizon
- [ ] **On a real Android phone**, over `npm run dev:lan`:
  - [ ] One-finger drag orbits smoothly, with inertia, in both yaw and pitch
  - [ ] Pinch zooms, and does **not** trigger the browser's own page zoom
  - [ ] Two-finger drag pans
  - [ ] Dragging upward does **not** trigger pull-to-refresh
  - [ ] The camera cannot be pushed below the ground
- [ ] `r3f-perf` shows a steady 60 fps on the phone
- [ ] No console errors
- [ ] `npm test` and `npm run test:e2e` pass

---

## Gotchas

- **`touch-action: none` on the canvas is mandatory** (set in phase 0.8). Without it Android
  Chrome intercepts pinch as page zoom and the camera will not respond. This is the single most
  common reason touch controls "don't work" and it looks like an OrbitControls bug.
- **Do not attach `OrbitControls` to `window`.** Scoped to the canvas, it cooperates with the UI
  overlay; on `window` it will fight the phase-7 sliders for drag events.
- **`enableDamping` requires the controls to be updated every frame.** `drei`'s component handles
  this; a hand-rolled `three/examples` import does not, and the symptom is a camera that stops
  dead instead of gliding.
- **Shadow acne** on the flat ground is likely. Fix with `shadow-bias={-0.0005}` on the
  directional light rather than by disabling shadows.
