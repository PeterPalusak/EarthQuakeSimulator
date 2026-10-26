// Generates public/icon-192.png and public/icon-512.png.
// Hand-rolled PNG writer so the repo needs no image dependency — Android's install prompt
// will not appear without correctly sized icons (plan/08-deployment.md 8.5).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgba: (x, y) -> [r, g, b, a] */
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgba(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Three towers of decreasing height over a shaking ground line, on the app's theme colour.
// Drawn in normalised 0..1 space so both sizes come out identical.
const TOWERS = [
  { x0: 0.18, x1: 0.37, top: 0.3 },
  { x0: 0.41, x1: 0.59, top: 0.45 },
  { x0: 0.63, x1: 0.82, top: 0.58 },
]
const GROUND_Y = 0.74

function paint(size) {
  return (px, py) => {
    const u = (px + 0.5) / size
    const v = (py + 0.5) / size
    // rounded-square mask so the icon reads well un-maskable too
    const r = 0.12
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0)
    const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0)
    if (Math.hypot(dx, dy) > r) return [0, 0, 0, 0]

    if (v > GROUND_Y) {
      // ground: a sine ripple band, brighter where the wave peaks
      const wave = Math.sin((u - 0.5) * 22) * 0.5 + 0.5
      const t = (v - GROUND_Y) / (1 - GROUND_Y)
      const k = Math.round(90 + 60 * wave * (1 - t))
      return [k * 0.55, k, k * 0.6, 255]
    }
    for (const [i, t] of TOWERS.entries()) {
      if (u >= t.x0 && u <= t.x1 && v >= t.top && v <= GROUND_Y) {
        // floor banding — the per-floor model is the whole point of the app
        const floors = Math.floor(((GROUND_Y - v) / (GROUND_Y - t.top)) * (3 + i * 2))
        const band = floors % 2 === 0 ? 1 : 0.82
        const lean = i === 0 ? [248, 113, 113] : [226, 232, 240] // the tall one is failing
        return [...lean.map((c) => Math.round(c * band)), 255]
      }
    }
    return [17, 24, 39, 255] // theme_color
  }
}

mkdirSync(OUT, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size, paint(size)))
  console.log(`public/icon-${size}.png`)
}
