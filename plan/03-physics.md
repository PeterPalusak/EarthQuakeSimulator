# Phase 3 — Physics

**Goal:** buildings made of per-floor rigid bodies that stand still under gravity and sway with
the right natural period when pushed.

**Depends on:** phase 2.

**Requirements covered:** the foundation for *"it will shake the buildings accordingly"* — this
phase makes buildings behave like structures rather than like boxes.

This is the highest-risk phase in the project. Budget for tuning.

---

## Correction to Description.md §3.3

[Description.md](../Description.md) §3.3 specifies **fixed joints** between floors. That is wrong,
and it would be found out the hard way in phase 5.

A fixed joint is rigid by definition: it removes all six degrees of freedom between two bodies. A
stack of floors joined by fixed joints behaves as **one rigid block**. It would slide, and it
would topple, but it would not *sway* — and all the interesting behaviour in the Description
(different natural periods, resonance, taller buildings whipping) depends on sway. With fixed
joints every building would have the same, essentially infinite, stiffness and the simulation's
central claim would be false.

**Use compliant joints with an angular spring instead:**

> A **spherical joint** between consecutive floor centres — which pins them together
> translationally while allowing relative rotation — plus an **angular motor spring** targeting
> zero relative rotation, with per-type stiffness and damping.

The spring stiffness is then the knob that sets each building's natural period, and `floors × mass
/ stiffness` produces exactly the "0.1 s per storey" behaviour the Description relies on.

> **Verify the joint API against the installed Rapier version before writing much code.** The
> joint-motor API (`configureMotorPosition`, `setMotorPosition`, the generic-joint builders) has
> moved between Rapier releases, and `@react-three/rapier` wraps it with its own hooks. Spend
> fifteen minutes on a two-body spike before building the full `Building` component.
>
> Fallback if spherical-joint motors prove awkward in the installed version: a **generic joint**
> with the translational axes locked and spring parameters on the angular axes. Same physics,
> different constructor.

---

## Tasks

### 3.1 Physics world

```tsx
<Physics
  gravity={[0, -9.81, 0]}
  timeStep={1 / 120}            // fixed — see Implementation_Plan.md conventions
  numSolverIterations={8}       // default 4 is not enough for 12 stacked bodies
  interpolate                   // smooth rendering at 60 fps over 120 Hz physics
  debug={import.meta.env.DEV && showColliders}
>
```

The raised solver iteration count is not optional. At the default, a 12-floor stack visibly
jitters at rest and slowly sinks into the ground — a classic stacked-body artefact that is easy to
misdiagnose as a mass or joint problem.

Put the `debug` collider wireframe behind a dev-only toggle. It is the fastest way to see a
misaligned collider, and you will want it repeatedly in phases 5 and 6.

### 3.2 Ground as a rigid body

```tsx
<RigidBody type="fixed" friction={0.8} restitution={0.05} colliders={false}>
  <CuboidCollider args={[100, 0.5, 100]} position={[0, -0.5, 0]} />
  {/* the phase 1 ground mesh */}
</RigidBody>
```

Give the ground real thickness rather than a zero-thickness plane — thin colliders let fast bodies
tunnel through, which will matter when debris falls in phase 6.

Friction 0.8 represents a building sitting on soil. It becomes critical in phase 5: a shaking
ground transmits motion to the buildings **through friction**. Too low and the buildings simply
slide while the ground moves under them, which looks absurd.

In phase 5 `type` changes to `"kinematicPosition"`. Nothing else here changes.

### 3.3 `src/scene/Building.tsx` — a stack of floors

For a spec with `N` floors, create `N` dynamic rigid bodies:

```
floor i (0-based): centre at y = (i + 0.5) × FLOOR_HEIGHT
                   half-extents = [footprintX / 2, FLOOR_HEIGHT / 2, footprintZ / 2]
                   mass = spec.floorMass
```

Set **explicit mass** rather than relying on density, so the mass values in `buildingSpecs.ts`
mean what they say and the period calibration below is predictable.

Then join consecutive floors, and join floor 0 to the ground body so the building is anchored
rather than free-floating:

```
ground ──spring── floor0 ──spring── floor1 ──spring── … ──spring── floorN-1
```

The anchor joint to the ground is what makes the building a *cantilever*. Without it the whole
stack just slides as a unit and nothing bends.

Enable **CCD** on floor bodies. It costs little here and prevents detached floors tunnelling
through the ground during phase 6 collapses.

### 3.4 Calibrate joint stiffness — the important part

Do **not** guess stiffness values. Derive them with a test, then paste the results into
`buildingSpecs.ts`:

1. Build the stack headlessly with a trial stiffness.
2. Apply a horizontal impulse to the top floor.
3. Let it oscillate freely with damping near zero.
4. Measure the period between successive peaks of the roof displacement.
5. Bisect on stiffness until the measured period is within 10% of `targetPeriod(floors)`.

Write this as a script (`scripts/calibrate.ts`) that prints a stiffness per building type. Run it
once, commit the numbers, and keep the *assertion* version as a permanent test (3.7 below) so
later tuning cannot silently break the periods.

Expected results, to sanity-check against:

| Type | Floors | Target period | Natural frequency |
|---|---|---|---|
| Small house | 1 | 0.1 s | 10 Hz |
| Large house | 2 | 0.2 s | 5 Hz |
| Small block | 4 | 0.4 s | 2.5 Hz |
| Medium block | 8 | 0.8 s | 1.25 Hz |
| Large block | 12 | 1.2 s | 0.83 Hz |

Note the small block's 2.5 Hz. That is exactly the dominant frequency of the default medium quake
in phase 4 — so the 4-floor block will be the one that visibly suffers in the default scenario,
while the 12-floor block only comes into its own with the distant-large-quake settings from phase
7. That is physically correct and makes the controls in phase 7 genuinely interesting rather than
just a volume knob.

### 3.5 Damping

Give each floor body modest linear and angular damping (start at 0.1–0.3). Real structures
dissipate energy; with zero damping a building that starts swaying never stops, which looks wrong
and leaves the scene permanently unsettled between quakes.

Keep damping low during calibration (3.4) or it will skew the measured period.

### 3.6 Settling

New buildings may jitter for a few frames as the solver resolves the stack. Either:

- let bodies sleep when they settle (Rapier does this automatically), or
- spawn with floors exactly adjacent — no gaps, no overlaps.

Never spawn floors with a deliberate gap "to be safe". They drop, impact, and the stack rings.

---

## Tests for this phase

These are headless Rapier tests in Node — no renderer. Rapier is deterministic under a fixed
timestep, which makes them reliable rather than flaky.

**Stability:**

- After 600 steps with no quake, every floor of a 12-floor block has moved < 1 cm
- No floor's `y` has decreased (nothing sinks into the ground)
- Two buildings placed one margin apart do not push each other away on frame 1

**Period calibration (the key test):**

```ts
it.each(Object.values(BUILDING_SPECS))('$label sways at ~0.1s per floor', spec => {
  const world = buildBuilding(spec)
  applyRoofImpulse(world)
  const period = measureFreeVibrationPeriod(world)
  expect(period).toBeCloseTo(targetPeriod(spec.floors), 1)   // within 10%
})
```

**Relative response:**

- Under an identical lateral impulse, roof displacement: 12-floor > 8-floor > 4-floor > house

**Determinism:**

- The same world, stepped twice from the same seed, produces bit-identical floor transforms

---

## Definition of done

- [ ] A spherical-joint + angular-spring spike works against the installed Rapier version
- [ ] All five building types stand still under gravity without jitter, drift or sinking
- [ ] Pushing a building (dev-only debug impulse) makes it sway and settle, visibly
- [ ] Measured free-vibration periods are within 10% of `0.1 × floors` for all five types
- [ ] Calibrated stiffness values are committed in `buildingSpecs.ts`
- [ ] 10 buildings, 60 fps, physics step < 8 ms on the phone
- [ ] All tests above pass

---

## Gotchas

- **Fixed joints do not sway.** The whole reason for this phase's correction note. If buildings
  look rigid, check the joint type first.
- **Over-stiff springs destabilise the solver.** The 1-floor house needs high stiffness for a
  0.1 s period, and that is the one most likely to jitter. If it misbehaves, raise solver
  iterations before lowering stiffness — lowering stiffness falsifies the period.
- **Mass ratios matter more than absolute masses.** Rapier handles large masses fine, but a joint
  between bodies with a very large mass ratio solves poorly. Keep floor masses within a building
  uniform.
- **`numSolverIterations` is a per-world cost.** Raising it fixes stacking but costs frame time;
  8 is a reasonable compromise, 16 is usually wasteful.
- **Debug collider rendering is expensive.** Leave it off unless actively diagnosing, and never
  ship it enabled — it will silently halve the phone's framerate.
