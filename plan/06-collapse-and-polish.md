# Phase 6 — Collapse & polish

**Goal:** buildings that are pushed beyond their capacity fail and fall down convincingly.

**Depends on:** phase 5.

**Requirements covered:** none directly — this is the natural consequence of *"it will shake the
buildings accordingly"*. [Description.md](../Description.md) §3.3 calls for it: *"Give the joints
a breaking impulse threshold. Exceed it and floors detach — a pancake collapse, not a canned
animation."*

Ship phase 5 before starting this. A working shake without collapse is a complete, useful app;
this phase makes it compelling.

---

## Failure criterion: interstorey drift, not joint impulse

Description.md §3.3 suggests a **breaking impulse threshold** on the joints. Use **interstorey
drift ratio** instead. It is both better engineering and easier to implement.

Interstorey drift ratio is the horizontal displacement between two consecutive floors divided by
the storey height:

```
drift_i = |x_floor(i+1) − x_floor(i)| / FLOOR_HEIGHT
```

It is the standard damage measure in earthquake engineering, with well-known thresholds:

| Drift ratio | Damage state |
|---|---|
| < 0.5 % | None — elastic |
| 0.5 – 1.5 % | Light — cracking |
| 1.5 – 2.5 % | Severe — structural damage |
| > 2.5 % | Collapse |

Three practical advantages over joint impulses:

1. **It is a position difference**, readable from any physics engine, with no dependence on the
   joint-motor API that phase 3 flagged as version-sensitive.
2. **It gives graded damage for free** — the same number drives colour-coded damage states, not
   just a binary intact/collapsed.
3. **It is directly testable** in the headless harness, and it is a real quantity an engineer
   would recognise rather than an engine-specific tuning number.

`driftCapacity` already exists per type in `buildingSpecs.ts` from phase 2, with taller concrete
blocks given slightly lower capacity (1.8 %) than timber houses (3.0 %) — stiffer, more brittle
structures tolerate less drift.

---

## Tasks

### 6.1 Monitor drift

Each physics step, for every building, compute drift for every storey and track the running
maximum per storey and per building. Derive a damage state from the thresholds above.

Sample every step rather than every frame — peak drift often occurs between rendered frames, and
missing it under-reports damage.

### 6.2 Trigger failure

When a storey's drift exceeds the building's `driftCapacity`:

1. **Remove the joints** at that storey. Everything above becomes a free-falling stack of bodies.
2. Mark the building `collapsed` so it is not re-evaluated.
3. Optionally weaken the joints immediately below — real collapses propagate downward as the
   falling mass overloads the floors beneath. This is what produces a pancake collapse rather
   than a clean decapitation.

The debris then behaves correctly with no further work: it falls under gravity, collides with the
ground and with neighbouring buildings, and piles up. That is the whole argument for a rigid-body
engine over a scripted animation.

Ensure CCD is on for floor bodies (phase 3.3) so fast-falling floors do not tunnel through the
ground.

### 6.3 Damage visualisation

Tint each floor by its peak drift — green → yellow → orange → red. This is what turns the app from
a toy into something that explains a concept: after a quake the user can see at a glance *which*
storey took the punishment, and it is usually not the one people expect.

Keep it to vertex/material colour. No textures, no extra draw calls.

### 6.4 Post-quake summary

When the quake finishes, a small panel: how many buildings intact, damaged, collapsed, and the
peak drift per building. Closable, and cleared by reset.

### 6.5 Visual polish (optional, in value order)

1. **Dust puffs** at collapse — a short-lived particle burst. The single highest-impact effect;
   collapses look abrupt and weightless without it.
2. **Sound** — a low rumble during the quake. Larger perceived impact than any visual for the
   effort. Must be gated behind a user gesture (the button press) to satisfy browser autoplay
   policies, and must be mutable.
3. **Debris cleanup** — after N seconds, fade out and remove bodies that have come to rest far
   from their origin. Keeps the physics cost bounded if the user runs many quakes without reset.
4. **Subtle camera shake** — small amplitude, clearly secondary to the ground motion. See the
   warning in phase 5.4; this is the last thing to add, and the first to remove if it confuses
   the picture.

Do 1 and 2 before worrying about 3 and 4.

---

## Tests for this phase

**Unit — `src/sim/damage.test.ts`** (pure, drift-ratio maths):
- Drift ratio computed correctly from a known pair of floor positions
- Damage state thresholds map to the right labels at boundary values
- Peak drift tracking keeps the maximum, not the latest

**Physics integration:**
- A medium quake (0.2 g) does **not** collapse a small house
- A severe quake (0.8 g) **does** collapse a 12-floor block
- Collapsed debris comes to rest within ~10 s and does not fall through the ground
- Collapse is deterministic: same seed, same layout → same final damage states
- A collapsing building does not fling neighbours unrealistically far

That first pair is the important one. It pins both ends: the app must not destroy everything on
the default settings, and it must be *capable* of destruction when the phase 7 sliders are turned
up. Either failure makes the app pointless, and both are easy to introduce while tuning.

**E2E:**
- Run a severe quake, assert the summary panel reports at least one collapsed building

---

## Definition of done

- [ ] Drift is tracked per storey for every building, every physics step
- [ ] Exceeding `driftCapacity` removes joints and the structure falls
- [ ] Collapses look like structural failure, not an explosion
- [ ] Floors are colour-coded by peak drift
- [ ] A medium quake leaves a house standing — verified by test, not by eye
- [ ] A severe quake collapses the 12-floor block — verified by test
- [ ] Post-quake summary reports intact/damaged/collapsed counts
- [ ] Debris does not tunnel through the ground
- [ ] 60 fps maintained during a multi-building collapse on the phone
- [ ] All tests above pass

---

## Gotchas

- **Removing joints mid-step.** Queue removals and apply them between steps; mutating the joint
  set during a solver step can crash Rapier or corrupt the world.
- **Collapse cascades to the whole scene.** If one collapse knocks everything else down,
  `driftCapacity` is too low or the debris carries too much energy. Check against the 0.2 g house
  test before tuning anything else.
- **Performance.** A 12-floor collapse turns 12 jointed bodies into 12 free bodies with many new
  contacts. This is the project's worst-case frame. Test it explicitly on the phone, with several
  buildings collapsing at once.
- **Debris accumulation.** Repeated quakes without reset pile up bodies and degrade framerate.
  That is what 6.5.3 is for.
- **Do not fake the collapse.** A scripted animation is quicker and will look acceptable in one
  scenario, then wrong in every other — and it breaks the determinism the tests rely on.
