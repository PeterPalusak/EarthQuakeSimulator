# Phase 7 — Quake controls

**Goal:** choose how strong the earthquake is and how far away it happens.

**Depends on:** phase 5 (phase 6 is independent of this).

**Requirements covered:** *"Later I would like to have a choice of how strong the earthquake can
be and how far away of the place it can be located."*

Because phase 4 was built with the full `{ magnitude, distanceKm, seed }` signature from the
start, this phase adds almost no simulation code. It is a UI phase.

---

## Tasks

### 7.1 Extend the store

```ts
interface QuakeSettings {
  magnitude: number           // 4.0 – 8.0, default 5.5
  distanceKm: number          // 1 – 200, default 10
  epicentre: [number, number] // x, z in world metres — derived from distanceKm and a bearing
}
```

`start()` now passes these to `generateGroundMotion` instead of the `MEDIUM_QUAKE` constant. That
is the entire simulation-side change.

### 7.2 `src/ui/QuakeControls.tsx` — the sliders

Place below the red button on the right, or along the bottom on narrow screens.

**Magnitude: 4.0 – 8.0, step 0.1.** Label with both the number and a plain-language descriptor,
because "magnitude 6.2" means nothing to most people:

| Magnitude | Label |
|---|---|
| 4.0 – 4.9 | Light |
| 5.0 – 5.9 | Moderate |
| 6.0 – 6.9 | Strong |
| 7.0 – 7.9 | Major |
| 8.0 | Great |

**Distance: 1 – 200 km, logarithmic.** A linear slider wastes most of its travel in the range
where nothing changes much — the interesting behaviour is all between 1 and 30 km. Map the slider
position `s ∈ [0,1]` to `distance = 10^(s · log10(200))`.

**Live readout** of derived PGA and duration, recomputed on change. This is what connects the two
abstract sliders to a consequence the user can feel, and it costs one call to the phase 4
intensity functions.

Use native `<input type="range">`. It has correct touch behaviour, keyboard support and
accessibility for free; a custom slider on a touchscreen is a surprising amount of work to get
right and will fight OrbitControls for pointer events.

### 7.3 Epicentre marker

A visible marker on the ground showing where the quake originates, draggable to set the distance
directly — more intuitive than a slider, and it makes "how far away" spatial rather than numeric.

- Render a pulsing ring at `epicentre`, with a dashed line to the scene centre labelled with the
  distance in km.
- Dragging it updates `distanceKm` from its distance to origin, and the slider follows.
- Clamp to the 1–200 km range. **200 km is well outside the 200 m ground plane**, so the marker
  needs its own display scale — either draw it at a compressed radius with the true distance as a
  label, or place it at the edge with an arrow when it is off-plane. Decide this early; it is the
  one genuinely awkward part of this phase.

If time is short, ship the sliders alone — they satisfy the requirement. The marker is polish.

### 7.4 Directionality (small, high value)

The epicentre's *bearing* should set which horizontal axis gets the stronger shaking: a quake due
north shakes predominantly along Z. Scale the X and Z components by the bearing's cosine and sine
rather than treating them as equal.

Cheap to implement and it makes the marker meaningful rather than decorative — buildings visibly
sway toward and away from the epicentre.

### 7.5 Presets

Three or four one-tap scenarios, so the app is interesting without slider fiddling:

| Preset | M | Distance | Shows |
|---|---|---|---|
| Distant rumble | 7.0 | 150 km | Low frequency; tall blocks sway, houses barely move |
| Moderate local | 5.5 | 10 km | The Description's default |
| Sharp & close | 5.0 | 3 km | High frequency; houses rattle, tall blocks ride it out |
| The big one | 7.5 | 8 km | Widespread collapse |

The first and third are the ones to demonstrate: the same app, two quakes, *opposite* buildings
destroyed. That contrast is the whole point of the distance-dependent frequency shift from phase
4.3, and the clearest evidence the simulation is doing real work.

---

## Tests for this phase

**Store/unit:**
- Changing magnitude changes the generated motion's PGA in the right direction
- Changing distance changes PGA in the right direction
- Log slider mapping: position 0 → 1 km, position 1 → 200 km, monotonic in between
- Epicentre position and `distanceKm` stay consistent when either is changed
- Every preset produces a valid, finite ground motion

**Physics integration — the one worth writing:**

```ts
it('distant large quakes punish tall buildings; near small quakes punish short ones', () => {
  const distant = runQuake({ magnitude: 7.0, distanceKm: 150 }, [house, tower])
  const near    = runQuake({ magnitude: 5.0, distanceKm: 3   }, [house, tower])

  expect(distant.tower.peakDrift).toBeGreaterThan(distant.house.peakDrift)
  expect(near.house.peakDrift / near.tower.peakDrift)
    .toBeGreaterThan(distant.house.peakDrift / distant.tower.peakDrift)
})
```

This is the headline claim of the finished application. It depends on the frequency shift in
phase 4.3, the period calibration in phase 3.4 and the drift measurement in phase 6 all being
correct simultaneously — so it is both the most valuable test in the suite and the one most
likely to catch a regression anywhere in the physics chain.

**Component:** sliders render, respond to input, update the store, have accessible names.

**E2E:** set magnitude to maximum, run a quake, assert collapses occur.

---

## Definition of done

- [ ] Magnitude slider, 4.0–8.0, with a plain-language label
- [ ] Distance slider, 1–200 km, logarithmic
- [ ] Live PGA and duration readout updating as sliders move
- [ ] Quakes use the chosen values
- [ ] Epicentre marker visible and draggable (or deferred, consciously)
- [ ] Shaking direction follows the epicentre bearing
- [ ] Preset buttons work
- [ ] The "distant rumble" and "sharp & close" presets visibly destroy *different* buildings
- [ ] Controls are usable one-handed on a phone and do not fight the camera
- [ ] All tests above pass

---

## Gotchas

- **Sliders stealing camera gestures.** The controls need `pointer-events-auto` and must stop
  propagation; the canvas must not receive their drags. Test on a phone specifically.
- **Extreme combinations.** M8 at 1 km produces PGA above 1 g and displacements large enough to
  destabilise the solver. The clamps in phase 4.1 and 4.7 exist for this — verify them here with
  the sliders at their limits rather than trusting the unit tests.
- **Regenerating on every slider tick** is wasteful if the readout calls the full generator. Make
  the PGA/duration calculations separately exported cheap functions, and only generate a full
  record on button press.
- **Distance scale confusion.** The ground plane is 200 m; the distance slider goes to 200 km.
  Users will read the marker as being metres away unless the label is explicit.
