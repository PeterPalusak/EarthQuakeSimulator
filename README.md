# Earth Quake Generator

Place buildings on a flat site, press the red button, and watch a physically simulated
earthquake decide which of them survive.

It is a web app, so it runs on a phone without installing anything: open the URL, add it to the
home screen, and it launches full-screen and works offline.

**Live URL:** _not deployed yet — see [Deployment](#deployment)._

> **To do once it is live:** add the URL above and a GIF of a twelve-floor block pancaking
> while the house beside it stands. The GIF does more than any description — it is what makes
> someone open the link. See `plan/08-deployment.md` task 8.9.

---

## What makes it a simulation rather than an animation

Three decisions do all the work:

**The ground shakes, not the buildings.** The ground is a kinematic rigid body whose position
is driven by a generated displacement record. Buildings are dynamic bodies anchored to it and
respond through their own inertia. No force is ever applied to a building directly.

**Buildings are stacks of floors, not blocks.** Each floor is its own rigid body, tied to the
one below by a calibrated lateral spring. A building's natural period therefore comes out at
roughly 0.1 s per storey — so a 12-floor block sways with a 1.2 s period and a house with a
0.1 s one, and they respond completely differently to the same quake.

**The quake is a real accelerogram recipe.** Seeded Gaussian noise, shaped by a Kanai–Tajimi
soil filter, multiplied by a Jennings envelope, scaled to the peak ground acceleration a
ground-motion prediction equation gives for that magnitude and distance, then double-integrated
to displacement with a high-pass filter so the ground does not drift away.

The payoff is that **distance changes which building falls over, not just how hard everything
shakes.** High frequencies attenuate faster than low ones, so a distant large quake arrives as
a slow swell that punishes tall towers, while a nearby small one is a sharp rattle that
punishes short stiff houses. Try the "Distant rumble" and "Sharp & close" presets back to back.

Damage is measured as interstorey drift ratio, the standard engineering damage measure. Floors
are tinted by the peak drift they took, and a storey that exceeds its capacity loses its joint
and its height — so the mass above drops through it and the building pancakes.

---

## Running it locally

Needs **Node.js 20 or newer**.

```bash
npm install
npm run dev          # https://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload, over HTTPS |
| `npm run dev:lan` | Same, reachable from a phone on the same Wi-Fi |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build over plain HTTP |
| `npm test` | Unit + headless physics tests |
| `npm run test:e2e` | Playwright, against a production build |
| `npm run lint` | ESLint, including the `src/sim` import boundary |
| `npm run calibrate` | Re-derive the per-type storey stiffnesses |

### Testing on an Android phone

```bash
npm run dev:lan      # prints e.g. https://192.168.1.42:5173
```

Open that on the phone and accept the self-signed certificate once. Two things usually block
this: Windows Firewall (allow Node on *private* networks) and corporate Wi-Fi client isolation,
which silently drops phone-to-PC traffic. If the URL just hangs, tunnel instead:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

For a touch or performance problem that only reproduces on device, plug the phone in and open
`chrome://inspect/#devices` in desktop Chrome for full DevTools against the page on the phone.

---

## How the code is laid out

```
src/
  sim/        PURE TypeScript. No Three.js, no Rapier, no DOM.
              groundMotion, buildingSpecs, placement, damage, quakeScales, random
  physics/    Rapier world, built imperatively so the headless tests and the app
              share one implementation. QuakeWorld, runQuake
  scene/      react-three-fiber: camera, ground, buildings, dust, epicentre marker
  state/      Zustand: what is placed, and what the quake is doing
  ui/         React overlay: palette, red button, sliders, damage summary
```

**`src/sim` imports nothing.** That is the single most important structural rule here: it is
what makes the earthquake and the damage model unit-testable, and an ESLint rule enforces it so
it cannot rot. Everything worth asserting on lives there or in `src/physics`, which runs
headless in Node.

Two other conventions worth knowing before changing anything:

- **Units are SI and real.** Metres, kilograms, seconds. Floor height is 3 m, gravity is 9.81,
  accelerations are quoted in *g*. There are no scale factors to make something look right — if
  it looks wrong, the model is wrong.
- **Randomness is seeded.** Never `Math.random()` in `src/sim`. Every quake is reproducible from
  `{ magnitude, distanceKm, seed }`, which is what makes the tests possible and lets you replay
  the identical quake against different layouts.

`npm run calibrate` prints the storey stiffness that gives each building type its target period.
Those numbers are committed in `buildingSpecs.ts`; do not hand-edit them, re-run the script.

---

## Deployment

`npm run build` produces a fully static `dist/`. There is no server, no database and no API.

The `base` path is a build-time variable, because it differs per host:

```ts
base: process.env.VITE_BASE ?? '/'
```

`/` is correct for Cloudflare Pages, Netlify, a container, Azure and Capacitor. **Only GitHub
Pages needs an override**, because a project site is served from a subpath — the workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) sets
`VITE_BASE=/EarthQuakeSimulator/`. Getting this wrong gives a blank page with a 404 on every
asset and no useful error, and it is the most likely first-deploy failure.

To go live on GitHub Pages: enable Pages in the repository settings with source **GitHub
Actions**, and push to `main`. The workflow lints, tests and builds before it publishes, so a
broken physics regression blocks the deploy.

### In a container

```bash
docker build -t quake:dev .
docker run --rm -p 8080:8080 quake:dev    # http://localhost:8080
```

`nginx.conf` handles the four things this app needs from a server: the SPA fallback, caching
`/assets/*` forever but `sw.js` never, gzip, and serving `.wasm` as `application/wasm`. See
[plan/09-container-and-azure.md](plan/09-container-and-azure.md) for Azure Container Apps and
the passwordless OIDC deploy workflow.

`localhost` counts as a secure context, so the service worker registers against the container
without HTTPS. Testing the install prompt from a phone needs a real certificate — tunnel it, or
deploy it.

---

## Further reading

- [Description.md](Description.md) — what is being built and why, including the platform and
  stack decisions.
- [Implementation_Plan.md](Implementation_Plan.md) — how it was built, phase by phase, with the
  per-phase task lists under [plan/](plan/).

Both predate the code. Where the code departs from them — the joint model in phase 3, the GMPE
coefficients and envelope in phase 4, the displacement clamp in phase 6 — the reason is recorded
in a comment at the point of departure and in the commit that made it.

## Known simplification

Rapier is a rigid-body engine, not a finite-element structural solver. Floors are rigid boxes
with lumped storey stiffness, so this is a *plausible and physically grounded demonstration* of
resonance and collapse, not an engineering-grade prediction. For seeing why tall and short
buildings respond differently to different earthquakes, it is the right level of fidelity, and
it runs at 60 fps on a phone.
