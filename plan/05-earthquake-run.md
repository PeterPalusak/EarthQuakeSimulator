# Phase 5 — Running a quake

**Goal:** press the red button, the ground shakes with the phase 4 signal, and the buildings
respond.

**Depends on:** phases 3 and 4.

**Requirements covered:** *"on the right side, have a red button, which when pressed an earthquake
will start"*, *"it will shake the buildings accordingly"*, *"For now, have a medium earthquake."*

This is the payoff phase. Everything before it exists to make this work; it is mostly wiring.

---

## The central principle

**Shake the ground, never the buildings.**

The ground becomes a kinematic body whose position is driven by the phase 4 displacement signal.
The buildings are dynamic bodies resting on it, coupled through friction and gravity. They respond
through their own inertia — exactly like the real thing.

Applying forces directly to buildings would be far easier and would look like a puppet show: every
building would move in lockstep, with no resonance, no height dependence and no reason for one
building to fail while its neighbour survives. The entire value of phases 3 and 4 evaporates if
this principle is broken under schedule pressure. Resist it.

---

## Tasks

### 5.1 Quake state machine — `src/state/store.ts`

```ts
type QuakePhase = 'idle' | 'running' | 'finished'

interface QuakeState {
  phase: QuakePhase
  motion: GroundMotion | null     // generated on start, held for playback
  elapsed: number                 // seconds since start
  start: () => void
  tick: (dt: number) => void
  reset: () => void
}
```

`start()` calls `generateGroundMotion(MEDIUM_QUAKE)` with a fresh random seed, stores the result
and flips to `running`. When `elapsed > motion.duration`, flip to `finished`.

Generate on press, not on mount: a 60 s record is wasted work if the user never taps the button,
and a fresh seed per press means two runs are never identical.

### 5.2 Ground becomes kinematic — `src/scene/Ground.tsx`

Change the phase 3 body type:

```tsx
<RigidBody ref={groundRef} type="kinematicPosition" friction={0.8} colliders={false}>
```

A `kinematicPosition` body is moved by setting its position directly; it is infinitely massive
from the solver's point of view, so buildings cannot push it around, but its motion *does*
transfer to them through contact and friction. That is exactly the semantics needed.

### 5.3 Drive the ground from the signal

```tsx
useFrame((_, delta) => {
  if (phase !== 'running' || !motion) return

  tick(delta)

  // Sample the record with linear interpolation — render is 60 Hz, record is 200 Hz
  const t = elapsed / motion.dt
  const i = Math.min(Math.floor(t), motion.samples - 2)
  const f = t - i
  const lerp = (a: Float32Array) => a[i] + (a[i + 1] - a[i]) * f

  groundRef.current.setNextKinematicTranslation({
    x: lerp(motion.disp.x),
    y: lerp(motion.disp.y),
    z: lerp(motion.disp.z),
  })
})
```

Use `setNextKinematicTranslation`, **not** `setTranslation`. The former tells Rapier where the
body should be at the end of the step, letting it compute the implied velocity and transfer
momentum correctly. The latter teleports the body, transfers no momentum, and the buildings will
barely move — a confusing, near-silent failure.

Interpolate between samples. Without it, the 60 Hz render samples the 200 Hz record unevenly and
adds a high-frequency buzz on top of the intended motion.

### 5.4 Keep the camera still

The camera must **not** be parented to the shaking ground. A camera that shakes with the ground
makes the ground look stationary and the buildings look like they are flailing for no reason —
precisely backwards.

Phase 1's `OrbitControls` already targets world origin, so this is correct by default. The note
exists because "add camera shake, it'll feel more dramatic" is a tempting and wrong idea. If
camera shake is ever wanted for feel, it must be a small, separate, *optional* effect layered on
top — never the primary motion cue.

### 5.5 `src/ui/QuakeButton.tsx` — the red button

Right side, vertically centred, large and unmistakable:

```tsx
<div className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2">
  <button
    aria-label="Start earthquake"
    disabled={phase === 'running'}
    onClick={start}
    className="h-24 w-24 rounded-full bg-red-600 text-lg font-bold text-white
               shadow-lg ring-4 ring-red-900/40 active:scale-95 disabled:opacity-50"
  >
    {phase === 'running' ? '…' : 'QUAKE'}
  </button>
</div>
```

- Disabled while running, so a second press cannot restart mid-quake and corrupt `elapsed`.
- 96 px — far above the 44 px minimum. It is the primary action in the app.
- `aria-label="Start earthquake"` is what the Playwright test selects on.

### 5.6 Progress and intensity readout

While running, show elapsed/total and the magnitude and PGA. Small, near the button.

This is scaffolding for phase 7 (where the user picks those values) but it earns its place now:
during tuning you constantly need to know whether what you are watching is a 0.2 g shake or
something the solver has blown up into nonsense.

### 5.7 Reset

A reset control that returns every building to its placed position and resets the quake state to
`idle`. After a strong quake the layout is disturbed or collapsed, and without reset every test
iteration needs a page reload.

Easiest reliable implementation: clear and re-create the building bodies from the store's `placed`
array. Trying to teleport bodies back in place tends to leave residual velocity and joint state.

---

## Tests for this phase

**Store unit tests** (pure, no renderer):
- `start()` moves `idle → running` and populates `motion`
- `tick()` past `duration` moves `running → finished`
- `start()` while running is a no-op
- `reset()` returns to `idle` and clears `motion`
- Two consecutive `start()` calls use different seeds

**Physics integration tests** (headless Rapier + a real generated motion):
- With a quake running, a building's roof displacement exceeds its base displacement — i.e. it
  genuinely deforms rather than riding along rigidly
- Buildings do **not** slide more than ~0.5 m from their placed footprint during a medium quake
  (this catches friction being too low)
- After the quake finishes, buildings come back to rest within a few seconds (damping works)
- A 12-floor block's roof displacement exceeds a house's under the same quake
- No body's position ever becomes `NaN` (solver blow-up guard)

**E2E:**
```ts
test('place a building and run a quake', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Small house' }).click()
  await page.locator('canvas').click({ position: { x: 400, y: 300 } })
  await page.getByRole('button', { name: 'Start earthquake' }).click()
  await expect(page.getByRole('button', { name: 'Start earthquake' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Start earthquake' })).toBeEnabled({ timeout: 30_000 })
})
```

---

## Definition of done

- [ ] Pressing the red button starts a visible, convincing shake
- [ ] Buildings sway rather than sliding as rigid blocks
- [ ] A 12-floor block visibly sways more than a house standing next to it — **the headline
      result of the whole project; if this is not visible, something in phase 3 or 4 is wrong**
- [ ] The shake builds, peaks and fades rather than starting and stopping abruptly
- [ ] The ground returns to its original position — no drift
- [ ] The camera does not move with the ground
- [ ] The button is disabled while running and re-enables when finished
- [ ] Reset restores the layout
- [ ] 60 fps on the phone during a quake with 10 buildings
- [ ] All tests above pass

---

## First deployment

Stop here and do a first deploy — the steps in [08-deployment.md](08-deployment.md), minus the
polish. There is now something worth looking at, and shipping it now flushes out the WASM MIME,
HTTPS and `base` path problems while the app is still simple enough to debug them quickly.

It also means the phone testing for phases 6 and 7 can be done from a URL instead of a dev server.

---

## Gotchas

- **`setTranslation` instead of `setNextKinematicTranslation`** — buildings barely move, no error
  is reported. Check this first if the shake looks weak.
- **Friction too low** — buildings slide across a moving ground like it is ice. 0.8 on both the
  ground and the floor bodies is a reasonable starting point.
- **Displacement too small to see.** A real 0.2 g quake moves the ground only a few centimetres.
  That is correct, and against a 36 m building it looks subtle. Resist adding a visual
  exaggeration factor to the displacement: if the shake is unconvincing, the *buildings'* response
  is what should be more visible, and that is phase 3's stiffness, not phase 4's amplitude. If a
  display-only exaggeration is genuinely wanted later, make it an explicit, labelled, off-by-
  default control — never a silent constant.
- **`elapsed` accumulated from `delta`** drifts if a frame hitches. For a 15 s playback it is
  immaterial, but prefer accumulating from a fixed step if phase 7 ever adds slow-motion.
- **Sleeping bodies.** Rapier sleeps settled bodies; a kinematic ground moving beneath them does
  wake them through contact, but if buildings look frozen at the start of a quake, explicitly
  `wakeUp()` every body on `start()`.
