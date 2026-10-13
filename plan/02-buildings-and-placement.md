# Phase 2 — Buildings & placement

**Goal:** pick one of five building types from a top bar, tap the ground, and a building appears
there.

**Depends on:** phase 1.

**Requirements covered:** *"On the top side, you have a selection of buildings: a small house, a
large double floor house, small block of flats (4 floors), medium block of flats (8 floors) and
large block of flats (12 floors). When you select a given building, then by pointing on the map
you can build it in the 3D environment."*

Still no physics — buildings are static meshes here. Phase 3 replaces the mesh with rigid bodies
without changing the specs, the palette or the placement logic.

---

## Tasks

### 2.1 `src/sim/buildingSpecs.ts` — the five types

This is a `src/sim` file: plain data, no imports. It is the shared vocabulary for every later
phase, so get the field names right now.

```ts
export const FLOOR_HEIGHT = 3        // metres, all building types

export interface BuildingSpec {
  id: BuildingTypeId
  label: string                      // shown in the palette and used as the a11y name
  floors: number
  footprint: [number, number]        // metres, [x, z]
  floorMass: number                  // kg per floor
  jointStiffness: number             // N·m/rad — calibrated in phase 3, placeholder for now
  driftCapacity: number              // interstorey drift ratio at failure — phase 6
  colour: string
}

export const BUILDING_SPECS: Record<BuildingTypeId, BuildingSpec> = {
  smallHouse:  { floors: 1,  footprint: [6, 6],   floorMass: 15_000,  driftCapacity: 0.030, … },
  largeHouse:  { floors: 2,  footprint: [9, 8],   floorMass: 30_000,  driftCapacity: 0.030, … },
  smallBlock:  { floors: 4,  footprint: [12, 10], floorMass: 120_000, driftCapacity: 0.022, … },
  mediumBlock: { floors: 8,  footprint: [14, 12], floorMass: 168_000, driftCapacity: 0.020, … },
  largeBlock:  { floors: 12, footprint: [16, 12], floorMass: 192_000, driftCapacity: 0.018, … },
}

/** Rule of thumb used by structural engineers: T ≈ 0.1 s per storey. The phase 3 calibration
 *  test tunes jointStiffness until free vibration matches this. */
export const targetPeriod = (floors: number) => 0.1 * floors
```

Masses come from floor area × a mass density — roughly 400 kg/m² for timber-framed houses, 1000
kg/m² for concrete blocks of flats. They do not need to be exact; they need to be *relatively*
right, because what drives the whole simulation is the ratio of mass to stiffness.

`targetPeriod` is the most consequential line in the file. It is why the 12-floor block (T ≈ 1.2 s)
and the house (T ≈ 0.1 s) respond completely differently to the same quake.

### 2.2 `src/state/store.ts` — Zustand

```ts
interface PlacedBuilding {
  instanceId: string
  type: BuildingTypeId
  position: [number, number]         // x, z on the ground; y is always 0
}

interface AppState {
  selectedType: BuildingTypeId | null
  placed: PlacedBuilding[]
  select: (t: BuildingTypeId | null) => void
  place: (t: BuildingTypeId, pos: [number, number]) => void
  remove: (instanceId: string) => void
  clear: () => void
}
```

Keep the store flat and serialisable. No Three.js objects, no refs — those live in the scene and
are looked up by `instanceId`. This keeps the store testable in plain Vitest and makes
save/share trivial if it is ever wanted.

### 2.3 `src/ui/BuildingPalette.tsx` — the top bar

Five buttons, horizontally scrollable on narrow screens, selected state clearly marked.

```tsx
<div className="pointer-events-auto absolute inset-x-0 top-0 flex gap-2 overflow-x-auto p-3">
  {Object.values(BUILDING_SPECS).map(spec => (
    <button
      key={spec.id}
      aria-label={spec.label}
      aria-pressed={selectedType === spec.id}
      onClick={() => select(selectedType === spec.id ? null : spec.id)}
      className={selectedType === spec.id ? 'ring-2 ring-amber-400 …' : '…'}
    >
      <BuildingIcon spec={spec} />
      <span>{spec.label}</span>
      <span className="text-xs opacity-70">{spec.floors} floor{spec.floors > 1 ? 's' : ''}</span>
    </button>
  ))}
</div>
```

Two requirements on these buttons:

- **Minimum 44×44 px touch targets.** Smaller is unhittable with a thumb on a phone.
- **`aria-label` matching the spec label**, because the Playwright tests select by accessible name
  (`getByRole('button', { name: 'Small house' })`). Changing a label breaks a test, which is the
  correct behaviour.

Tapping the already-selected type deselects it. Without that, there is no way to get back to "no
tool selected" to inspect or delete, and every ground tap keeps spawning buildings.

### 2.4 `src/scene/PlacementGhost.tsx` — preview under the finger

1. Raycast the pointer against the ground plane (`useThree().raycaster`, or an invisible plane
   mesh with `onPointerMove`).
2. Snap the hit point to a 1 m grid: `Math.round(x)`, `Math.round(z)`.
3. Render the selected building's silhouette there, semi-transparent.
4. Tint it **red when the position is invalid**, green/neutral when valid.

Snapping is not cosmetic. Fingers are imprecise, and unsnapped placement produces buildings whose
footprints overlap by a few centimetres — which in phase 3 makes Rapier resolve a huge penetration
on frame 1 and fling them across the map.

### 2.5 Overlap rejection

Before allowing a placement, test the candidate footprint (plus a 1 m margin) against every placed
building's footprint as an axis-aligned box overlap. Reject if any overlap.

Put this in `src/sim/placement.ts` as a pure function — it is real logic with edge cases, and it
is far easier to test there than through the scene:

```ts
export function canPlace(
  type: BuildingTypeId,
  pos: [number, number],
  placed: PlacedBuilding[],
  margin = 1,
): boolean
```

Also reject positions outside the ±100 m ground bounds.

### 2.6 Tap vs drag disambiguation

**The subtlest problem in this phase.** On a touchscreen, the gesture that orbits the camera and
the gesture that places a building both begin as "finger down on the canvas". Treat a pointer
interaction as a *tap* only if:

- it travelled less than ~8 px, **and**
- it lasted less than ~300 ms

Track `pointerdown` position and time, compare on `pointerup`. Anything else is a camera drag and
must not place a building.

Skip this and every attempt to orbit the camera scatters buildings across the map. It is not
reproducible with a mouse, where clicks are crisp — it only shows up on the phone, which is why
it is called out explicitly here.

### 2.7 Selection and deletion

With no type selected, tapping a placed building selects it and shows a small delete button near
it (or an outline plus a delete control in a corner). Plus a "Clear all" button.

Needed for testing far more than for the requirement: phase 3 onwards involves repeatedly placing
a building, running a quake and resetting, and without deletion every test cycle needs a page
reload.

---

## Tests for this phase

**Unit — `src/sim/buildingSpecs.test.ts`:**

- All five required types exist with the floor counts from the requirement: 1, 2, 4, 8, 12
- Every spec has positive mass, positive footprint dimensions, non-empty label
- Labels are unique (they are used as accessible names)
- Taller buildings have footprints at least as large as shorter ones

**Unit — `src/sim/placement.test.ts`:**

- Placing on empty ground succeeds
- Placing exactly on top of an existing building is rejected
- Placing adjacent but beyond the margin succeeds
- Placing just inside the margin is rejected
- Positions outside ground bounds are rejected
- A large block is rejected where a small house would fit (footprint is respected, not just centre
  distance)

**Component — `src/ui/BuildingPalette.test.tsx`** (jsdom):

- Renders exactly five buttons
- Clicking one sets `selectedType` in the store
- Clicking the selected one clears the selection
- The selected button has `aria-pressed="true"`

**E2E:** extend the smoke test to select a type, tap the canvas and assert the placed count
increases (expose it as a `data-testid` counter).

---

## Definition of done

- [ ] Five buttons on the top bar, matching the requirement's names and floor counts
- [ ] Selecting a type shows a ghost that follows the finger, snapped to the 1 m grid
- [ ] The ghost turns red over an invalid position and placement is refused
- [ ] Tapping the ground places a building; tapping again places another
- [ ] **On a phone:** orbiting the camera never accidentally places a building
- [ ] Placed buildings can be deleted individually and cleared all at once
- [ ] 10 buildings placed, still 60 fps
- [ ] All tests above pass

---

## Gotchas

- **Instance the floor geometry.** All buildings are boxes; share one `boxGeometry` and one
  material per colour rather than creating geometry per floor, or draw calls climb fast.
- **The ghost must not be raycastable** (`raycast={null}`), otherwise it intercepts its own
  pointer events and the preview jitters or sticks.
- **Centre of footprint vs corner.** Fix the convention now — `position` is the **centre** of the
  footprint at ground level — and document it in the type. Mixing the two produces a half-building
  offset that is maddening to track down in phase 3.
- **`overflow-x-auto` on the palette can swallow vertical drags** near the top of the screen on
  some Android builds. If the camera feels dead under the top bar, that is why — constrain the
  palette's height and let the canvas own everything below it.
