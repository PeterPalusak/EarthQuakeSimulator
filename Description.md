# Earth Quake Generator
This is an Earth Quake Generator

## 1. Setup

### Platform decision: Web app (PWA), not native Android

| | Web (Three.js/WebGL) | Native Android (Unity/Godot) |
|---|---|---|
| Touch rotate/pinch | Works out of the box | Works |
| Runs on phone | Yes — plus desktop, tablet, anything | Android only |
| Install on phone | "Add to home screen" (PWA), full screen, offline | Play Store / APK sideload |
| Iteration speed | Save → browser reloads in <1s | Build → deploy → launch cycle |
| Physics quality needed here | Rapier is more than enough | Overkill |
| Sharing with others | Send a URL | Send an APK |

The app is a single interactive 3D scene with a handful of rigid bodies. That is comfortably
inside what WebGL and a WASM physics engine handle at 60 fps on a mid-range phone. Going native
buys nothing for this feature set and costs build/distribution friction on every iteration.

If a real Play Store app is ever needed, the same codebase wraps in **Capacitor** with no rewrite.

### Stack

| Concern | Choice | Why |
|---|---|---|
| Build tool | **Vite** + TypeScript | Instant HMR, zero config, static output |
| UI | **React** | Palette, red button, later the magnitude/distance sliders |
| 3D | **Three.js** via **@react-three/fiber** | Scene as components; `drei` gives camera controls for free |
| Physics | **Rapier** via **@react-three/rapier** | Rust/WASM, deterministic, fast, stable stacked-box joints |
| State | **Zustand** | Selected building, placed buildings, quake running — small and flat |
| Styling | **Tailwind CSS** | Top bar + right-side button, fast |
| Installable | **vite-plugin-pwa** | Add-to-home-screen on Android, offline capable |
| Tests | **Vitest** | For the quake signal generator (pure, no DOM needed) |

### Bootstrap

Prerequisite: **Node.js 20 LTS or newer**. On Windows, install with `winget install OpenJS.NodeJS.LTS`,
or use [nvm-windows](https://github.com/coreybutler/nvm-windows) if you juggle Node versions.

Scaffold **in place**, into this repository root — not into a subfolder:

```bash
npm create vite@latest . -- --template react-ts
npm i three @react-three/fiber @react-three/drei @react-three/rapier zustand
npm i -D tailwindcss @tailwindcss/vite @types/three vite-plugin-pwa vitest
npm i -D @vitejs/plugin-basic-ssl @playwright/test   # phone testing + E2E, see 3.7
npm run dev
```

### npm scripts

```json
{
  "scripts": {
    "dev":       "vite",
    "dev:lan":   "vite --host",
    "build":     "tsc -b && vite build",
    "preview":   "vite preview --host",
    "test":      "vitest run",
    "test:watch":"vitest",
    "test:e2e":  "playwright test"
  }
}
```

### Project layout

```
src/
  App.tsx                   # layout: Scene + overlay UI
  state/store.ts            # zustand: selectedBuildingType, placedBuildings[], quakeState
  ui/
    BuildingPalette.tsx     # top bar, 5 building types
    QuakeButton.tsx         # right-side red button
    QuakeControls.tsx       # (phase 2) magnitude + epicentre distance sliders
  scene/
    Scene.tsx               # canvas, lights, camera controls
    Ground.tsx              # kinematic ground body - this is what shakes
    Building.tsx            # stack of floor rigid bodies + joints
    PlacementGhost.tsx      # raycast preview under the finger before placing
  sim/
    groundMotion.ts         # PURE: magnitude + distance -> acceleration time history
    groundMotion.test.ts
    buildingSpecs.ts        # the 5 building types: floors, footprint, mass, joint strength
e2e/
  smoke.spec.ts             # Playwright: place a building, run a quake
```

### Running on Windows (the development loop)

```bash
npm run dev          # → http://localhost:5173, hot reload on save
```

Notes specific to this machine:

- **Browser:** use Chrome or Edge. Both are Chromium, both give you the best WebGL tooling, and
  both are what the phone will run — so what you see on the desktop matches the phone closely.
- **Check GPU acceleration is actually on.** Open `chrome://gpu` and confirm *WebGL2: Hardware
  accelerated*. If Chromium falls back to SwiftShader (software rendering) the app will crawl at
  5 fps and you will waste an afternoon blaming the physics engine.
- **Shell:** the commands above are shell-agnostic and run fine in Git Bash, PowerShell or cmd.
- **Useful extension:** [Spector.js](https://spector.babylonjs.com/) captures a single WebGL frame
  and shows every draw call — the fastest way to find out why a frame is slow.

React DevTools and the `r3f-perf` component (`npm i -D r3f-perf`) give you live fps, draw calls
and the Rapier step time in the corner of the scene. Watch the physics step time: it should stay
under ~8 ms, otherwise you cannot hold 60 fps.

### Running on Android (testing on a real phone)

The whole point of the touch gestures is that they feel right on a phone, so test on one early
and often — desktop mouse emulation hides pinch/pan problems.

**Option A — same Wi-Fi (fastest, use this day to day)**

```bash
npm run dev:lan      # vite --host; prints e.g. http://192.168.1.42:5173
```

Open that URL in Chrome on the phone. Hot reload works over the network, so you edit on the PC
and the phone refreshes.

Two things usually block this on Windows:
- **Windows Firewall** will prompt the first time — allow Node.js on *private* networks.
- **Corporate/guest Wi-Fi often has client isolation**, which silently blocks phone→PC traffic.
  If the URL just hangs, this is why. Use Option B.

**Option B — tunnel (works on any network, gives you HTTPS)**

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Prints a public `https://…trycloudflare.com` URL. Slower than LAN, but it works from anywhere and
the HTTPS matters — see the PWA note below.

**Option C — Android Studio emulator.** Run `npm run dev` and open `http://10.0.2.2:5173` in the
emulator's Chrome (`10.0.2.2` is the emulator's alias for the host machine). Convenient, but the
emulator's GPU and touch input are not representative — never judge performance or gesture feel
from it.

**Debugging the phone from the PC.** Enable *Developer options → USB debugging* on the phone,
plug it in, then open `chrome://inspect/#devices` in desktop Chrome. You get the full DevTools —
console, network, profiler — attached to the page running on the phone. This is the only sane way
to debug a touch or performance problem that only reproduces on device.

**Testing the installed PWA.** Service workers only run over HTTPS or on `localhost`, so a plain
`http://192.168.x.x` LAN URL will *not* let you test installation. Either use the Option B tunnel,
or add `@vitejs/plugin-basic-ssl` to `vite.config.ts` to serve LAN HTTPS (you will have to accept
the self-signed certificate warning on the phone once). Then:

```bash
npm run build && npm run preview
```

In Chrome on the phone: ⋮ menu → *Add to Home screen*. It launches full-screen with no browser
chrome, which is the experience you actually want for a 3D app — the address bar costs you screen
space and intercepts edge swipes.

## 2. Requirements
Have a 3D environment which you can rotate by pinger (in all 3 directions)

On the top side, you have a selection of builings: a small house, a large double floor house, small block of flat (4 floors), medium block of flats (8 floors) and large block of flats (12 floors).
When you select a given building, then by pointing on the map you can build it in the 3D enviromnet.
At the moment the base will be just flat.
And then on the right side, have an red button, which when pressed and earthquake will start.
The earthquake is a simulation of a real earthquaka and it will shake the buildings accordingaly. 
For now, have a medium earth quake.
Later I would like to have a choise of how strong the earthquake can be and how far away of the place it can be located.

## 3. Implementation

### Architecture — four layers, each replaceable

```
┌─────────────────────────────────────────────────┐
│ UI (React + Tailwind)                           │  palette, red button, sliders
├─────────────────────────────────────────────────┤
│ State (Zustand)                                 │  what is selected, what is placed
├─────────────────────────────────────────────────┤
│ Scene (react-three-fiber / Three.js)            │  camera, ground, meshes, raycast
├─────────────────────────────────────────────────┤
│ Physics (Rapier WASM)  ←  Simulation (pure TS)  │  rigid bodies ← shake signal
└─────────────────────────────────────────────────┘
```

The key separation: **`sim/groundMotion.ts` knows nothing about Three.js or Rapier.** It takes
magnitude and epicentre distance and returns numbers. That makes the realism testable and makes
the phase-2 sliders a pure input change rather than a refactor.

### Units

Real SI units throughout — metres, kilograms, seconds, m/s². Floor height **3 m**, so the
12-floor block is 36 m tall. Using real units means real gravity (9.81) and real accelerations
(expressed in *g*) behave correctly without tuning fudge factors.

### 3.1 Camera — "rotate by finger in all 3 directions"

`OrbitControls` from `drei`, touch-enabled:

| Gesture | Result |
|---|---|
| One finger drag | Orbit — yaw around the scene, pitch up/down |
| Two finger pinch | Zoom in/out |
| Two finger drag | Pan across the ground |

Constrain `maxPolarAngle` to ~85° so the camera cannot drop below the ground plane.

### 3.2 Building placement

1. Palette sets `selectedBuildingType` in the store.
2. On pointer move over the ground, raycast against the ground plane → snap the hit point to a
   1 m grid → render a semi-transparent **ghost** of the building there.
3. On tap, push `{ type, position, id }` into `placedBuildings`.
4. Tap an existing building with no type selected → select it; a delete button removes it.

Grid snapping matters on touch: fingers are imprecise, and snapped footprints stop buildings from
spawning intersecting each other (which makes the physics engine explode them apart on frame 1).

### 3.3 Building model — stacked floors, not single blocks

This is the decision that makes the shake look real. Each building is **N rigid bodies, one per
floor**, connected vertically by fixed joints:

```
buildingSpecs = {
  smallHouse:   { floors: 1,  footprint: [6, 6],   jointStrength: high   },
  largeHouse:   { floors: 2,  footprint: [9, 8],   jointStrength: high   },
  smallBlock:   { floors: 4,  footprint: [12, 10], jointStrength: medium },
  mediumBlock:  { floors: 8,  footprint: [14, 12], jointStrength: medium },
  largeBlock:   { floors: 12, footprint: [16, 12], jointStrength: low    },
}
```

Consequences that come for free, without scripting them:

- **Tall buildings sway more.** A stack of 12 jointed bodies has a longer natural period than a
  stack of 1 — the real rule of thumb is ≈ 0.1 s per floor. The 12-floor block will visibly
  whip while the house barely moves.
- **Resonance.** If the quake's dominant frequency matches a building's natural frequency, that
  building amplifies dramatically and its neighbours do not. This is the single most convincing
  effect in the whole app and it emerges from the physics.
- **Failure.** Give the joints a breaking impulse threshold. Exceed it and floors detach — a
  pancake collapse, not a canned animation.

Each floor is one box collider; windows/doors are texture, not geometry. 12 bodies × a handful of
buildings is nothing for Rapier.

### 3.4 The earthquake simulation

**Shake the ground, not the buildings.** The ground is a `kinematicPosition` rigid body. Every
physics step its position is set from the ground-motion signal. The buildings are dynamic bodies
resting on it under friction and gravity — they respond through inertia, exactly like the real
thing. Never apply forces to buildings directly; that would look like a puppet show.

**Generating the signal** (`sim/groundMotion.ts`) — the standard engineering recipe for synthetic
accelerograms:

1. **White noise** — random acceleration samples at 200 Hz.
2. **Kanai–Tajimi filter** — a second-order filter that shapes the white noise to the frequency
   content of real soil response, concentrating energy around a dominant ground frequency
   (~2.5 Hz for firm soil). This is what makes it an earthquake rather than a vibrator.
3. **Envelope** — multiply by a Jennings envelope: quadratic ramp-up (~2 s), strong-motion
   plateau, exponential decay. Real quakes build, peak, and fade; a constant-amplitude shake
   reads as fake immediately.
4. **Scale to target PGA** — normalise so the peak equals the desired peak ground acceleration.
5. **Double-integrate** acceleration → velocity → displacement, with baseline correction so the
   ground ends where it started instead of drifting off into the distance.

Three independent components: two horizontal (X, Z) and one vertical (Y) at ~half amplitude —
real vertical motion is weaker than horizontal.

**Medium earthquake (phase 1 default):** magnitude 5.5, PGA ≈ 0.2 g, duration ≈ 15 s, dominant
frequency ≈ 2.5 Hz. Generate the whole time history once when the red button is pressed, then
play it back — generating per frame would make the result frame-rate dependent.

**Phase 2 — magnitude and distance sliders.** The function signature already takes them:

```ts
generateGroundMotion({ magnitude, distanceKm, soilType? }): GroundMotion
```

- **Magnitude → energy**, via a ground-motion prediction equation (Boore–Atkinson form is a good
  reference): `log10(PGA) ≈ a + b·M − c·log10(R)`. Magnitude also lengthens duration — an M7
  shakes for a minute, an M5 for seconds.
- **Distance → attenuation and filtering.** Distance reduces PGA geometrically, *and* high
  frequencies attenuate faster than low ones. So a distant large quake arrives as a slow deep
  roll that punishes tall towers, while a nearby small quake is a sharp rattle that punishes
  short stiff houses. Different buildings fall over in each case — that's the payoff of the
  per-floor model from 3.3.

An epicentre marker on the ground plane, draggable, is the natural UI for distance later.

### 3.5 Physics stability

Stacked rigid bodies are the classic way to make a physics engine misbehave. Three settings
prevent it:

- **Fixed timestep of 1/120 s** with accumulator, decoupled from render framerate. Non-fixed
  steps make the simulation differ between a 60 Hz phone and a 144 Hz monitor.
- **Rapier solver iterations raised** (8+) so tall stacks don't jitter or sink into each other.
- **Enable CCD** on floor bodies, so detached floors in a collapse don't tunnel through the ground.

### 3.6 Testing

Most of this app is a 3D scene, and 3D scenes are awkward to assert on. The strategy is therefore
to **push the behaviour worth testing out of the scene and into pure functions**, then cover the
scene itself with a thin smoke test. Effort is concentrated where it pays:

```
        ╱ E2E (Playwright) ╲          few  — "does it load and not crash"
      ╱  Physics regression  ╲        some — "does it behave like physics"
    ╱   Unit (Vitest, pure TS) ╲      many — "is the earthquake right"
```

**Seed the randomness first.** `groundMotion.ts` must take a `seed` and use a small seeded PRNG
(mulberry32 is ~5 lines) instead of `Math.random()`. Without this nothing about the quake is
testable, because every run differs. You get a second benefit for free: a given quake becomes
reproducible, so you can replay the exact same earthquake against different layouts and compare
fairly — which is the whole point of the app.

**Unit tests — `sim/groundMotion.test.ts`.** This is where the realism lives, so this is where
the tests go:

| Assertion | Why it matters |
|---|---|
| Same seed → identical output; different seed → different | Guards determinism |
| Peak of the signal equals the requested PGA (±1%) | Scaling step is correct |
| Signal starts near zero, peaks mid-record, decays at the end | Envelope is applied |
| Displacement at t=end ≈ 0 | Baseline correction works — no ground drift |
| Dominant frequency (via FFT) sits near the Kanai–Tajimi peak | Filter actually shapes the noise |
| PGA decreases monotonically as `distanceKm` increases | Attenuation is right-signed |
| PGA increases monotonically as `magnitude` increases | Scaling is right-signed |
| Higher magnitude → longer duration | Duration model is wired in |
| Vertical component amplitude < horizontal | Matches real ground motion |

Also test `buildingSpecs.ts` invariants: floor counts match the five named types, taller buildings
have larger footprints, and no spec has zero mass or zero joint strength.

**Physics regression tests.** Rapier is deterministic given a fixed timestep and fixed seed, which
makes headless physics assertions genuinely possible — run the world in Node with no renderer,
step it N times, assert on the resulting transforms:

| Test | Assertion |
|---|---|
| Buildings are stable at rest | After 600 steps with no quake, every floor has moved < 1 cm and is not sinking into the ground |
| No spawn explosion | Placing two buildings on adjacent grid cells does not launch them apart |
| Taller sways more | Under the same quake, max horizontal displacement of the 12-floor roof > the 4-floor roof > the house |
| Resonance is real | A quake tuned to the tall block's natural frequency displaces it more than an off-resonance quake of equal PGA |
| Collapse is reachable | A large enough PGA breaks joints on the 12-floor block; a medium one does not |

That "taller sways more" test is the valuable one. It is the core claim of the whole simulation,
and it is easy to break accidentally by tuning joint stiffness — so pin it down.

**Component tests (Vitest + React Testing Library).** Keep these shallow and focused on the store,
not on the canvas: selecting a palette item sets `selectedBuildingType`; tapping the red button
flips `quakeState` to running and disables itself while running; reset clears placed buildings.
Do not try to render the `<Canvas>` in jsdom — there is no WebGL there. Mock it out.

**E2E (Playwright).** One smoke test, run against a real browser:

```ts
test('place a building and run a quake', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Small house' }).click()
  await page.locator('canvas').click({ position: { x: 400, y: 300 } })
  await page.getByRole('button', { name: 'Start earthquake' }).click()
  await expect(page.getByRole('button', { name: 'Start earthquake' })).toBeDisabled()
  await expect(page).toHaveScreenshot('post-quake.png', { maxDiffPixels: 2000 })
})
```

Two practical notes. Run this **headed or with `--use-gl=angle`** — headless Chromium falls back
to software WebGL, which is slow and renders subtly differently. And give screenshot comparisons a
generous `maxDiffPixels`: GPU rasterisation differs between machines, so a pixel-exact baseline
will fail on every machine that isn't yours.

Playwright also emulates touch, so configure a Pixel device project and assert that pinch/drag
gestures orbit the camera — this is the one automated check on the gesture layer.

**Manual check before each release.** Automated tests say nothing about whether it *feels* right:

- 60 fps on a real mid-range Android phone with 10+ buildings placed
- Physics step time under ~8 ms (visible in `r3f-perf`)
- Pinch and two-finger pan do not fight each other or trigger browser page zoom
- The quake looks like a quake, and the tall tower visibly whips while the house does not

### 3.7 Deployment

`npm run build` produces a fully static `dist/` — HTML, JS, a `.wasm` file and assets. There is no
server, no database and no API, so hosting is trivial and free.

**Recommended: Cloudflare Pages or Netlify.** Connect the Git repository, set build command
`npm run build` and output directory `dist`, done. Every push deploys; every pull request gets its
own preview URL you can open directly on the phone. Both serve `.wasm` with the correct MIME type
and give you HTTPS automatically, which the PWA requires.

**GitHub Pages** works too and is a good fit if the repo already lives on GitHub — one caveat: a
project site is served from a subpath, so set `base: '/EarthQuakeSimulator/'` in `vite.config.ts`
(matching the repository name) or every asset 404s. The site would then live at
`https://peterpalusak.github.io/EarthQuakeSimulator/`.

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push: { branches: [main] }
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test          # gate the deploy on the unit + physics tests
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

Run `npm test` in CI before the build step, as above. The physics regression tests are exactly the
kind that break quietly during tuning, and catching that in CI is cheaper than noticing a month
later that buildings no longer collapse.

**Things that specifically bite this app when deployed:**

- **`.wasm` MIME type.** Rapier ships a WebAssembly binary. The host must serve it as
  `application/wasm` or it fails to instantiate. Cloudflare, Netlify, Vercel and GitHub Pages all
  do this correctly — a hand-rolled IIS or nginx may not, and the error message is unhelpful.
- **Bundle size.** Three.js plus the Rapier WASM is roughly 1.5 MB gzipped. Fine on Wi-Fi, slow on
  mobile data. Let `vite-plugin-pwa` precache it so the second visit is instant and offline.
- **Cache busting.** Vite hashes filenames, so this is handled — but configure the service worker
  to `skipWaiting` and `clientsClaim`, otherwise returning users sit on a stale build until they
  close every tab.
- **HTTPS is mandatory**, not optional, for the service worker and install prompt. All the
  recommended hosts provide it.

**Getting it onto Android.** For most uses, just send the URL and let people install the PWA —
it goes to the home screen, launches full-screen and works offline, with no store review and no
install friction.

If a Play Store listing is genuinely needed later, wrap the same `dist/` with **Capacitor**:

```bash
npm i @capacitor/core @capacitor/android && npx cap init
npx cap add android
npm run build && npx cap sync
npx cap open android      # opens Android Studio → build signed AAB
```

No code changes. This requires Android Studio and a Play Console account (one-off fee), so defer
it until there is a concrete reason — the PWA covers the same ground with far less overhead.

### 3.8 Build order

| Phase | Deliverable |
|---|---|
| 1 | Vite + R3F scene, flat ground, OrbitControls with touch — verify on a real phone immediately |
| 2 | Building specs + static placement (no physics), ghost preview, grid snap |
| 3 | Rapier: floors as rigid bodies, joints, gravity, buildings stand up |
| 4 | `groundMotion.ts` + unit tests; kinematic ground driven by the signal |
| 5 | Red button wiring, shake plays, buildings respond, reset button |
| 6 | Physics regression tests + CI pipeline + first deploy to a live URL |
| 7 | Joint breaking → collapse; dust/debris polish |
| 8 | Magnitude + distance sliders, draggable epicentre marker |

Deploy at phase 6 rather than at the end. A live URL is the easiest way to open the app on any
phone without a dev server, and shipping something small early flushes out the WASM/HTTPS/base-path
problems above while the project is still simple enough to debug them quickly.

### Known simplification

Rapier is a rigid-body game engine, not a finite-element structural solver. Floors are rigid boxes
with lumped joint stiffness, so this is a *plausible and physically-grounded* demonstration of
resonance and collapse, not an engineering-grade prediction. For the intended purpose — seeing and
feeling why tall and short buildings respond differently to different quakes — it is the right
level of fidelity, and it runs at 60 fps on a phone.
