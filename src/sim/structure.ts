import { FLOOR_HEIGHT, floorCentreY, type BuildingSpec } from './buildingSpecs'

/**
 * A structure as nodes and links, rather than as a stack of floors.
 *
 * Every structure in the app used to be a vertical stack: `QuakeWorld` looped `spec.floors`,
 * placed body *i* at `floorCentreY(i)` and spring-jointed it to body *i-1* with anchors fixed
 * at `(0, ±FLOOR_HEIGHT/2, 0)`. That cannot express a road, which is a horizontal chain, or a
 * bridge, which is a deck on piers with unsupported spans in between.
 *
 * So a structure is now a little graph: boxes (`nodes`) tied together by springs (`links`),
 * with `GROUND` standing in for the world. A building is a vertical chain of them, a road a
 * horizontal one, a bridge a chain with piers hanging off it. The physics layer no longer knows
 * or cares which it is building.
 *
 * Pure: no Three.js, no Rapier, no DOM. The geometry is therefore testable on its own, which
 * matters because the stack generator has to keep reproducing the old layout *exactly* or every
 * calibrated period in `buildingSpecs.ts` silently stops being true.
 */

/** Stands in for the world in `StructureLink.from`. */
export const GROUND = -1

export type Vec3 = [number, number, number]

export interface StructureNode {
  /** Centre offset from the placement origin, metres, in the structure's own frame. */
  offset: Vec3
  /** Half-extents of the box collider. */
  half: Vec3
  mass: number
  /** Which part this is, for rendering and for the damage readout. */
  part: StructurePart
}

export type StructurePart = 'floor' | 'deck' | 'pier' | 'pylon' | 'mast' | 'pod'

export interface StructureLink {
  /** Node index, or `GROUND`. */
  from: number
  to: number
  /** Anchor in `from`'s local frame — or, for a `GROUND` link, relative to the placement origin. */
  anchorFrom: Vec3
  /** Anchor in `to`'s local frame. */
  anchorTo: Vec3
  /** Rest separation between the two centres. Its direction is the link's axis. */
  rest: Vec3
  /** N/m */
  stiffness: number
  /** N·s/m */
  damping: number
  /** Characteristic length for the drift ratio — storey height, or a deck span. */
  span: number
  /** Drift ratio at which this link fails. */
  capacity: number
}

export interface StructurePlan {
  nodes: StructureNode[]
  links: StructureLink[]
}

/** Quarter turns about Y, anticlockwise seen from above. */
export type Quarter = 0 | 1 | 2 | 3

/** Negating zero gives -0, which compares unequal to 0 under Object.is and serialises oddly.
 *  Geometry is compared and snapshotted all over the tests, so flatten it at the source. */
const nz = (v: number) => (v === 0 ? 0 : v)

/** Rotates a local offset by `q` quarter turns about the Y axis. */
export function rotateQuarter([x, y, z]: Vec3, q: Quarter): Vec3 {
  switch (q & 3) {
    case 1:
      return [nz(z), y, nz(-x)]
    case 2:
      return [nz(-x), y, nz(-z)]
    case 3:
      return [nz(-z), y, nz(x)]
    default:
      return [x, y, z]
  }
}

/** Half-extents swap on odd quarter turns; the box stays axis-aligned either way. */
export function rotateHalf([hx, hy, hz]: Vec3, q: Quarter): Vec3 {
  return q & 1 ? [hz, hy, hx] : [hx, hy, hz]
}

/** Footprint after rotation, as [width, depth]. */
export function rotateFootprint(
  [w, d]: [number, number],
  q: Quarter,
): [number, number] {
  return q & 1 ? [d, w] : [w, d]
}

/**
 * The classic vertical stack: one body per floor, each spring-jointed to the one below, and
 * floor 0 to the ground so the whole thing is a cantilever rather than a free-standing pile.
 *
 * This must stay geometrically identical to the original hard-coded loop — `structure.test.ts`
 * pins it — because `storeyStiffness` in `buildingSpecs.ts` is calibration output measured
 * against exactly this arrangement.
 */
function buildStack(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [w, d] = spec.footprint
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < spec.floors; i++) {
    nodes.push({
      offset: rotateQuarter([0, floorCentreY(i), 0], q),
      half: rotateHalf([w / 2, FLOOR_HEIGHT / 2, d / 2], q),
      mass: spec.floorMass,
      part: 'floor',
    })
  }

  for (let i = 0; i < spec.floors; i++) {
    const ground = i === 0
    links.push({
      from: ground ? GROUND : i - 1,
      to: i,
      // A ground anchor sits at the placement origin itself; a floor anchor at the interface
      // between the two floors.
      anchorFrom: ground ? [0, 0, 0] : rotateQuarter([0, FLOOR_HEIGHT / 2, 0], q),
      anchorTo: rotateQuarter([0, -FLOOR_HEIGHT / 2, 0], q),
      rest: ground ? [0, floorCentreY(0), 0] : [0, FLOOR_HEIGHT, 0],
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: FLOOR_HEIGHT,
      capacity: spec.driftCapacity,
    })
  }

  return { nodes, links }
}

/** Deck thickness, metres — shared by the road and both bridges. */
export const DECK_THICKNESS = 0.8

/**
 * A road: a chain of slab segments lying on the ground, each tied *both* to the ground beneath
 * it and to its neighbours.
 *
 * The ground tie is what makes it a road rather than a floating ribbon, and the neighbour ties
 * are what let it fail interestingly: segments shear apart into offset slabs, which is what
 * roads actually do in an earthquake. `spec.floors` is reused as the segment count — on a
 * horizontal structure "floors" means "how many pieces".
 */
function buildRoad(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [length, width] = spec.footprint
  const n = spec.floors
  const seg = length / n
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    const x = -length / 2 + seg * (i + 0.5)
    nodes.push({
      offset: rotateQuarter([x, DECK_THICKNESS / 2, 0], q),
      half: rotateHalf([seg / 2, DECK_THICKNESS / 2, width / 2], q),
      mass: spec.floorMass,
      part: 'deck',
    })
    // Tie to the ground directly below this segment.
    links.push({
      from: GROUND,
      to: i,
      anchorFrom: rotateQuarter([x, 0, 0], q),
      anchorTo: rotateQuarter([0, -DECK_THICKNESS / 2, 0], q),
      rest: rotateQuarter([0, DECK_THICKNESS / 2, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: seg,
      capacity: spec.driftCapacity,
    })
    // ...and to the segment behind it.
    if (i > 0) {
      links.push({
        from: i - 1,
        to: i,
        anchorFrom: rotateQuarter([seg / 2, 0, 0], q),
        anchorTo: rotateQuarter([-seg / 2, 0, 0], q),
        rest: rotateQuarter([seg, 0, 0], q),
        stiffness: spec.storeyStiffness,
        damping: spec.storeyDamping,
        span: seg,
        capacity: spec.driftCapacity,
      })
    }
  }

  return { nodes, links }
}

/**
 * An ordinary bridge: a deck carried on piers, with unsupported spans between them.
 *
 * Only the end abutments and the piers reach the ground. The segments in between hold each
 * other up, so losing a pier drops a whole span — and `supportedNodes` works that out by
 * reachability rather than by anything hard-coded here.
 */
function buildBridge(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [length, width] = spec.footprint
  const n = spec.floors
  const seg = length / n
  const deckY = spec.deckHeight ?? 9
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    const x = -length / 2 + seg * (i + 0.5)
    nodes.push({
      offset: rotateQuarter([x, deckY, 0], q),
      half: rotateHalf([seg / 2, DECK_THICKNESS / 2, width / 2], q),
      mass: spec.floorMass,
      part: 'deck',
    })
  }

  // Deck segment to deck segment.
  for (let i = 1; i < n; i++) {
    links.push({
      from: i - 1,
      to: i,
      anchorFrom: rotateQuarter([seg / 2, 0, 0], q),
      anchorTo: rotateQuarter([-seg / 2, 0, 0], q),
      rest: rotateQuarter([seg, 0, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: seg,
      capacity: spec.driftCapacity,
    })
  }

  // Piers under the two abutments and the middle, each a single column to the ground. The
  // pier stops at the deck's underside rather than at its centreline, so the two never
  // interpenetrate and — the part that actually bites — the zero-rest-length spring's two
  // anchors coincide at rest. Anchors that do not coincide pull the deck down until they do,
  // which shows up as a permanent drift the structure can never shed.
  const pierTop = deckY - DECK_THICKNESS / 2
  const pierHalf = pierTop / 2
  const pierAt = [...new Set([0, Math.floor(n / 2), n - 1])]
  for (const i of pierAt) {
    const x = -length / 2 + seg * (i + 0.5)
    const pier = nodes.length
    nodes.push({
      offset: rotateQuarter([x, pierHalf, 0], q),
      half: rotateHalf([seg * 0.18, pierHalf, width * 0.3], q),
      mass: spec.floorMass * 0.8,
      part: 'pier',
    })
    links.push({
      from: GROUND,
      to: pier,
      anchorFrom: rotateQuarter([x, 0, 0], q),
      anchorTo: rotateQuarter([0, -pierHalf, 0], q),
      rest: rotateQuarter([0, pierHalf, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: pierTop,
      capacity: spec.driftCapacity,
    })
    links.push({
      from: pier,
      to: i,
      anchorFrom: rotateQuarter([0, pierHalf, 0], q),
      anchorTo: rotateQuarter([0, -DECK_THICKNESS / 2, 0], q),
      rest: rotateQuarter([0, deckY - pierHalf, 0], q),
      stiffness: spec.storeyStiffness * 1.5,
      damping: spec.storeyDamping,
      span: pierTop,
      capacity: spec.driftCapacity,
    })
  }

  return { nodes, links }
}

/**
 * A cable-stayed bridge with a single asymmetric pylon — Bratislava's Most SNP, the one with
 * the flying-saucer restaurant on top.
 *
 * The deck runs the full span but only the near end reaches the ground; everything beyond is
 * held by stays running back to the pylon head, which carries the UFO's mass. That asymmetry
 * is the whole character of the thing: it is stiff at the anchored end and progressively more
 * reliant on the stays the further out you go, so it does not respond symmetrically to
 * anything. Lose the pylon and the far half has no path to the ground at all.
 */
function buildCableBridge(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [length, width] = spec.footprint
  const n = spec.floors
  const seg = length / n
  const deckY = spec.deckHeight ?? 10
  const pylonTop = spec.pylonHeight ?? 46
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    const x = -length / 2 + seg * (i + 0.5)
    nodes.push({
      offset: rotateQuarter([x, deckY, 0], q),
      half: rotateHalf([seg / 2, DECK_THICKNESS / 2, width / 2], q),
      mass: spec.floorMass,
      part: 'deck',
    })
  }
  for (let i = 1; i < n; i++) {
    links.push({
      from: i - 1,
      to: i,
      anchorFrom: rotateQuarter([seg / 2, 0, 0], q),
      anchorTo: rotateQuarter([-seg / 2, 0, 0], q),
      rest: rotateQuarter([seg, 0, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: seg,
      capacity: spec.driftCapacity,
    })
  }

  // Abutment: a short pier under the first segment, the only part of the deck the ground
  // holds up directly. A pier rather than a bare ground link so that, like every other member
  // here, its two anchors already meet and the spring starts at rest.
  const abutTop = deckY - DECK_THICKNESS / 2
  const abutHalf = abutTop / 2
  const abutX = -length / 2 + seg / 2
  const abutment = nodes.length
  nodes.push({
    offset: rotateQuarter([abutX, abutHalf, 0], q),
    half: rotateHalf([seg * 0.2, abutHalf, width * 0.32], q),
    mass: spec.floorMass * 0.8,
    part: 'pier',
  })
  links.push({
    from: GROUND,
    to: abutment,
    anchorFrom: rotateQuarter([abutX, 0, 0], q),
    anchorTo: rotateQuarter([0, -abutHalf, 0], q),
    rest: rotateQuarter([0, abutHalf, 0], q),
    stiffness: spec.storeyStiffness * 3,
    damping: spec.storeyDamping,
    span: abutTop,
    capacity: spec.driftCapacity,
  })
  links.push({
    from: abutment,
    to: 0,
    anchorFrom: rotateQuarter([0, abutHalf, 0], q),
    anchorTo: rotateQuarter([0, -DECK_THICKNESS / 2, 0], q),
    rest: rotateQuarter([0, deckY - abutHalf, 0], q),
    stiffness: spec.storeyStiffness * 2,
    damping: spec.storeyDamping,
    span: abutTop,
    capacity: spec.driftCapacity,
  })

  // The pylon: a leaning column rising from just past the abutment.
  const pylonX = -length / 2 + seg * 1.5
  const pylonHalf = pylonTop / 2
  const pylon = nodes.length
  nodes.push({
    offset: rotateQuarter([pylonX, pylonHalf, 0], q),
    half: rotateHalf([seg * 0.16, pylonHalf, width * 0.22], q),
    mass: spec.floorMass * 1.4,
    part: 'pylon',
  })
  links.push({
    from: GROUND,
    to: pylon,
    anchorFrom: rotateQuarter([pylonX, 0, 0], q),
    anchorTo: rotateQuarter([0, -pylonHalf, 0], q),
    rest: rotateQuarter([0, pylonHalf, 0], q),
    stiffness: spec.storeyStiffness * 3,
    damping: spec.storeyDamping * 2,
    span: pylonTop,
    capacity: spec.driftCapacity,
  })

  // The saucer, sitting on the pylon head.
  const podR = Math.max(width * 0.75, 7)
  const pod = nodes.length
  nodes.push({
    offset: rotateQuarter([pylonX, pylonTop + 1.6, 0], q),
    half: rotateHalf([podR, 1.6, podR], q),
    mass: spec.floorMass * 0.9,
    part: 'pod',
  })
  links.push({
    from: pylon,
    to: pod,
    anchorFrom: rotateQuarter([0, pylonHalf, 0], q),
    anchorTo: rotateQuarter([0, -1.6, 0], q),
    rest: rotateQuarter([0, pylonTop + 1.6 - pylonHalf, 0], q),
    stiffness: spec.storeyStiffness * 3,
    damping: spec.storeyDamping * 2,
    span: 3.2,
    capacity: spec.driftCapacity * 1.5,
  })

  // The pylon carries the deck where the two actually meet.
  //
  // The stays themselves are drawn, not simulated. Modelling each one as a member back to the
  // pylon head over-constrains the deck: every stayed segment is then held by both the deck
  // chain and its stay, both soft position constraints, and with anchors tens of metres from
  // the body they are attached to the two fight each other into a slowly stretching deck —
  // segments ended up anywhere between 7 and 13 m apart with no load on the bridge at all.
  //
  // Supporting the deck at the abutment and at the pylon leaves exactly the behaviour the
  // bridge is interesting for: short and stiff at the anchored end, a long cantilever beyond
  // the pylon that has to carry itself. See `UfoBridgeCables` for the visible cables.
  const pylonDeck = 1
  links.push({
    from: pylon,
    to: pylonDeck,
    anchorFrom: rotateQuarter([0, deckY - pylonHalf, 0], q),
    anchorTo: [0, 0, 0],
    rest: rotateQuarter([0, deckY - pylonHalf, 0], q),
    stiffness: spec.storeyStiffness * 2.5,
    damping: spec.storeyDamping * 1.5,
    span: pylonTop - deckY,
    capacity: spec.driftCapacity,
  })

  return { nodes, links }
}

/**
 * A tapered TV tower — Bratislava's Kamzík: a splayed base narrowing into a shaft, an
 * observation and restaurant ring near the top, and an antenna mast above that.
 *
 * Modelled at about half the real 194 m so it still belongs in a scene whose tallest block is
 * 36 m. The mass concentrated in the ring near the top is what gives it a long period and
 * makes it the structure that comes alive under distant, low-frequency quakes.
 */
function buildTower(spec: BuildingSpec, q: Quarter): StructurePlan {
  const [baseW, baseD] = spec.footprint
  const n = spec.floors
  const shaft = FLOOR_HEIGHT * 2 // a tower "floor" is a tall segment, not a storey
  const nodes: StructureNode[] = []
  const links: StructureLink[] = []

  for (let i = 0; i < n; i++) {
    // Taper from the splayed base to a slender shaft.
    const t = i / Math.max(n - 1, 1)
    const k = 1 - 0.62 * t
    nodes.push({
      offset: rotateQuarter([0, shaft * (i + 0.5), 0], q),
      half: rotateHalf([(baseW / 2) * k, shaft / 2, (baseD / 2) * k], q),
      mass: spec.floorMass * k,
      part: 'floor',
    })
    links.push({
      from: i === 0 ? GROUND : i - 1,
      to: i,
      anchorFrom: i === 0 ? [0, 0, 0] : rotateQuarter([0, shaft / 2, 0], q),
      anchorTo: rotateQuarter([0, -shaft / 2, 0], q),
      rest: i === 0 ? rotateQuarter([0, shaft / 2, 0], q) : rotateQuarter([0, shaft, 0], q),
      stiffness: spec.storeyStiffness,
      damping: spec.storeyDamping,
      span: shaft,
      capacity: spec.driftCapacity,
    })
  }

  // The observation ring: wider than the shaft it sits on, and heavy.
  const shaftTop = shaft * n
  const ringR = baseW * 0.62
  const ring = nodes.length
  nodes.push({
    offset: rotateQuarter([0, shaftTop + 2.4, 0], q),
    half: rotateHalf([ringR, 2.4, ringR], q),
    mass: spec.floorMass * 1.6,
    part: 'pod',
  })
  links.push({
    from: n - 1,
    to: ring,
    anchorFrom: rotateQuarter([0, shaft / 2, 0], q),
    anchorTo: rotateQuarter([0, -2.4, 0], q),
    rest: rotateQuarter([0, shaftTop + 2.4 - shaft * (n - 0.5), 0], q),
    stiffness: spec.storeyStiffness * 2,
    damping: spec.storeyDamping * 2,
    span: 4.8,
    capacity: spec.driftCapacity,
  })

  // Antenna mast.
  const mastH = shaft * 1.6
  const mast = nodes.length
  nodes.push({
    offset: rotateQuarter([0, shaftTop + 4.8 + mastH / 2, 0], q),
    half: rotateHalf([baseW * 0.07, mastH / 2, baseD * 0.07], q),
    mass: spec.floorMass * 0.2,
    part: 'mast',
  })
  links.push({
    from: ring,
    to: mast,
    anchorFrom: rotateQuarter([0, 2.4, 0], q),
    anchorTo: rotateQuarter([0, -mastH / 2, 0], q),
    rest: rotateQuarter([0, 2.4 + mastH / 2, 0], q),
    stiffness: spec.storeyStiffness * 0.5,
    damping: spec.storeyDamping,
    span: mastH,
    capacity: spec.driftCapacity * 2.5, // a mast is meant to whip
  })

  return { nodes, links }
}

export function buildStructure(spec: BuildingSpec, rotation: Quarter = 0): StructurePlan {
  switch (spec.layout ?? 'stack') {
    case 'road':
      return buildRoad(spec, rotation)
    case 'bridge':
      return buildBridge(spec, rotation)
    case 'cableBridge':
      return buildCableBridge(spec, rotation)
    case 'tower':
      return buildTower(spec, rotation)
    default:
      return buildStack(spec, rotation)
  }
}

/** Unit direction of a link's rest axis. Zero-length rest falls back to vertical. */
export function linkAxis(link: StructureLink): Vec3 {
  const [x, y, z] = link.rest
  const n = Math.hypot(x, y, z)
  return n < 1e-9 ? [0, 1, 0] : [x / n, y / n, z / n]
}
