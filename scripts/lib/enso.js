// SPDX-License-Identifier: GPL-3.0-only
// The ensō pill (US-075): murmur's mark, the pill drawn as one open loop
// of the brush with the amber live dot inside, so the logo and the app's
// signature are the same shape. One geometry for every place the mark
// appears: brushed by the app's own brush engine at 64 px and up (app
// icons, the link preview), and a clean drawn line at 32 px and below
// (tray, small icons, the favicon, the site header), where brushwork
// turns to mud. Pure Node; deterministic.
const { stripTypeScriptTypes } = (() => {
  try {
    return require('node:module')
  } catch {
    return {}
  }
})()
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

/**
 * The loop: a superellipse (exponent 2.5) a = 0.36 S wide and b = 0.19 S
 * tall around (cx, cy), drawn from just left of the bottom, all the way
 * round, to the bottom center, so it stays open there like an ensō.
 * The dot sits inside on the left. Width is the brushed stroke's.
 */
function ensoGeometry(S, cx = S / 2, cy = S / 2) {
  const a = S * 0.36
  const b = S * 0.19
  const ex = 2.5
  const a0 = Math.PI * 0.64
  const a1 = Math.PI * 2.5
  const pts = []
  for (let i = 0; i <= 30; i++) {
    const th = a0 + ((a1 - a0) * i) / 30
    const co = Math.cos(th)
    const si = Math.sin(th)
    pts.push([cx + a * Math.sign(co) * Math.pow(Math.abs(co), 2 / ex), cy + b * Math.sign(si) * Math.pow(Math.abs(si), 2 / ex)])
  }
  return { pts, dot: { x: cx - a * 0.56, y: cy, r: S * 0.04 }, width: S * 0.062 }
}

/** Distance from (px, py) to the open polyline. */
function polylineDistance(pts, px, py) {
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const dx = x1 - x0
    const dy = y1 - y0
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t))
    if (d < best) best = d
  }
  return best
}

/**
 * The clean drawn mark as a scene for draw.js render(): the loop as a
 * round-capped line and the dot, over an optional background function.
 * line sets the loop's width as a share of S (thicker on tiny icons so it
 * stays a line, not a hairline).
 */
function cleanEnsoScene(S, colors, options = {}) {
  const g = ensoGeometry(S, options.cx, options.cy)
  const half = Math.max(0.7, (options.line ?? 0.08) * S) / 2
  const dotR = Math.max(1.1, g.dot.r * (options.dotScale ?? 1.75))
  const bg = options.background ?? (() => [0, 0, 0, 0])
  return (px, py) => {
    if (Math.hypot(px - g.dot.x, py - g.dot.y) <= dotR) return [...colors.dot, 1]
    if (polylineDistance(g.pts, px, py) <= half) return [...colors.loop, 1]
    return bg(px, py)
  }
}

/** The clean mark as SVG markup (favicon, site header), viewBox S. */
function ensoSvgParts(S, colors, options = {}) {
  const g = ensoGeometry(S)
  const width = Math.max(1.4, (options.line ?? 0.08) * S)
  const d = g.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')
  const dotR = Math.max(1.1, g.dot.r * (options.dotScale ?? 1.75))
  const loop = colors.loopClass
    ? `<path class="${colors.loopClass}" d="${d}" />`
    : `<path d="${d}" fill="none" stroke="${colors.loop}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`
  const dot = colors.dotClass
    ? `<circle class="${colors.dotClass}" cx="${g.dot.x.toFixed(2)}" cy="${g.dot.y.toFixed(2)}" r="${dotR.toFixed(2)}" />`
    : `<circle cx="${g.dot.x.toFixed(2)}" cy="${g.dot.y.toFixed(2)}" r="${dotR.toFixed(2)}" fill="${colors.dot}"/>`
  return { loop, dot, width }
}

let brushModule = null

/**
 * The app's brush engine (src/renderer/brush.ts) as a module, its types
 * stripped by Node itself (22.13 or later). Null on an older Node, and
 * the caller falls back to the clean mark at every size.
 */
async function loadBrush() {
  if (brushModule) return brushModule
  if (typeof stripTypeScriptTypes !== 'function') return null
  const source = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'brush.ts'), 'utf8')
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
  brushModule = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  return brushModule
}

/** Below this size the splat's drops clump into a blot; leave it off. */
const SPLAT_FROM = 128

/**
 * Paints the brushed mark onto a 2D context (the raster canvas, or a real
 * one) with the brush engine: the loop in one pull, an ember splat where
 * the brush first lands (from 128 px up), and the amber dot, stacked in
 * start order.
 */
function paintBrushedEnso(brush, ctx, S, colors, cx = S / 2, cy = S / 2) {
  const g = ensoGeometry(S, cx, cy)
  const items = [
    {
      start: 0,
      dur: 820,
      stroke: {
        P: brush.path(g.pts, Math.max(1, S / 160)),
        B: brush.cachedBrush(61, Math.max(12, Math.min(110, Math.round(g.width / 1.6)))),
        opts: { width: g.width, rgb: colors.loop, dry: 0.5, core: 0.3, ts: 0.05, te: 0.34 }
      }
    },
    ...(S >= SPLAT_FROM
      ? [
          {
            start: 60,
            splat: {
              sp: brush.splat(63, g.pts[0][0], g.pts[0][1], { r: S * 0.04, count: 10, mist: 12, dir: 2.0, spread: 0.7, reach: 2.2 }),
              rgb: colors.splat
            }
          }
        ]
      : []),
    { start: 760, dur: 380, dot: { x: g.dot.x, y: g.dot.y, r: g.dot.r, rgb: colors.dot } }
  ]
  brush.paintScene(ctx, items)
}

module.exports = { ensoGeometry, cleanEnsoScene, ensoSvgParts, loadBrush, paintBrushedEnso, polylineDistance }
