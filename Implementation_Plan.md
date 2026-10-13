# Earth Quake Generator — Implementation Plan

This is the index. Each phase has its own file under [plan/](plan/) with tasks, code sketches,
tests and a definition of done. Work the phases in order — each builds on the one before.

Source of truth for *what* to build: [Description.md](Description.md).
This document covers *how* and *in what order*.

---

## Phase overview

| # | Phase | File | Delivers | Est. |
|---|---|---|---|---|
| 0 | Project setup | [00-setup.md](plan/00-setup.md) | Scaffolded repo, deps, config, CI | 0.5 d |
| 1 | 3D scene & camera | [01-scene-and-camera.md](plan/01-scene-and-camera.md) | Flat ground you can orbit/pinch on a phone | 1 d |
| 2 | Buildings & placement | [02-buildings-and-placement.md](plan/02-buildings-and-placement.md) | Palette of 5 types, tap-to-place with ghost preview | 1.5 d |
| 3 | Physics | [03-physics.md](plan/03-physics.md) | Per-floor rigid bodies that stand up and sway correctly | 2 d |
| 4 | Ground motion | [04-ground-motion.md](plan/04-ground-motion.md) | Pure, seeded, tested earthquake signal generator | 1.5 d |
| 5 | Running a quake | [05-earthquake-run.md](plan/05-earthquake-run.md) | Red button shakes the ground, buildings respond | 1 d |
| 6 | Collapse & polish | [06-collapse-and-polish.md](plan/06-collapse-and-polish.md) | Buildings fail and fall down convincingly | 1.5 d |
| 7 | Quake controls | [07-quake-controls.md](plan/07-quake-controls.md) | Magnitude + epicentre distance (Description §2 "later") | 1 d |
| 8 | Deployment | [08-deployment.md](plan/08-deployment.md) | Live URL, installable PWA, CI gate | 0.5 d |

Estimates assume one person and are deliberately rough. Phases 3 and 4 carry the real risk;
everything else is assembly.

**Phase 8 is deliberately not last in practice.** Do a first deploy at the end of phase 5, as
soon as there is something worth looking at. See [08-deployment.md](plan/08-deployment.md).

---

## Dependency graph

```
        0 Setup
           │
        1 Scene ──────────────┐
           │                  │
        2 Placement           │
           │                  │
        3 Physics             │  4 Ground motion   ← independent, pure TS
           │                  │     │                 can be built in parallel
           └────────┬─────────┴─────┘
                    │
              5 Run a quake  ──────► first deploy (phase 8 steps)
                    │
           ┌────────┴────────┐
        6 Collapse      7 Controls
                    │
              8 Full deploy
```

Phase 4 touches no Three.js and no Rapier. If two people are working, that is the clean split:
one on the scene (1→2→3), one on the simulation maths (4).

---

## Requirement traceability

Every line of [Description.md](Description.md) §2 maps to a phase. Nothing is dropped:

| Requirement (Description §2) | Phase |
|---|---|
| "3D environment which you can rotate by finger (in all 3 directions)" | 1 |
| "base will be just flat" | 1 |
| "selection of buildings" on the top side — 5 types | 2 |
| "by pointing on the map you can build it" | 2 |
| "shake the buildings accordingly" (buildings behave like structures) | 3 |
| "simulation of a real earthquake" | 4 |
| "on the right side, a red button, which when pressed an earthquake will start" | 5 |
| "for now, have a medium earthquake" | 5 |
| "later… how strong the earthquake can be and how far away it can be located" | 7 |

---

## Conventions that apply to every phase

**Units are SI and real.** Metres, kilograms, seconds, m/s². Floor height is **3 m**, so the
12-floor block is 36 m tall. Gravity is 9.81. Accelerations are quoted in *g* (1 g = 9.81 m/s²)
because that is how ground motion is reported in the real world. Do not introduce scale factors
to make something "look right" — if it looks wrong, the model is wrong.

**The simulation layer imports nothing.** `src/sim/**` may not import `three`, `@react-three/*`
or `@dimforge/rapier3d`. It is pure TypeScript over numbers. This is what makes the earthquake
testable, and it is the single most important structural rule in the project. Enforce it with an
ESLint `no-restricted-imports` rule so it cannot rot.

**Randomness is seeded.** Never `Math.random()` in `src/sim/**`. Use the `mulberry32` PRNG from
phase 0. Every quake is reproducible from `{ magnitude, distanceKm, seed }`, which makes tests
possible and lets you replay the identical quake against different layouts.

**Physics runs on a fixed timestep** of 1/120 s with an accumulator, decoupled from render
framerate. Non-fixed steps make the result differ between a 60 Hz phone and a 144 Hz monitor,
which would make every physics test meaningless.

**Test on a real Android phone at the end of every phase**, not at the end of the project.
Gesture and performance problems do not reproduce on a desktop with a mouse. See
[Description.md](Description.md) §1 "Running on Android".

---

## Definition of done (applies to every phase)

A phase is done when all of the following are true:

- [ ] `npm test` passes, including the new tests the phase's file specifies
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] The feature works when opened on a real Android phone over `npm run dev:lan`
- [ ] 60 fps is held with 10 buildings placed (check with `r3f-perf`)
- [ ] The phase's own "Definition of done" checklist is ticked
- [ ] Work is committed to `main` with a message naming the phase

---

## Performance budget

Carry these numbers through every phase. If a phase breaks one, fix it in that phase rather than
accumulating debt into phase 6 where it becomes hard to attribute.

| Metric | Budget |
|---|---|
| Frame time, mid-range Android, 10 buildings | < 16.6 ms (60 fps) |
| Rapier step time | < 8 ms |
| Draw calls | < 150 |
| Initial download (gzipped) | < 2 MB |
| Time to interactive, 4G | < 4 s |

---

## Known open points

Decisions deliberately deferred, so they do not block the start:

1. **Joint stiffness values per building type** — derived empirically in phase 3 via the
   free-vibration calibration test, not guessed up front.
2. **Visual style** — flat-shaded colour blocks are assumed throughout. Textures, if ever wanted,
   are a phase-6 polish item and change nothing structural.
3. **Soil type** as a third quake parameter — the ground motion API takes it from phase 4, but no
   UI exposes it. Trivial to surface later if wanted.
4. **Saving/sharing a layout** — not a requirement. If it ever is, the store is already a plain
   serialisable object, so it is a URL-encoding job and nothing more.
