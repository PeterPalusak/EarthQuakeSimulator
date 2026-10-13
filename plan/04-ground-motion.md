# Phase 4 — Ground motion simulation

**Goal:** a pure, seeded, fully tested function that turns `{ magnitude, distanceKm, seed }` into
a realistic earthquake ground-motion time history.

**Depends on:** phase 0 only. **Can be built in parallel with phases 1–3.**

**Requirements covered:** *"The earthquake is a simulation of a real earthquake"*, and it is the
groundwork for *"later I would like to have a choice of how strong the earthquake can be and how
far away of the place it can be located."*

This is the phase that decides whether the app is a simulation or a shake animation. It imports
nothing — no Three.js, no Rapier — so all of it is directly unit-testable.

---

## The API

Design the full signature now, even though phase 5 only calls it with the medium-quake defaults.
Phase 7's sliders then wire into something that already exists rather than forcing a refactor.

```ts
// src/sim/groundMotion.ts
export interface QuakeParams {
  magnitude: number       // moment magnitude Mw, 4.0 – 8.0
  distanceKm: number      // epicentral distance, 1 – 200
  seed: number
  soil?: SoilType         // 'rock' | 'firm' | 'soft', default 'firm'
  dt?: number             // sample interval, default 1/200 s
}

export interface GroundMotion {
  dt: number
  duration: number                 // seconds
  samples: number
  acc:  { x: Float32Array; y: Float32Array; z: Float32Array }   // m/s²
  disp: { x: Float32Array; y: Float32Array; z: Float32Array }   // m — what drives the ground body
  pga: number                      // peak ground acceleration, g
}

export function generateGroundMotion(params: QuakeParams): GroundMotion
```

Phase 5 consumes `disp` (it sets the ground body's position). `acc` and `pga` exist for the UI
readout and for the tests.

---

## Tasks

### 4.1 Target intensity from magnitude and distance

A ground-motion prediction equation, in the standard attenuation form:

```
log10(PGA_g) = a + b·M − c·log10(√(R² + h²))

a = −1.55,  b = 0.42,  c = 1.0,  h = 8 km   (focal depth term)
```

The `h` term prevents PGA going to infinity as `R → 0`, which both reflects the physical reality
of a finite rupture depth and stops the app exploding when the slider is at 1 km.

Sanity values to assert in tests:

| Magnitude | Distance | PGA | Reads as |
|---|---|---|---|
| 5.5 | 10 km | ~0.20 g | Medium — **the phase 5 default** |
| 5.0 | 50 km | ~0.04 g | Barely felt |
| 7.0 | 10 km | ~0.70 g | Severe |
| 7.0 | 150 km | ~0.09 g | Long, slow roll |

Clamp the result to a sane range (say 0.005–1.5 g) so extreme slider combinations cannot produce
numbers that destabilise the solver.

### 4.2 Duration from magnitude

Bigger ruptures take longer. An M5 shakes for seconds, an M7.5 for a minute:

```
duration = clamp(10^(0.31·M − 0.77) + 0.06·R, 5, 60)    // seconds
```

Distance adds a little duration through wave scattering. Cap at 60 s — nobody will watch longer,
and it bounds the memory the arrays take.

### 4.3 White noise → filtered noise (Kanai–Tajimi)

This step is what makes the output an *earthquake* rather than a vibration.

1. Generate Gaussian white noise with `gaussian(mulberry32(seed))` from phase 0.
2. Pass it through a Kanai–Tajimi filter — a second-order system representing the soil layer,
   which concentrates energy around a dominant ground frequency:

```
ÿ + 2ζg·ωg·ẏ + ωg²·y = −w(t)
```

Discretise with a simple state-space or Newmark-β step at `dt`. Soil parameters:

| Soil | ωg (rad/s) | fg (Hz) | ζg |
|---|---|---|---|
| rock | 25.0 | 4.0 | 0.65 |
| firm | 15.7 | 2.5 | 0.60 |
| soft | 8.0 | 1.3 | 0.85 |

**Distance also shifts the dominant frequency down.** High frequencies attenuate faster than low
ones over distance, so a distant quake arrives as a slow deep roll:

```
ωg_effective = ωg · (1 − 0.3 · min(distanceKm / 150, 1))
```

This line is why phase 7's distance slider changes *which building falls over* rather than merely
how hard everything shakes. A near quake is a sharp rattle that punishes stiff houses; a distant
one is a long swell that punishes tall towers. Do not skip it.

### 4.4 Envelope

Multiply by a Jennings-type envelope — real quakes build, peak, then fade:

```
t < t1          : (t / t1)²                       quadratic rise,  t1 = 0.15 · duration
t1 ≤ t ≤ t2     : 1                               strong motion,   t2 = 0.50 · duration
t > t2          : exp(−0.08 · (t − t2) · 10/duration)    exponential decay
```

A constant-amplitude shake reads as fake within about half a second, no matter how good the
frequency content is.

### 4.5 Scale to target PGA

Find the peak absolute acceleration across the record and rescale the whole thing so the peak
equals the PGA from 4.1. Do this **after** filtering and enveloping, so neither step changes the
intensity.

### 4.6 Three components

Generate X and Z (horizontal) from **independent noise streams** — derive sub-seeds from the main
seed, e.g. `seed`, `seed ^ 0x9e3779b9`, `seed ^ 0x85ebca6b`. Using the same stream for both makes
the ground move along a single diagonal line, which looks visibly artificial.

Vertical (Y) at **half the horizontal amplitude** and with higher-frequency content — real
vertical motion is weaker and sharper than horizontal.

### 4.7 Integrate to displacement, with baseline correction

Phase 5 drives a *kinematic position*, so it needs displacement, not acceleration.

1. Cumulative-trapezoid integrate acceleration → velocity.
2. Integrate velocity → displacement.
3. **Baseline-correct.** Naive double integration of noisy acceleration drifts badly — the ground
   wanders tens of metres away and never comes back. Fix by fitting and subtracting a low-order
   polynomial (quadratic is enough) from the displacement, or by high-pass filtering at ~0.1 Hz.

Then assert in a test that displacement starts and ends near zero. **Without this step the app is
visibly broken** — the ground slides off into the distance, taking the buildings with it — and it
is the single most likely thing in this phase to go wrong.

Clamp peak displacement to something physical (±0.5 m). Real near-field displacements can be
larger, but beyond this the visual reads as the world sliding rather than shaking.

### 4.8 Preset

```ts
export const MEDIUM_QUAKE: QuakeParams = { magnitude: 5.5, distanceKm: 10, seed: 1 }
```

The Description's *"For now, have a medium earthquake"*. Phase 5 uses this directly; phase 7
replaces it with slider state.

---

## Tests for this phase

The heart of the test suite. All pure, all fast.

**Determinism**
- Same seed → identical arrays
- Different seed → different arrays, similar statistics (PGA within 20%)

**Intensity**
- Peak of `acc` equals `pga × 9.81` within 1%
- PGA decreases monotonically across `distanceKm` of 1…200 at fixed magnitude
- PGA increases monotonically across `magnitude` of 4…8 at fixed distance
- The four sanity values in the 4.1 table land within ±30%

**Duration**
- Higher magnitude → longer duration
- Duration stays within the 5–60 s clamp across the whole parameter range

**Envelope**
- First 1% of samples are much smaller than the peak
- The maximum occurs in the middle half of the record, not at the very start or end
- Last 1% of samples are much smaller than the peak

**Frequency content**
- FFT the acceleration; the spectral peak sits near the soil's `fg` (±40%)
- A quake at 150 km has a lower spectral centroid than the same magnitude at 5 km ← *the test
  that protects the physics behind phase 7's distance slider*

**Integration**
- `disp` at t=0 is ~0
- `disp` at t=end is within 2 cm of 0 (baseline correction works)
- Peak `|disp|` is under the 0.5 m clamp

**Components**
- X and Z are not correlated (|Pearson r| < 0.3)
- Peak |Y| is roughly half of peak horizontal

**Robustness**
- M4 @ 200 km and M8 @ 1 km both produce finite, non-NaN arrays
- No `NaN` or `Infinity` anywhere in any output array, for any parameter combination

---

## Definition of done

- [ ] `generateGroundMotion` returns finite values across the whole parameter range
- [ ] All tests above pass
- [ ] ESLint confirms the module imports nothing from `three`/`@react-three`/`@dimforge`
- [ ] Generating a 60 s record at 200 Hz takes < 50 ms (it is generated once per button press,
      but a slow generator means a visible hitch when the red button is tapped)
- [ ] A dev-only debug page plots acc/vel/disp for eyeball inspection — worth the thirty minutes,
      because a wrong envelope or a drifting baseline is obvious in a plot and invisible in numbers

---

## Gotchas

- **Baseline drift is the classic failure.** If the ground wanders off, this is why. Test for it
  explicitly rather than discovering it in phase 5.
- **Generate once, play back.** Never generate samples per frame — the result would depend on
  framerate and the quake would differ between devices.
- **`Float32Array` not `number[]`.** A 60 s record at 200 Hz is 12,000 samples × 6 arrays; typed
  arrays keep this cheap and make the phase 5 playback allocation-free.
- **Filter stability.** An explicit integrator for the Kanai–Tajimi filter can go unstable if
  `dt` is too large relative to `ωg`. At `dt = 1/200` and the parameters above it is fine, but if
  you ever expose `dt`, assert `dt < 0.1 / ωg`.
- **Do not tune the constants to make the shake "look good".** If the visual is wrong, the problem
  is more likely in phase 3's stiffness or phase 5's friction. Changing the GMPE constants to
  compensate hides the real bug and breaks the tested physics.
