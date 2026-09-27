// SPDX-License-Identifier: GPL-3.0-only
// The drawing kit behind every generated image: a minimal PNG encoder
// over zlib, a supersampled scene renderer, and the waveform mark.
// Shared by scripts/gen-icons.js (app and tray icons) and site/build.js
// (the website's icons and preview image), so the mark is drawn once.
// Pure Node, no dependencies, deterministic.
const zlib = require('node:zlib')

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
 * Render a width x height RGBA buffer by 4x4 supersampling scene(x, y),
 * which returns [r, g, b, a] per sample point in pixel coordinates.
 */
function renderRect(width, height, scene) {
  const SS = 4
  const out = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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
      const i = (y * width + x) * 4
      out[i] = a > 0 ? Math.round(r / a) : 0
      out[i + 1] = a > 0 ? Math.round(g / a) : 0
      out[i + 2] = a > 0 ? Math.round(b / a) : 0
      out[i + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

/** A square size x size render (every icon). */
function render(size, scene) {
  return renderRect(size, size, scene)
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
function appIconScene(s, ink, amber) {
  const inset = 0.05 * s
  const radius = 0.22 * s
  const bars = makeBars(s, 0.21 * s, 0.075 * s, 0.055 * s)
  return (px, py) => {
    if (bars(px, py)) return [...amber, 1]
    if (insideRoundedRect(px, py, s / 2, s / 2, s / 2 - inset, s / 2 - inset, radius)) {
      return [...ink, 1]
    }
    return [0, 0, 0, 0]
  }
}

module.exports = { encodePng, render, renderRect, insideRoundedRect, makeBars, BAR_HEIGHTS, appIconScene }
