#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Generates every icon Murmur uses: app icons (png, icns, ico) and tray
// icons, all drawn programmatically so the repo never tracks a binary
// asset. Pure Node: a minimal PNG encoder over zlib, no dependencies.
// Deterministic: same bytes on every run.
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const zlib = require('node:zlib')

const root = join(__dirname, '..')
const iconsDir = join(root, 'build', 'icons')
const trayDir = join(root, 'build', 'icons', 'tray')

// Night studio palette.
const INK = [15, 14, 17]
const AMBER = [240, 164, 75]
const RED = [229, 72, 77]
const BLACK = [0, 0, 0]
const WHITE = [236, 233, 228]

// ---------------------------------------------------------------- png ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encode an RGBA byte buffer as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ------------------------------------------------------------- drawing ---

/** Signed distance to a rounded rectangle centered at (cx, cy). */
function insideRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r <= 0
}

/**
 * Render a size x size RGBA buffer by 4x4 supersampling scene(x, y),
 * which returns [r, g, b, a] per sample point in pixel coordinates.
 */
function render(size, scene) {
  const SS = 4
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = scene(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      out[i] = a > 0 ? Math.round(r / a) : 0
      out[i + 1] = a > 0 ? Math.round(g / a) : 0
      out[i + 2] = a > 0 ? Math.round(b / a) : 0
      out[i + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

// The waveform mark: five rounded bars, symmetric, mid bar tallest.
const BAR_HEIGHTS = [0.4, 0.72, 1.0, 0.62, 0.44]

/** Bar hit test in a size s canvas. maxHalf is half the tallest bar. */
function makeBars(s, maxHalf, barWidth, gap) {
  const n = BAR_HEIGHTS.length
  const total = n * barWidth + (n - 1) * gap
  const startX = (s - total) / 2
  const cy = s / 2
  return (px, py) => {
    for (let i = 0; i < n; i++) {
      const cx = startX + i * (barWidth + gap) + barWidth / 2
      const hh = Math.max(maxHalf * BAR_HEIGHTS[i], barWidth / 2)
      if (insideRoundedRect(px, py, cx, cy, barWidth / 2, hh, barWidth / 2)) return true
    }
    return false
  }
}

/** App icon: ink rounded square, amber waveform. */
function appIconScene(s) {
  const inset = 0.05 * s
  const radius = 0.22 * s
  const bars = makeBars(s, 0.21 * s, 0.075 * s, 0.055 * s)
  return (px, py) => {
    if (bars(px, py)) return [...AMBER, 1]
    if (insideRoundedRect(px, py, s / 2, s / 2, s / 2 - inset, s / 2 - inset, radius)) {
      return [...INK, 1]
    }
    return [0, 0, 0, 0]
  }
}

/** Tray icon: transparent background, waveform only, given color. */
function trayScene(s, color) {
  const bars = makeBars(s, 0.38 * s, 0.11 * s, 0.09 * s)
  return (px, py) => (bars(px, py) ? [...color, 1] : [0, 0, 0, 0])
}

// ---------------------------------------------------------- containers ---

function buildIcns(pngBySize) {
  const TYPES = [
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const entries = TYPES.map(([type, size]) => {
    const png = pngBySize[size]
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(8 + png.length, 4)
    return Buffer.concat([head, png])
  })
  const body = Buffer.concat(entries)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([header, body])
}

function buildIco(pngBySize, sizes) {
  const count = sizes.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dirs = []
  const datas = []
  let offset = 6 + count * 16
  for (const size of sizes) {
    const png = pngBySize[size]
    const dir = Buffer.alloc(16)
    dir[0] = size >= 256 ? 0 : size
    dir[1] = size >= 256 ? 0 : size
    dir.writeUInt16LE(1, 4) // planes
    dir.writeUInt16LE(32, 6) // bit count
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    offset += png.length
    dirs.push(dir)
    datas.push(png)
  }
  return Buffer.concat([header, ...dirs, ...datas])
}

// ------------------------------------------------------------------ go ---

function main() {
  mkdirSync(iconsDir, { recursive: true })
  mkdirSync(trayDir, { recursive: true })

  const appSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const pngBySize = {}
  for (const s of appSizes) {
    pngBySize[s] = encodePng(s, s, render(s, appIconScene(s)))
    writeFileSync(join(iconsDir, `icon-${s}.png`), pngBySize[s])
  }

  writeFileSync(join(root, 'build', 'icon.icns'), buildIcns(pngBySize))
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(pngBySize, [16, 24, 32, 48, 64, 128, 256]))
  writeFileSync(join(root, 'build', 'icon.png'), pngBySize[512])

  // Tray set. macOS gets template images (black + alpha, system recolors).
  // Windows picks warm-white or ink at runtime to match the taskbar theme
  // (a white icon on a light taskbar reads as a ghost outline), and both
  // platforms get a red recording variant.
  const trayVariants = [
    ['trayTemplate.png', 16, BLACK],
    ['trayTemplate@2x.png', 32, BLACK],
    ['tray-light.png', 16, WHITE],
    ['tray-light@2x.png', 32, WHITE],
    ['tray-dark.png', 16, INK],
    ['tray-dark@2x.png', 32, INK],
    ['tray-recording.png', 16, RED],
    ['tray-recording@2x.png', 32, RED]
  ]
  for (const [name, size, color] of trayVariants) {
    writeFileSync(join(trayDir, name), encodePng(size, size, render(size, trayScene(size, color))))
  }

  console.log(`icons generated: ${appSizes.length} png, icon.icns, icon.ico, ${trayVariants.length} tray`)
}

main()
