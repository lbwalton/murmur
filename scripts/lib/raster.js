// SPDX-License-Identifier: GPL-3.0-only
// A small software canvas for the icon generator (US-075): just the part
// of the 2D canvas API the brush engine (src/renderer/brush.ts) paints
// with, in pure JavaScript, so the brushed app icon is drawn by the same
// code as every other mark without a compiled canvas module. Paths are
// polylines; stroke() and fill() each build one coverage mask for the
// whole call (so overlaps inside one call never double up, as in a real
// canvas) and composite it source-over into a premultiplied buffer.
// Deterministic: plain arithmetic, the same bytes on every run.

/** Parses the colors the brush engine writes: rgba(), rgb(), #rrggbb. */
function parseColor(value) {
  const s = String(value).trim()
  const m = /^rgba?\(([^)]+)\)$/i.exec(s)
  if (m) {
    const p = m[1].split(',').map((x) => Number(x.trim()))
    return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1]
  }
  const h = /^#([0-9a-f]{6})$/i.exec(s)
  if (h) {
    const n = parseInt(h[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
  }
  return [0, 0, 0, 0]
}

const SS = 4 // vertical sub-scanlines per pixel when filling

class RasterContext {
  constructor(width, height) {
    this.width = width
    this.height = height
    // Premultiplied RGBA, 0 to 1.
    this.data = new Float32Array(width * height * 4)
    this.fillStyle = '#000000'
    this.strokeStyle = '#000000'
    this.lineWidth = 1
    this.lineCap = 'butt'
    this.lineJoin = 'miter'
    this.globalAlpha = 1
    this.globalCompositeOperation = 'source-over'
    this.m = [1, 0, 0, 1, 0, 0]
    this.stack = []
    this.subpaths = []
    this.current = null
  }

  // ------------------------------------------------------------ state ---

  save() {
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      m: [...this.m]
    })
  }

  restore() {
    const s = this.stack.pop()
    if (s) Object.assign(this, s)
  }

  setTransform(a, b, c, d, e, f) {
    this.m = [a, b, c, d, e, f]
  }

  scale(x, y) {
    const [a, b, c, d, e, f] = this.m
    this.m = [a * x, b * x, c * y, d * y, e, f]
  }

  translate(x, y) {
    const [a, b, c, d, e, f] = this.m
    this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]
  }

  tx(x, y) {
    const [a, b, c, d, e, f] = this.m
    return [a * x + c * y + e, b * x + d * y + f]
  }

  /** How much the transform scales lengths (uniform scales only). */
  unit() {
    const [a, b, c, d] = this.m
    return Math.sqrt(Math.abs(a * d - b * c))
  }

  // ------------------------------------------------------------- path ---

  beginPath() {
    this.subpaths = []
    this.current = null
  }

  moveTo(x, y) {
    this.current = { pts: [this.tx(x, y)], closed: false }
    this.subpaths.push(this.current)
  }

  lineTo(x, y) {
    if (!this.current) {
      this.moveTo(x, y)
      return
    }
    this.current.pts.push(this.tx(x, y))
  }

  closePath() {
    if (this.current) this.current.closed = true
  }

  ellipse(x, y, rx, ry, rotation, start, end, ccw = false) {
    // The canvas rule: a sweep of a full turn or more draws the whole
    // ellipse; otherwise it runs the short way round in the asked direction.
    const TAU = Math.PI * 2
    let sweep = end - start
    if (!ccw) sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU
    else sweep = -sweep >= TAU ? -TAU : -((((-sweep) % TAU) + TAU) % TAU)
    const r = Math.max(rx, ry) * this.unit()
    const n = Math.max(8, Math.min(256, Math.ceil(Math.abs(sweep) * Math.max(4, r) * 0.6)))
    const cr = Math.cos(rotation)
    const sr = Math.sin(rotation)
    for (let i = 0; i <= n; i++) {
      const t = start + (sweep * i) / n
      const ex = Math.cos(t) * rx
      const ey = Math.sin(t) * ry
      const px = x + ex * cr - ey * sr
      const py = y + ex * sr + ey * cr
      if (i === 0 && !this.current) this.moveTo(px, py)
      else this.lineTo(px, py)
    }
  }

  arc(x, y, r, start, end, ccw = false) {
    this.ellipse(x, y, r, r, 0, start, end, ccw)
  }

  // ---------------------------------------------------------- drawing ---

  /** Composites a coverage mask (bbox-local) in one color, source-over. */
  composite(mask, x0, y0, w, h, color) {
    const [r, g, b, a0] = parseColor(color)
    const alpha = a0 * this.globalAlpha
    if (alpha <= 0) return
    const out = this.data
    const erase = this.globalCompositeOperation === 'destination-out'
    for (let y = 0; y < h; y++) {
      const py = y0 + y
      if (py < 0 || py >= this.height) continue
      for (let x = 0; x < w; x++) {
        const px = x0 + x
        if (px < 0 || px >= this.width) continue
        const cov = mask[y * w + x]
        if (cov <= 0) continue
        const sa = Math.min(1, cov) * alpha
        const i = (py * this.width + px) * 4
        if (erase) {
          const k = 1 - sa
          out[i] *= k
          out[i + 1] *= k
          out[i + 2] *= k
          out[i + 3] *= k
          continue
        }
        const k = 1 - sa
        out[i] = r * sa + out[i] * k
        out[i + 1] = g * sa + out[i + 1] * k
        out[i + 2] = b * sa + out[i + 2] * k
        out[i + 3] = sa + out[i + 3] * k
      }
    }
  }

  /** Strokes the path: every segment a capsule of the line width (round
   *  joins), the path's own ends flat for butt caps, merged into one mask
   *  by maximum coverage, then composited once. A line thinner than a
   *  pixel is drawn a pixel wide at its true share of coverage, as a
   *  canvas does. */
  stroke() {
    const width = this.lineWidth * this.unit()
    const half = Math.max(0.5, width / 2)
    const weight = Math.min(1, width)
    const butt = this.lineCap !== 'round'
    const segs = []
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const sp of this.subpaths) {
      const pts = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts
      if (pts.length === 1 && !butt) segs.push([pts[0], pts[0], false, false])
      for (let i = 1; i < pts.length; i++) {
        // Flat ends only where an open path starts and stops.
        const first = butt && !sp.closed && i === 1
        const last = butt && !sp.closed && i === pts.length - 1
        segs.push([pts[i - 1], pts[i], first, last])
      }
    }
    for (const [p, q] of segs) {
      x0 = Math.min(x0, p[0], q[0])
      y0 = Math.min(y0, p[1], q[1])
      x1 = Math.max(x1, p[0], q[0])
      y1 = Math.max(y1, p[1], q[1])
    }
    if (!segs.length) return
    const bx = Math.floor(x0 - half - 1)
    const by = Math.floor(y0 - half - 1)
    const w = Math.ceil(x1 + half + 1) - bx + 1
    const h = Math.ceil(y1 + half + 1) - by + 1
    if (w <= 0 || h <= 0 || w * h > 64e6) return
    const mask = new Float32Array(w * h)
    for (const [p, q, flatStart, flatEnd] of segs) {
      const sx0 = Math.max(0, Math.floor(Math.min(p[0], q[0]) - half - 1) - bx)
      const sy0 = Math.max(0, Math.floor(Math.min(p[1], q[1]) - half - 1) - by)
      const sx1 = Math.min(w - 1, Math.ceil(Math.max(p[0], q[0]) + half + 1) - bx)
      const sy1 = Math.min(h - 1, Math.ceil(Math.max(p[1], q[1]) + half + 1) - by)
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const len2 = dx * dx + dy * dy
      for (let y = sy0; y <= sy1; y++) {
        const cy = by + y + 0.5
        for (let x = sx0; x <= sx1; x++) {
          const cx = bx + x + 0.5
          let t = len2 > 0 ? ((cx - p[0]) * dx + (cy - p[1]) * dy) / len2 : 0
          if ((flatStart && t < 0) || (flatEnd && t > 1)) continue
          t = t < 0 ? 0 : t > 1 ? 1 : t
          const ex = cx - (p[0] + dx * t)
          const ey = cy - (p[1] + dy * t)
          const cov = half + 0.5 - Math.sqrt(ex * ex + ey * ey)
          if (cov > 0) {
            const k = y * w + x
            const c = (cov > 1 ? 1 : cov) * weight
            if (c > mask[k]) mask[k] = c
          }
        }
      }
    }
    this.composite(mask, bx, by, w, h, this.strokeStyle)
  }

  /** Fills the path (nonzero winding), antialiased by sub-scanlines and
   *  fractional span ends, as one mask composited once. */
  fill() {
    const edges = []
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const sp of this.subpaths) {
      const pts = sp.pts
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const q = pts[(i + 1) % pts.length]
        x0 = Math.min(x0, p[0])
        y0 = Math.min(y0, p[1])
        x1 = Math.max(x1, p[0])
        y1 = Math.max(y1, p[1])
        if (p[1] !== q[1]) edges.push(p[1] < q[1] ? [p[0], p[1], q[0], q[1], 1] : [q[0], q[1], p[0], p[1], -1])
      }
    }
    if (!edges.length) return
    const bx = Math.floor(x0) - 1
    const by = Math.floor(y0) - 1
    const w = Math.ceil(x1) - bx + 2
    const h = Math.ceil(y1) - by + 2
    if (w <= 0 || h <= 0 || w * h > 64e6) return
    const mask = new Float32Array(w * h)
    edges.sort((a, b) => a[1] - b[1])
    const hits = []
    for (let row = 0; row < h * SS; row++) {
      const sy = by + (row + 0.5) / SS
      hits.length = 0
      for (const e of edges) {
        if (e[1] > sy) break
        if (e[3] <= sy) continue
        const t = (sy - e[1]) / (e[3] - e[1])
        hits.push([e[0] + (e[2] - e[0]) * t, e[4]])
      }
      if (hits.length < 2) continue
      hits.sort((a, b) => a[0] - b[0])
      let wind = 0
      const y = Math.floor(row / SS)
      for (let i = 0; i < hits.length - 1; i++) {
        wind += hits[i][1]
        if (wind === 0) continue
        const xa = hits[i][0] - bx
        const xb = hits[i + 1][0] - bx
        if (xb <= xa) continue
        // Spread this sub-row's span across the pixels it covers.
        const pa = Math.floor(xa)
        const pb = Math.floor(xb)
        for (let px = Math.max(0, pa); px <= Math.min(w - 1, pb); px++) {
          const cover = Math.min(px + 1, xb) - Math.max(px, xa)
          if (cover > 0) mask[y * w + px] += cover / SS
        }
      }
    }
    this.composite(mask, bx, by, w, h, this.fillStyle)
  }

  /** The buffer as 8-bit straight RGBA, for encodePng. */
  toRgba() {
    const out = Buffer.alloc(this.width * this.height * 4)
    const d = this.data
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]
      out[i] = a > 0 ? Math.round(Math.min(1, d[i] / a) * 255) : 0
      out[i + 1] = a > 0 ? Math.round(Math.min(1, d[i + 1] / a) * 255) : 0
      out[i + 2] = a > 0 ? Math.round(Math.min(1, d[i + 2] / a) * 255) : 0
      out[i + 3] = Math.round(Math.min(1, a) * 255)
    }
    return out
  }
}

module.exports = { RasterContext, parseColor }
