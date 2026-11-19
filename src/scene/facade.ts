import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { FLOOR_HEIGHT, type BuildingSpec } from '../sim/buildingSpecs'
import { mulberry32 } from '../sim/random'

/**
 * Procedural building facades.
 *
 * Drawn to a canvas rather than shipped as image files: the repo stays asset-free, the bundle
 * does not grow, and a facade can be derived from the spec it belongs to instead of being
 * hand-authored per type. One texture per building type, cached, so ten towers of the same
 * kind cost one upload.
 *
 * The window grid is laid out per storey, so a texture tiled `floors` times vertically lines
 * its windows up with the floors the physics actually has. Lit windows come from the seeded
 * PRNG in src/sim/random.ts, so a given type looks the same on every reload — a facade that
 * reshuffles itself on refresh reads as a bug.
 */

const cache = new Map<string, Texture>()

/** Texture pixels per storey. Enough for crisp windows without a large upload. */
const PX_PER_FLOOR = 128

/** How many metres of facade one tile of the texture covers. */
export const TILE_METRES = 7

/**
 * Tiles per texture, in each direction.
 *
 * A single-tile facade repeats its one row of windows across the whole building, so every
 * floor ends up lit identically and the repetition is the first thing the eye finds. Four by
 * four gives sixteen distinct window patterns, and `Building` offsets the map per floor so
 * consecutive storeys draw different ones.
 */
export const TILES = 4

interface FacadeStyle {
  wall: string
  trim: string
  glass: string
  glassLit: string
  /** Windows per texture tile. A tile spans TILE_METRES of facade. */
  columns: number
  /** Fraction of a storey the window band occupies. */
  windowHeight: number
  litChance: number
}

function styleFor(spec: BuildingSpec): FacadeStyle {
  const house = spec.floors <= 2
  return {
    wall: spec.colour,
    trim: house ? '#6d5541' : '#5b6673',
    glass: house ? '#3f5a6b' : '#39505f',
    glassLit: house ? '#ffd9a0' : '#ffe9b8',
    // A tile is TILE_METRES wide, so this is windows per that span: about one every 2.3 m on
    // a block, one every 3.5 m on a house. Deriving it from the footprint instead gave a
    // 16 m tower twenty windows across, each 80 cm wide.
    columns: house ? 2 : 3,
    windowHeight: house ? 0.42 : 0.52,
    litChance: house ? 0.25 : 0.35,
  }
}

function drawFacade(spec: BuildingSpec): HTMLCanvasElement {
  const s = styleFor(spec)
  const canvas = document.createElement('canvas')
  // One storey tall; the material repeats it per floor so windows line up with real floors.
  const storey = PX_PER_FLOOR
  canvas.width = storey * TILES
  canvas.height = storey * TILES
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = s.wall
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const rng = mulberry32(
    // Stable per type: the same building always wears the same windows, rather than
    // reshuffling on every reload, which reads as a bug.
    [...spec.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
  )

  const cols = s.columns * TILES
  const cellW = canvas.width / cols
  const winW = cellW * 0.58
  const winH = storey * s.windowHeight

  for (let row = 0; row < TILES; row++) {
    const bandTop = row * storey
    // Floor slab band along the bottom of each storey, so storeys read from a distance.
    ctx.fillStyle = s.trim
    ctx.fillRect(0, bandTop + storey - 6, canvas.width, 6)

    const top = bandTop + (storey - 6 - winH) / 2
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + (cellW - winW) / 2
      ctx.fillStyle = rng() < s.litChance ? s.glassLit : s.glass
      ctx.fillRect(x, top, winW, winH)
      // A thin reveal on two sides gives the window depth without a normal map.
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(x, top, winW, 2)
      ctx.fillRect(x, top, 2, winH)
    }
  }

  return canvas
}

/**
 * The facade for a type, cached. Returns null where there is no DOM — the headless physics
 * tests import the scene's siblings and must not need a canvas.
 */
export function facadeTexture(spec: BuildingSpec): Texture | null {
  if (typeof document === 'undefined') return null
  const hit = cache.get(spec.id)
  if (hit) return hit

  const texture = new CanvasTexture(drawFacade(spec))
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  cache.set(spec.id, texture)
  return texture
}

/** How many times the facade repeats across a face of the given size. */
export function facadeRepeat(width: number, height: number): [number, number] {
  // Fractional repeats are fine and in fact wanted: a one-storey house shows a quarter of the
  // texture, which is exactly one of its four window rows.
  return [
    Math.max(0.2, width / (TILE_METRES * TILES)),
    Math.max(1 / TILES, height / (FLOOR_HEIGHT * TILES)),
  ]
}
