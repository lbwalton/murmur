// SPDX-License-Identifier: GPL-3.0-only
// The brushwork hero (US-079). Paint gathers around a live pill once,
// on load, then holds still; then it is the visitor's turn to paint,
// and Make my poster saves their painting with the murmur mark. Every
// mark comes from the app's own brush engine (src/renderer/brush.ts,
// stripped of its types into brush.js at build time), so the site and
// the app paint the same way. Nothing here asks for the microphone and
// nothing leaves the browser.
import {
  animateScene,
  cachedBrush,
  clamp,
  drawSplat,
  easeOut,
  flickEase,
  lerp,
  mix,
  mulberry,
  noise1,
  paintScene,
  path,
  rgba,
  splat,
  stroke,
  tokenColor
} from './brush.js'

const $ = (q) => document.querySelector(q)
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
const TAU = Math.PI * 2

// Colors come from tokens.css and paint.css; the fallbacks only matter
// if a stylesheet failed to load.
const C = {}
function readColors() {
  C.ink = tokenColor('--ink', [15, 14, 17])
  C.panel = tokenColor('--panel', [23, 22, 27])
  C.text = tokenColor('--text', [236, 233, 228])
  C.dim = tokenColor('--text-dim', [154, 150, 143])
  C.gold = tokenColor('--brand', [217, 164, 65])
  C.amber = tokenColor('--amber', [240, 164, 75])
  C.smoke = tokenColor('--smoke', [58, 60, 68])
  C.rice = tokenColor('--rice', [233, 227, 214])
  C.ember = tokenColor('--ember', [232, 88, 43])
  C.blue = tokenColor('--belt-blue', [91, 130, 217])
  C.purple = tokenColor('--belt-purple', [154, 111, 217])
  // Deeper and paler smoke for depth, mixed from the tokens.
  C.smokeDeep = mix(C.smoke, C.ink, 0.45)
  C.ash = mix(C.smoke, C.text, 0.28)
}

// ------------------------------------------------------------ canvas ---

function fit(canvas, w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (w == null) {
    const r = canvas.getBoundingClientRect()
    w = r.width
    h = r.height
  }
  w = Math.max(1, w)
  h = Math.max(1, h)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas, ctx, w, h, dpr }
}

function clear(L) {
  L.ctx.save()
  L.ctx.setTransform(1, 0, 0, 1, 0, 0)
  L.ctx.clearRect(0, 0, L.canvas.width, L.canvas.height)
  L.ctx.restore()
}

// One frame loop for everything that moves here.
const tasks = new Set()
let raf = 0
function addTask(fn) {
  tasks.add(fn)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => tasks.delete(fn)
}
function loop(now) {
  raf = 0
  for (const fn of [...tasks]) {
    let keep = false
    try {
      keep = fn(now)
    } catch (error) {
      console.error(error)
    }
    if (!keep) tasks.delete(fn)
  }
  if (tasks.size) raf = requestAnimationFrame(loop)
}

// ------------------------------------------------------------- marks ---

/** A brush stroke through pts, with an optional splat off its end. */
function strokeItem(o) {
  const P = path(o.pts, o.step || 2.2)
  const seed = o.seed || 1
  const item = {
    start: o.start || 0,
    dur: o.dur || 500,
    stroke: {
      P,
      B: cachedBrush(seed, o.bristles || clamp(Math.round(o.width / 1.6), 12, 110)),
      opts: { width: o.width, rgb: o.rgb, alpha: o.alpha, dry: o.dry, core: o.core, ts: o.ts, te: o.te }
    }
  }
  if (o.splat) {
    const e = P[P.length - 1]
    const q = P[Math.max(0, P.length - 7)]
    item.splat = {
      sp: splat(seed + 7, e.x, e.y, {
        r: o.splat.r,
        count: o.splat.count,
        mist: o.splat.count * 0.8,
        dir: Math.atan2(e.y - q.y, e.x - q.x),
        spread: o.splat.spread ?? 0.8,
        reach: o.splat.reach
      }),
      rgb: o.splat.rgb || o.rgb
    }
  }
  return item
}

function splatItem(seed, x, y, rgb, so, start) {
  return { start, splat: { sp: splat(seed, x, y, so), rgb } }
}

/** The ensō pill: the pill drawn as one open loop of the brush, the
 *  live dot inside. Brushed only at sizes above 32 px. */
function ensoItems(S, ox = 0, oy = 0, onPaper = false) {
  const cx = ox + S / 2
  const cy = oy + S / 2
  const a = S * 0.36
  const b = S * 0.19
  const ex = 2.5
  const pts = []
  const a0 = Math.PI * 0.64
  const a1 = Math.PI * 2.5
  for (let i = 0; i <= 30; i++) {
    const th = lerp(a0, a1, i / 30)
    const co = Math.cos(th)
    const si = Math.sin(th)
    pts.push([cx + a * Math.sign(co) * Math.pow(Math.abs(co), 2 / ex), cy + b * Math.sign(si) * Math.pow(Math.abs(si), 2 / ex)])
  }
  return [
    strokeItem({ pts, width: S * 0.062, rgb: onPaper ? C.ink : C.rice, dry: 0.5, core: 0.3, seed: 61, start: 0, dur: 820, ts: 0.05, te: 0.34, step: Math.max(1, S / 160) }),
    { start: 760, dur: 380, dot: { x: cx - a * 0.56, y: cy, r: S * 0.04, rgb: C.amber } },
    splatItem(63, pts[0][0], pts[0][1], C.ember, { r: S * 0.04, count: 10, mist: 12, dir: 2.0, spread: 0.7, reach: 2.2 }, 60)
  ]
}

/** The clean drawn mark for 32 px and below: no bristles. */
function drawCleanMark(ctx, S) {
  ctx.strokeStyle = rgba(C.rice)
  ctx.lineWidth = Math.max(1.4, S * 0.08)
  ctx.beginPath()
  ctx.roundRect(S * 0.14, S * 0.31, S * 0.72, S * 0.38, S * 0.19)
  ctx.stroke()
  ctx.fillStyle = rgba(C.amber)
  ctx.beginPath()
  ctx.arc(S * 0.33, S * 0.5, S * 0.07, 0, TAU)
  ctx.fill()
}

// -------------------------------------------------------------- hero ---

const hero = { el: null, B: null, F: null, st: null, cancel: null }
// The hero's words and controls: the starting painting stays clear of
// them, and the visitor's brush is clipped around them.
const KEEP_CLEAR = ['#heroCopy', '#holdBtn', '#holdHint', '#yourTurn']

/** The painting around the stage: a ring of ember behind the pill,
 *  smoke streaks, a few chalky rice strokes, a gold accent, splatter.
 *  Seeded, so every visitor starts from the same layout of marks. A
 *  mark that would sit behind words or controls is left out. */
function heroPlan(w, h, st, keeps) {
  const r = mulberry(9002)
  const S = []
  const { cx, cy, R } = st
  const copy = keeps[0]
  const hits = (x, y, pad) => keeps.some((k) => x > k.x - pad && x < k.x + k.w + pad && y > k.y - pad && y < k.y + k.h + pad)
  // Whether any part of a mark would sit behind words or controls.
  const touches = (it) =>
    (it.stroke && it.stroke.P.some((q) => hits(q.x, q.y, it.stroke.opts.width * 0.55 + 6))) ||
    (it.splat && it.splat.sp.drops.some((d) => hits(d.x, d.y, d.r * d.el + 4)))
  {
    // The ring tightens until it clears the words; on a narrow screen
    // it flattens under the copy above it.
    const stacked = copy.y + copy.h < cy - R * 0.4
    const vy = stacked ? clamp((cy - (copy.y + copy.h) - 14) / (R * 1.15), 0.55, 0.9) : 0.9
    let ring = null
    for (const k of [1, 0.93, 0.86, 0.79, 0.72]) {
      const pts = []
      for (let i = 0; i <= 12; i++) {
        const a = lerp(Math.PI * 0.8, Math.PI * 2.1, i / 12)
        const rr = R * (1.1 + 0.05 * Math.sin(i * 1.7))
        pts.push([cx + Math.cos(a) * rr * 1.08 * k, cy + Math.sin(a) * rr * vy])
      }
      ring = strokeItem({ pts, width: Math.max(14, R * 0.15), rgb: C.ember, alpha: 0.94, dry: 0.58, seed: 31, start: 420, dur: 950, te: 0.4, splat: { r: R * 0.09, count: 26, spread: 0.6, rgb: C.ember } })
      if (!touches(ring)) break
    }
    if (ring && !touches(ring)) S.push(ring)
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * TAU
    const rho = R * (0.5 + r() * 1.05)
    const sx = cx + Math.cos(a) * rho * 1.25
    const sy = cy + Math.sin(a) * rho * 0.85
    const dir = (r() < 0.72 ? -0.42 : 0.55) + (r() - 0.5) * 0.7 + (r() < 0.5 ? Math.PI : 0)
    const len = Math.min(w * 0.6, R * (1.0 + r() * 1.7))
    const bend = (r() - 0.5) * 0.55
    const pts = []
    for (let j = 0; j <= 3; j++) {
      const f = j / 3 - 0.5
      const off = Math.sin((f + 0.5) * Math.PI) * bend * len * 0.3
      pts.push([sx + Math.cos(dir) * len * f - Math.sin(dir) * off, sy + Math.sin(dir) * len * f + Math.cos(dir) * off])
    }
    const pick = r()
    const rgb = pick < 0.36 ? C.smokeDeep : pick < 0.82 ? C.smoke : C.ash
    // Every draw from r() happens before the check, so dropping a mark
    // never reshuffles the ones after it.
    const smoke = strokeItem({ pts, width: R * (0.07 + r() * 0.2), rgb, alpha: 0.62 + r() * 0.32, dry: 0.3 + r() * 0.45, seed: 100 + i, start: i * 85, dur: 420 + r() * 380 })
    if (!touches(smoke)) S.push(smoke)
  }
  for (let i = 0, tries = 0; i < 2 && tries < 60; tries++) {
    const a = r() * TAU
    const rho = R * (0.75 + r() * 0.7)
    const sx = cx + Math.cos(a) * rho * 1.2
    const sy = cy + Math.sin(a) * rho * 0.85
    const dir = -0.38 + (r() - 0.5) * 0.6 + (r() < 0.5 ? Math.PI : 0)
    const len = R * (0.8 + r() * 0.9)
    const pts = [
      [sx - (Math.cos(dir) * len) / 2, sy - (Math.sin(dir) * len) / 2],
      [sx, sy + (r() - 0.5) * 20],
      [sx + (Math.cos(dir) * len) / 2, sy + (Math.sin(dir) * len) / 2]
    ]
    if (pts.some((p) => p[0] < -40 || p[0] > w + 40)) continue
    const chalk = strokeItem({ pts, width: R * (0.025 + r() * 0.04), rgb: C.rice, alpha: 0.55 + r() * 0.3, dry: 0.74, core: 0, seed: 300 + i, start: 760 + i * 140, dur: 520 })
    if (touches(chalk)) continue
    S.push(chalk)
    i++
  }
  {
    const sx = cx + R * 0.95
    const sy = cy - R * 0.95
    const accent = strokeItem({ pts: [[sx - R * 0.35, sy + R * 0.2], [sx, sy], [sx + R * 0.3, sy - R * 0.25]], width: R * 0.03, rgb: C.gold, alpha: 0.9, dry: 0.55, seed: 410, start: 1320, dur: 300, splat: { r: R * 0.035, count: 10, spread: 0.5, rgb: C.gold } })
    if (!touches(accent)) S.push(accent)
  }
  for (let i = 0, tries = 0; i < 3 && tries < 60; tries++) {
    const a = r() * TAU
    const rho = R * (1.0 + r() * 0.55)
    const x = cx + Math.cos(a) * rho * 1.2
    const y = cy + Math.sin(a) * rho * 0.9
    if (x < 0 || x > w || y < 0 || y > h) continue
    const spl = splatItem(500 + i, x, y, r() < 0.8 ? C.ember : C.rice, { r: R * (0.05 + r() * 0.08), count: 18 + r() * 16, mist: 20, dir: r() < 0.5 ? null : a, spread: 0.9, blob: r() < 0.5 }, 900 + i * 120)
    if (touches(spl)) continue
    S.push(spl)
    i++
  }
  return S
}

function layoutHero(animate) {
  const hr = hero.el.getBoundingClientRect()
  hero.B = fit($('#heroPaint'), hr.width, hr.height)
  hero.F = fit($('#heroFx'), hr.width, hr.height)
  const win = $('#win').getBoundingClientRect()
  const pill = $('#heroPill').getBoundingClientRect()
  const top = win.top - hr.top
  const bottom = pill.bottom - hr.top
  const left = Math.min(win.left, pill.left) - hr.left
  const right = Math.max(win.right, pill.right) - hr.left
  const st = { cx: (left + right) / 2, cy: (top + bottom) / 2, R: Math.max(right - left, bottom - top) * 0.55 }
  // Paint keeps clear of everything a person reads or uses.
  const keeps = KEEP_CLEAR.map((q) => $(q))
    .filter((el) => el && !el.hidden)
    .map((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left - hr.left, y: b.top - hr.top, w: b.width, h: b.height }
    })
  if (hero.cancel) hero.cancel()
  hero.cancel = null
  clear(hero.B)
  clear(hero.F)
  hero.st = st
  const items = heroPlan(hr.width, hr.height, st, keeps)
  resizeYou(hr.width, hr.height)
  if (animate && !RM) {
    hero.cancel = animateScene({ canvas: hero.B.canvas, ctx: hero.B.ctx, dpr: hero.B.dpr }, { canvas: hero.F.canvas, ctx: hero.F.ctx, dpr: hero.F.dpr }, items, {
      onDone: () => {
        hero.cancel = null
        yourTurnReady()
      }
    })
  } else {
    // Reduced motion, or a resize: the finished painting, at once.
    paintScene(hero.B.ctx, items)
    yourTurnReady()
  }
}

// -------------------------------------------------- your turn: paint ---

const you = { ready: false, on: true, color: null, strokes: [], cur: null, L: null, dry: null, w: 0, h: 0, endTimer: 0, touch: false, flying: [] }
const MAX_STROKES = 400

/** Paints, then wipes everything that must stay clear (padded), so no
 *  brush, splat, or flick is left on words or controls. Wiping each
 *  box works where boxes overlap; a single even-odd clip would not. */
function clipped(ctx, draw) {
  draw()
  const hr = hero.el.getBoundingClientRect()
  const pad = 10
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = rgba(C.ink)
  for (const q of [...KEEP_CLEAR, '#win', '#heroPill']) {
    const el = $(q)
    if (!el || el.hidden) continue
    const b = el.getBoundingClientRect()
    ctx.fillRect(b.left - hr.left - pad, b.top - hr.top - pad, b.width + pad * 2, b.height + pad * 2)
  }
  ctx.restore()
}

const palette = () => [
  ['ember', C.ember],
  ['gold', C.gold],
  ['rice paper', C.rice],
  ['smoke', C.ash],
  ['blue belt', C.blue],
  ['purple belt', C.purple]
]

function resizeYou(w, h) {
  const ow = you.w
  const oh = you.h
  you.L = fit($('#heroUser'), w, h)
  // Finished strokes dry on a canvas of their own, so lifting the pen
  // adds one stroke instead of repainting them all.
  you.dry = fit(document.createElement('canvas'), w, h)
  if (ow && oh && (ow !== w || oh !== h)) {
    for (const s of you.strokes) {
      s.pts = s.pts.map(([x, y]) => [(x * w) / ow, (y * h) / oh])
      if (s.sp) s.sp = splat(s.seed + 1, s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1], s.spOpts)
    }
  }
  you.w = w
  you.h = h
  repaintYou(true)
}

const userOpts = (s, W, extra) => Object.assign({ width: W, rgb: s.rgb, dry: 0.38, core: 0.3, ts: 0, te: 0 }, extra)

// The whole stroke at once, its pressure following the widths it was drawn with.
function paintWhole(ctx, s) {
  if (s.pts.length < 2) return
  const P = path(s.pts, 2, true)
  const W = Math.max(...s.ws)
  const wAt = (u) => {
    const x = u * (s.ws.length - 1)
    const i = Math.floor(x)
    return lerp(s.ws[i], s.ws[Math.min(i + 1, s.ws.length - 1)], x - i)
  }
  stroke(ctx, P, cachedBrush(s.seed, 22), userOpts(s, W, { pfn: (u) => (wAt(u) / W) * (0.35 + 0.65 * Math.min(1, (u * P.total) / 24)) }))
  if (s.sp && !s.flying) drawSplat(ctx, s.sp, s.rgb, 1)
}

// Live strokes go down in pieces on the live canvas; once a stroke ends
// it is painted whole onto the dry canvas and the live canvas is
// replaced by it, so the seams between the pieces disappear. A full
// repaint happens only on a resize or a clear.
function repaintYou(all = false, add = null) {
  if (!you.L || !you.dry) return
  if (all) {
    clear(you.dry)
    clipped(you.dry.ctx, () => {
      for (const s of you.strokes) paintWhole(you.dry.ctx, s)
    })
  } else if (add) clipped(you.dry.ctx, () => paintWhole(you.dry.ctx, add))
  clear(you.L)
  you.L.ctx.save()
  you.L.ctx.setTransform(1, 0, 0, 1, 0, 0)
  you.L.ctx.drawImage(you.dry.canvas, 0, 0)
  you.L.ctx.restore()
}

function penMove(x, y, t) {
  let c = you.cur
  if (!c) {
    // Seeds cycle through a small set so the brush cache stays small.
    c = you.cur = { pts: [[x, y]], ws: [12], rgb: you.color, seed: 5000 + (you.strokes.length % 48), len: 0, last: t, drawn: 0, w: 12, speed: 0 }
    return
  }
  const [px, py] = c.pts[c.pts.length - 1]
  const d = Math.hypot(x - px, y - py)
  if (d < 2.5) return
  const speed = d / Math.max(1, t - c.last)
  c.speed = lerp(c.speed, speed, 0.4)
  // A fast brush is thin and dry; a slow one lays down a fat stroke.
  c.w = lerp(c.w, clamp(30 - c.speed * 12, 6, 30), 0.25)
  c.pts.push([x, y])
  c.ws.push(c.w)
  c.last = t
  // Paint the new piece, with one point before it so the bristles bend smoothly.
  const from = Math.max(0, c.drawn - 1)
  const seg = c.pts.slice(from)
  const P = path(seg, 2, true)
  const skip = c.drawn > 0 ? Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) : 0
  const step = P.total / (P.length - 1 || 1)
  const i0 = Math.min(P.length - 2, Math.round(skip / (step || 1)))
  const sOff = c.len - skip
  clipped(you.L.ctx, () =>
    stroke(you.L.ctx, P, cachedBrush(c.seed, 22), userOpts(c, c.w, { i0, sOff, pfn: (u) => 0.35 + 0.65 * Math.min(1, (sOff + u * P.total) / 24) }))
  )
  c.len += P.total - skip
  c.drawn = c.pts.length - 1
}

function penUp() {
  const c = you.cur
  you.cur = null
  if (!c || c.pts.length < 3) return
  // A quick flick throws paint off the end of the brush.
  if (c.speed > 1.1) {
    const n = c.pts.length
    const [ax, ay] = c.pts[Math.max(0, n - 4)]
    const [bx, by] = c.pts[n - 1]
    c.spOpts = { r: c.w * 0.9, count: 8 + c.speed * 6, mist: 10, dir: Math.atan2(by - ay, bx - ax), spread: 0.5, reach: 3 }
    c.sp = splat(c.seed + 1, bx, by, c.spOpts)
    if (!RM) {
      c.flying = true
      you.flying.push({ c, t0: performance.now() })
      if (you.flying.length === 1) addTask(flyTick)
    }
  }
  you.strokes.push(c)
  // The record keeps enough strokes to repaint after a resize; older
  // ones stay on the dry canvas until the next resize.
  if (you.strokes.length > MAX_STROKES) you.strokes.shift()
  repaintYou(false, c)
}

// Every flick in the air on one fx canvas, so two at once never wipe
// each other; each lands on the dry canvas when its flight ends.
function flyTick(now) {
  const F = hero.F
  clear(F)
  you.flying = you.flying.filter(({ c, t0 }) => {
    const k = clamp((now - t0) / 380, 0, 1)
    if (k < 1) {
      clipped(F.ctx, () => drawSplat(F.ctx, c.sp, c.rgb, k))
      return true
    }
    c.flying = false
    // The landed drops go onto both canvases as they are, so a stroke
    // being drawn right now is never wiped by a repaint.
    if (you.strokes.includes(c)) {
      for (const L of [you.dry, you.L]) clipped(L.ctx, () => drawSplat(L.ctx, c.sp, c.rgb, 1))
    }
    return false
  })
  return you.flying.length > 0
}

function syncPainting() {
  const toggle = $('#ytToggle')
  // The label names what a press does; no pressed state on top of it.
  toggle.textContent = you.touch ? 'Paint' : you.on ? 'Pause painting' : 'Paint'
  hero.el.classList.toggle('painting', you.ready && you.on && !you.touch)
  hero.el.classList.toggle('touch-paint', you.ready && you.on && you.touch)
}

function yourTurnReady() {
  if (you.ready) return
  you.ready = true
  $('#yourTurn').classList.add('ready')
  syncPainting()
}

// The color rows (the hero bar and the phone sheet) share one choice.
const colorRows = []
function buildColorRow(box) {
  colorRows.push(box)
  palette().forEach(([name, rgb], i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-label', name)
    b.title = name
    b.setAttribute('aria-checked', String(i === 0))
    b.tabIndex = i === 0 ? 0 : -1
    b.style.background = rgba(rgb)
    b.addEventListener('click', () => {
      you.color = rgb
      for (const row of colorRows) {
        ;[...row.children].forEach((x, k) => {
          x.setAttribute('aria-checked', String(k === i))
          x.tabIndex = k === i ? 0 : -1
        })
      }
    })
    box.appendChild(b)
  })
  box.addEventListener('keydown', (e) => {
    const kids = [...box.children]
    const at = kids.findIndex((x) => x.getAttribute('aria-checked') === 'true')
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const nx = kids[(at + d + kids.length) % kids.length]
    nx.click()
    nx.focus()
  })
}

function setupYourTurn() {
  you.touch = matchMedia('(hover: none)').matches
  if (you.touch) {
    you.on = false
    $('#ytLabel').textContent = 'Your turn. Tap Paint to paint your own poster.'
  }
  buildColorRow($('#ytColors'))
  buildColorRow($('#sheetColors'))
  if (you.touch) $('#ytToggle').setAttribute('aria-haspopup', 'dialog')
  you.color = palette()[0][1]
  $('#ytToggle').addEventListener('click', () => {
    // A phone paints on a sheet of its own; the hero there is all words.
    if (you.touch) {
      openSheet()
      return
    }
    you.on = !you.on
    penUp()
    syncPainting()
  })
  setupSheet()
  syncPainting()
  $('#ytClear').addEventListener('click', () => {
    you.strokes = []
    you.cur = null
    repaintYou(true)
    clearSheet()
  })
  // Never paint over the words or the controls.
  const blocked = (el) => el && el.closest && el.closest('a, button, input, video, .hero-copy, .win, .pill, .hint, .yourturn')
  let down = false
  hero.el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') down = true
  })
  const lift = () => {
    if (down) {
      down = false
      penUp()
    }
  }
  addEventListener('pointerup', lift)
  addEventListener('pointercancel', lift)
  // A fast hand moves far between two samples; a stroke that would jump
  // across the words or the controls ends at their edge instead.
  const keepOut = ['#heroCopy', '#win', '#heroPill', '#holdBtn', '#holdHint', '#yourTurn']
  const crosses = (r, ax, ay, bx, by) => {
    const boxes = keepOut.map((q) => $(q)).filter((el) => el && !el.hidden).map((el) => el.getBoundingClientRect())
    for (let k = 1; k <= 8; k++) {
      const x = r.left + lerp(ax, bx, k / 8)
      const y = r.top + lerp(ay, by, k / 8)
      if (boxes.some((b) => x > b.left - 6 && x < b.right + 6 && y > b.top - 6 && y < b.bottom + 6)) return true
    }
    return false
  }
  hero.el.addEventListener('pointermove', (e) => {
    if (!you.ready || !you.on) return
    if (e.pointerType !== 'mouse' && !down) return
    if (blocked(e.target)) {
      penUp()
      return
    }
    const r = hero.el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const last = you.cur && you.cur.pts[you.cur.pts.length - 1]
    if (last && crosses(r, last[0], last[1], x, y)) penUp()
    penMove(x, y, e.timeStamp)
    clearTimeout(you.endTimer)
    you.endTimer = setTimeout(penUp, 220)
  })
  hero.el.addEventListener('pointerleave', () => penUp())
  $('#ytPoster').addEventListener('click', () => void makePoster())
  $('#posterClose').addEventListener('click', closePoster)
  $('#posterSave').addEventListener('click', () => void savePoster())
  // A native modal dialog: the page behind it is inert, Escape closes
  // it, and a click on the dimmed backdrop closes it too.
  const dialog = $('#posterModal')
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closePoster()
  })
  dialog.addEventListener('close', () => {
    if (poster.back && poster.back.focus) poster.back.focus()
  })
}

// ------------------------------------------------------------ poster ---

/** The hero's painting cropped 4:5 around the stage, drawn W by H. */
function drawHeroCrop(ctx, W, H, layers) {
  const hw = you.w
  const hh = you.h
  const st = hero.st || { cx: hw / 2, cy: hh / 2 }
  let ch = hh
  let cw = hh * 0.8
  if (cw > hw) {
    cw = hw
    ch = hw * 1.25
  }
  const sx = clamp(st.cx - cw / 2, 0, Math.max(0, hw - cw))
  const sy = clamp(st.cy - ch / 2, 0, Math.max(0, hh - ch))
  const dpr = you.L.dpr
  for (const q of layers) ctx.drawImage($(q), sx * dpr, sy * dpr, cw * dpr, ch * dpr, 0, 0, W, H * (ch / (cw * 1.25)))
}

// ------------------------------------------------------ phone sheet ---

const sheet = { L: null, dry: null, bg: null, w: 0, strokes: [], cur: null, used: false, back: null }

function fitSheet() {
  // A stroke in progress ends before the canvas changes size.
  sheetUp()
  // 16 px of gutter each side, and 2 px for the canvas border.
  const w = Math.floor(Math.max(160, Math.min(innerWidth - 34, (innerHeight - 190) * 0.8)))
  const ow = sheet.w
  sheet.w = w
  const cv = $('#sheetCanvas')
  cv.style.width = `${w}px`
  cv.style.height = `${w * 1.25}px`
  sheet.L = fit(cv, w, w * 1.25)
  sheet.dry = fit(document.createElement('canvas'), w, w * 1.25)
  // The picture under the strokes is cropped once, the first time the
  // sheet opens, and only scaled after that, so a rotation (which
  // re-plans the hero's painting) never swaps it under the visitor.
  const old = sheet.bg
  sheet.bg = fit(document.createElement('canvas'), w, w * 1.25)
  if (old) sheet.bg.ctx.drawImage(old.canvas, 0, 0, w, w * 1.25)
  else {
    sheet.bg.ctx.fillStyle = rgba(C.ink)
    sheet.bg.ctx.fillRect(0, 0, w, w * 1.25)
    drawHeroCrop(sheet.bg.ctx, w, w * 1.25, ['#heroPaint'])
  }
  // A rotated phone keeps the strokes where they were on the picture.
  if (ow && ow !== w) {
    const k = w / ow
    for (const s of sheet.strokes) {
      s.pts = s.pts.map(([x, y]) => [x * k, y * k])
      s.ws = s.ws.map((v) => v * k)
      if (s.sp) s.sp = splat(s.seed + 1, s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1], { ...s.spOpts, r: s.spOpts.r * k })
    }
  }
  repaintSheet(true)
}

function repaintSheet(all = false, add = null) {
  const draw = (L) => {
    L.ctx.save()
    L.ctx.setTransform(1, 0, 0, 1, 0, 0)
    L.ctx.drawImage(sheet.bg.canvas, 0, 0)
    L.ctx.restore()
  }
  if (all) {
    clear(sheet.dry)
    draw(sheet.dry)
    for (const s of sheet.strokes) paintWhole(sheet.dry.ctx, s)
  } else if (add) paintWhole(sheet.dry.ctx, add)
  clear(sheet.L)
  sheet.L.ctx.save()
  sheet.L.ctx.setTransform(1, 0, 0, 1, 0, 0)
  sheet.L.ctx.drawImage(sheet.dry.canvas, 0, 0)
  sheet.L.ctx.restore()
}

function sheetMove(x, y, t) {
  let c = sheet.cur
  if (!c) {
    c = sheet.cur = { pts: [[x, y]], ws: [12], rgb: you.color, seed: 6000 + (sheet.strokes.length % 48), len: 0, last: t, drawn: 0, w: 12, speed: 0 }
    return
  }
  const [px, py] = c.pts[c.pts.length - 1]
  const d = Math.hypot(x - px, y - py)
  if (d < 2.5) return
  c.speed = lerp(c.speed, d / Math.max(1, t - c.last), 0.4)
  c.w = lerp(c.w, clamp(26 - c.speed * 10, 5, 26), 0.25)
  c.pts.push([x, y])
  c.ws.push(c.w)
  c.last = t
  const from = Math.max(0, c.drawn - 1)
  const seg = c.pts.slice(from)
  const P = path(seg, 2, true)
  const skip = c.drawn > 0 ? Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) : 0
  const step = P.total / (P.length - 1 || 1)
  const i0 = Math.min(P.length - 2, Math.round(skip / (step || 1)))
  const sOff = c.len - skip
  stroke(sheet.L.ctx, P, cachedBrush(c.seed, 22), userOpts(c, c.w, { i0, sOff, pfn: (u) => 0.35 + 0.65 * Math.min(1, (sOff + u * P.total) / 24) }))
  c.len += P.total - skip
  c.drawn = c.pts.length - 1
}

function sheetUp() {
  const c = sheet.cur
  sheet.cur = null
  if (!c || c.pts.length < 3) return
  // A quick flick throws paint off the end of the finger, as on a desktop.
  if (c.speed > 1.1) {
    const n = c.pts.length
    const [ax, ay] = c.pts[Math.max(0, n - 4)]
    const [bx, by] = c.pts[n - 1]
    c.spOpts = { r: c.w * 0.9, count: 8 + c.speed * 6, mist: 10, dir: Math.atan2(by - ay, bx - ax), spread: 0.5, reach: 3 }
    c.sp = splat(c.seed + 1, bx, by, c.spOpts)
  }
  sheet.strokes.push(c)
  if (sheet.strokes.length > MAX_STROKES) sheet.strokes.shift()
  sheet.used = true
  repaintSheet(false, c)
}

function clearSheet() {
  sheet.strokes = []
  sheet.cur = null
  sheet.used = false
  if (sheet.L) repaintSheet(true)
}

function openSheet() {
  const dialog = $('#paintSheet')
  if (dialog.open) return
  sheet.back = document.activeElement
  dialog.showModal()
  document.documentElement.style.overflow = 'hidden'
  fitSheet()
}

function setupSheet() {
  const dialog = $('#paintSheet')
  const cv = $('#sheetCanvas')
  // One finger paints; a second finger or a resting palm is ignored, so
  // nothing is ever drawn between two touches.
  let pid = null
  const at = (e) => {
    const r = cv.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  cv.addEventListener('pointerdown', (e) => {
    if (pid !== null) return
    pid = e.pointerId
    cv.setPointerCapture(e.pointerId)
    sheetMove(...at(e), e.timeStamp)
  })
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return
    // Every sample since the last frame, so a fast finger draws a curve.
    const all = e.getCoalescedEvents ? e.getCoalescedEvents() : []
    for (const c of all.length ? all : [e]) sheetMove(...at(c), c.timeStamp)
  })
  const lift = (e) => {
    if (e.pointerId !== pid) return
    pid = null
    sheetUp()
  }
  cv.addEventListener('pointerup', lift)
  cv.addEventListener('pointercancel', lift)
  cv.addEventListener('lostpointercapture', lift)
  $('#sheetClear').addEventListener('click', clearSheet)
  $('#sheetDone').addEventListener('click', () => dialog.close())
  $('#sheetPoster').addEventListener('click', () => void makePoster())
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = ''
    if (sheet.back && sheet.back.focus) sheet.back.focus()
  })
  addEventListener('resize', () => {
    if (dialog.open) fitSheet()
  })
}

const poster = { blob: null, url: '', back: null }

/** A 4:5 poster: the hero painting around the pill, the visitor's
 *  strokes on top, and the ensō pill lockup with the date. */
async function makePoster() {
  penUp()
  try {
    await document.fonts.load("800 92px 'Bricolage Grotesque'")
  } catch {
    // The fallback face still makes a poster.
  }
  const W = 1080
  const H = 1350
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  ctx.fillStyle = rgba(C.ink)
  ctx.fillRect(0, 0, W, H)
  if (sheet.used) ctx.drawImage(sheet.dry.canvas, 0, 0, W, H)
  else drawHeroCrop(ctx, W, H, ['#heroPaint', '#heroUser'])
  const g = ctx.createLinearGradient(0, H * 0.62, 0, H)
  g.addColorStop(0, rgba(C.ink, 0))
  g.addColorStop(1, rgba(C.ink, 0.92))
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.6, W, H * 0.4)
  const S = 150
  const mx = 64
  paintScene(ctx, ensoItems(S, mx - S * 0.12, H - 64 - S * 0.62 - S * 0.5 + 8))
  ctx.textAlign = 'left'
  ctx.fillStyle = rgba(C.rice)
  if ('fontStretch' in ctx) ctx.fontStretch = 'condensed'
  ctx.font = "800 92px 'Bricolage Grotesque', 'Arial Narrow', sans-serif"
  ctx.fillText('murmur', mx + S * 0.92, H - 104)
  if ('fontStretch' in ctx) ctx.fontStretch = 'normal'
  ctx.fillStyle = rgba(C.dim)
  ctx.font = '400 30px system-ui, sans-serif'
  ctx.fillText('Hold a key. Speak.', mx + S * 0.92, H - 62)
  ctx.textAlign = 'right'
  ctx.font = '22px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText(new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }), W - 56, 72)
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'))
  if (!blob) return
  if (poster.url) URL.revokeObjectURL(poster.url)
  poster.blob = blob
  poster.url = URL.createObjectURL(blob)
  $('#posterImg').src = poster.url
  // A phone shares; a desktop saves the file.
  $('#posterSave').textContent = canShareFile() ? 'Share poster' : 'Save poster'
  poster.back = $('#paintSheet').open ? $('#sheetPoster') : document.activeElement
  $('#posterModal').showModal()
  $('#posterSave').focus()
}

function posterFile() {
  return new File([poster.blob], 'murmur-poster.png', { type: 'image/png' })
}

function canShareFile() {
  try {
    return you.touch && !!navigator.canShare && navigator.canShare({ files: [posterFile()] })
  } catch {
    return false
  }
}

async function savePoster() {
  if (!poster.blob) return
  if (canShareFile()) {
    try {
      await navigator.share({ files: [posterFile()], title: 'My murmur poster' })
      return
    } catch (error) {
      // A closed share sheet is the visitor's choice; anything else falls
      // through to a plain download.
      if (error && error.name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = poster.url
  a.download = 'murmur-poster.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function closePoster() {
  const dialog = $('#posterModal')
  if (dialog.open) dialog.close()
}

// ---------------------------------------------------- the live pill ---

// A made-up voice: syllables, words, and the odd breath.
const vn1 = noise1(501)
const vn2 = noise1(502)
const vn3 = noise1(503)
function voice(t) {
  const syl = Math.pow(Math.max(0, Math.sin(t * TAU * 3.4 + vn1(t * 1.7) * 3)), 0.8)
  const word = vn2(t * 2.6)
  const breath = vn3(t * 0.8) > 0.84 ? 0.1 : 1
  return clamp((0.2 + 0.8 * syl) * (0.3 + 0.7 * word) * breath, 0, 1)
}

const PUSH_MS = 66

/** The ink dabs waveform, the style a white belt earns in the app:
 *  wet amber while live, drying to gold, sinking flat when the words
 *  land, a dry grey scrape for no speech. */
class Dabs {
  constructor(canvas) {
    this.c = canvas
    this.N = 21
    this.seed = 1
    this.mode = 'idle'
    this.modeAt = 0
    this.lastPush = 0
    this.cols = Array.from({ length: this.N }, () => ({ lv: 0, seed: this.seed++, born: -1e9 }))
    this.resize()
  }
  resize() {
    const r = this.c.getBoundingClientRect()
    this.L = fit(this.c, r.width, r.height)
    this.gap = this.L.w / this.N
  }
  setMode(m, now) {
    this.snap = this.cols.map((c) => this.wet(c, now))
    this.mode = m
    this.modeAt = now
    if (m === 'idle' || m === 'rec') for (const c of this.cols) Object.assign(c, { lv: 0, born: -1e9 })
  }
  push(lv, now) {
    this.cols.shift()
    this.cols.push({ lv, seed: this.seed++, born: now })
    this.lastPush = now
  }
  wet(c, now) {
    const age = now - c.born
    return age < 260 ? C.amber : mix(C.amber, C.gold, clamp((age - 260) / 900, 0, 1))
  }
  draw(now) {
    const { ctx, w, h } = this.L
    ctx.clearRect(0, 0, w, h)
    const cy = h / 2
    const maxH = h * 0.94
    const gap = this.gap
    const mt = now - this.modeAt
    const phase = this.mode === 'rec' ? clamp((now - this.lastPush) / PUSH_MS, 0, 1) : 0
    for (let i = 0; i < this.N; i++) {
      const c = this.cols[i]
      let lv = c.lv
      let rgb = C.text
      let A = 1
      let dry = 0.32
      if (this.mode === 'rec') {
        rgb = this.wet(c, now)
        if (lv < 0.05) {
          rgb = C.text
          A = 0.3
        }
      } else if (this.mode === 'proc') {
        rgb = mix((this.snap && this.snap[i]) || C.gold, C.gold, easeOut(clamp(mt / 600, 0, 1)))
        const sweep = (mt / 700) * 1.5 - i / this.N
        A = 0.72 + 0.28 * Math.exp(-Math.pow(sweep * 5, 2))
        if (lv < 0.05) {
          rgb = C.text
          A = 0.3
        }
      } else if (this.mode === 'ins') {
        const k = easeOut(clamp(mt / 420, 0, 1))
        rgb = C.gold
        lv = lerp(lv, 0.05, k)
        A = 1 - 0.55 * k
      } else if (this.mode === 'nospeech') {
        rgb = C.ash
        lv = 0.05 + 0.08 * Math.abs(Math.sin(i * 1.3))
        dry = 0.95
        A = 0.9
      } else {
        lv = 0.05
        A = 0.32
      }
      const hh = Math.max(3, 3 + lv * (maxH - 3))
      const x = (i + 0.5 - phase) * gap
      if (x < 1 || x > w - 1) continue
      const tilt = (((c.seed * 37) % 7) - 3) * 0.22
      const P = path([[x + tilt, cy + hh / 2], [x - tilt, cy - hh / 2]], 1.3)
      stroke(ctx, P, cachedBrush(c.seed % 64, 9), { width: gap * 0.7, rgb, alpha: A, dry, ts: 0.18, te: 0.3, core: 0.35 })
    }
  }
}

const PHRASES = [
  'Running ten minutes late, start without me.',
  'Can you send the deck before the call tomorrow?',
  'Love the new intro. Ship it.',
  'Pick up limes and the good hot sauce on the way.'
]
const dict = { phase: 'idle', t0: 0, n: 0, interacted: false }
let dabs = null
let stageFx = null

const fmt = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const setPhase = (p) => ($('#heroPill').dataset.phase = p)
// What a screen reader hears: the demo's moments, never the ticking timer.
const say = (text) => ($('#heroSay').textContent = text)

function startRec() {
  if (dict.phase !== 'idle') return
  const now = performance.now()
  dict.phase = 'rec'
  dict.t0 = now
  setPhase('recording')
  say('Recording')
  $('#holdBtn').setAttribute('aria-pressed', 'true')
  dabs.setMode('rec', now)
  let next = now
  addTask((t) => {
    if (dict.phase !== 'rec') return false
    while (t >= next) {
      dabs.push(voice((next - dict.t0) / 1000), next)
      next += PUSH_MS
    }
    $('#heroStatus').textContent = fmt(t - dict.t0)
    dabs.draw(t)
    return true
  })
}

function stopRec() {
  if (dict.phase !== 'rec') return
  const now = performance.now()
  const dur = now - dict.t0
  $('#holdBtn').setAttribute('aria-pressed', 'false')
  if (dur < 420) {
    dict.phase = 'busy'
    setPhase('nospeech')
    dabs.setMode('nospeech', now)
    dabs.draw(now)
    $('#heroStatus').textContent = 'no speech'
    say('No speech. Hold a little longer.')
    setTimeout(resetPill, 1400)
    return
  }
  dict.phase = 'busy'
  setPhase('processing')
  dabs.setMode('proc', now)
  addTask((t) => {
    dabs.draw(t)
    return t - now < 640
  })
  setTimeout(() => land(dur), 640)
}

function resetPill() {
  dict.phase = 'idle'
  setPhase('idle')
  $('#heroStatus').textContent = ''
  const now = performance.now()
  dabs.setMode('idle', now)
  dabs.draw(now)
}

function insertWords(text) {
  const body = $('#winBody')
  const landed = $('#landed')
  const add = () => {
    text.split(' ').forEach((word, i) => {
      landed.appendChild(document.createTextNode(' '))
      const s = document.createElement('span')
      s.className = 'w'
      s.textContent = word
      s.style.animationDelay = RM ? '0s' : `${i * 42}ms`
      landed.appendChild(s)
    })
  }
  add()
  // The message box never grows (a growing box would move the stage
  // under its painting): a take that would overflow starts a fresh
  // message instead.
  if (body.scrollHeight > body.clientHeight + 1) {
    $('#seedText').textContent = ''
    landed.textContent = ''
    add()
  }
}

function land(dur) {
  const now = performance.now()
  const text = PHRASES[dict.n++ % PHRASES.length]
  const wpm = clamp(Math.round(text.split(' ').length / (dur / 60000)), 118, 176)
  setPhase('inserted')
  dabs.setMode('ins', now)
  $('#heroStatus').textContent = `${wpm} wpm`
  say(`Inserted: ${text}`)
  addTask((t) => {
    dabs.draw(t)
    return t - now < 460
  })
  if (RM) {
    insertWords(text)
    setTimeout(resetPill, 1800)
    return
  }
  const sr = $('#stage').getBoundingClientRect()
  stageFx = fit($('#stageFx'), sr.width, sr.height)
  const wr = $('#heroWave').getBoundingClientRect()
  const cr = $('#caret').getBoundingClientRect()
  const from = { x: wr.right - sr.left - 6, y: wr.top - sr.top + wr.height / 2 }
  const to = { x: cr.left - sr.left, y: cr.top - sr.top + cr.height * 0.55 }
  throwPaint(stageFx, from, to, 7 + dict.n, 18, () => insertWords(text))
  setTimeout(resetPill, 2200)
}

// Paint thrown along an arc from the pill to the cursor; it lands as
// words, and the stains fade.
function throwPaint(L, from, to, seed, n, onLand) {
  const r = mulberry(seed * 31 + 5)
  const g = () => ((r() + r() + r()) / 3) * 2 - 1
  const drops = Array.from({ length: n }, () => {
    const far = r() < 0.15
    return { tx: to.x + 4 + g() * (far ? 26 : 7), ty: to.y + g() * (far ? 10 : 4), r: 0.9 + r() * (far ? 1.1 : 2.2), dl: r() * 0.28, lift: 40 + r() * 50 }
  })
  const t0 = performance.now()
  const FLY = 460
  const FADE = 380
  let landed = false
  addTask((now) => {
    const t = now - t0
    clear(L)
    const { ctx } = L
    for (const d of drops) {
      const l = clamp((t / FLY - d.dl) / (1 - d.dl), 0, 1)
      if (l <= 0) continue
      const e = flickEase(l)
      const cx = (from.x + d.tx) / 2
      const cy = Math.min(from.y, d.ty) - d.lift
      const at = (u) => [(1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * cx + u * u * d.tx, (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * cy + u * u * d.ty]
      const [x, y] = at(e)
      const fade = t > FLY ? 1 - clamp((t - FLY) / FADE, 0, 1) : 1
      if (l < 1) {
        const [px, py] = at(Math.max(0, e - 0.14))
        ctx.strokeStyle = rgba(C.ember, 0.5)
        ctx.lineWidth = d.r
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      ctx.fillStyle = rgba(C.ember, 0.95 * fade)
      ctx.beginPath()
      ctx.ellipse(x, y, d.r * (l < 1 ? 1.4 : 1.1), d.r, 0, 0, TAU)
      ctx.fill()
    }
    if (!landed && t > FLY * 0.72) {
      landed = true
      onLand()
    }
    if (t > FLY + FADE + 260) {
      clear(L)
      return false
    }
    return true
  })
}

function setupPill() {
  dabs = new Dabs($('#heroWave'))
  dabs.draw(performance.now())
  const btn = $('#holdBtn')
  btn.hidden = false
  $('#holdHint').hidden = false
  if (matchMedia('(hover: none)').matches) {
    $('#holdHint').textContent = 'Press and hold the button. Nothing records: this demo never uses your microphone.'
  }
  btn.addEventListener('pointerdown', (e) => {
    dict.interacted = true
    btn.setPointerCapture(e.pointerId)
    startRec()
  })
  const up = () => stopRec()
  btn.addEventListener('pointerup', up)
  btn.addEventListener('pointercancel', up)
  btn.addEventListener('lostpointercapture', up)
  btn.addEventListener('contextmenu', (e) => e.preventDefault())
  // Enter on the focused button works too, for keyboards without a space bar.
  let enterHeld = false
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat) {
      dict.interacted = true
      enterHeld = true
      startRec()
    }
  })
  addEventListener('keyup', (e) => {
    if (e.key === 'Enter' && enterHeld) {
      enterHeld = false
      stopRec()
    }
  })
  let heroIn = true
  new IntersectionObserver((es) => es.forEach((e) => (heroIn = e.isIntersecting)), { threshold: 0.25 }).observe(hero.el)
  let spaceHeld = false
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return
    const ae = document.activeElement
    if (ae && ae !== document.body && ae !== btn) return
    if (!heroIn || $('#posterModal').open || $('#paintSheet').open) return
    e.preventDefault()
    dict.interacted = true
    spaceHeld = true
    startRec()
  })
  addEventListener('keyup', (e) => {
    if (e.code === 'Space' && spaceHeld) {
      e.preventDefault()
      spaceHeld = false
      stopRec()
    }
  })
  // A key released in another window never sends its keyup here; the
  // take ends when the page loses focus instead of recording forever.
  const letGo = () => {
    spaceHeld = false
    enterHeld = false
    stopRec()
  }
  addEventListener('blur', letGo)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) letGo()
  })
  // One unprompted take shows what the pill does, unless the visitor
  // got there first or prefers no motion.
  if (!RM) {
    setTimeout(() => {
      if (dict.interacted || dict.phase !== 'idle') return
      startRec()
      setTimeout(() => {
        if (!dict.interacted) stopRec()
      }, 2300)
    }, 1900)
  }
}

// ------------------------------------------------------------- boot ---

function paintMark() {
  const cv = $('#mark')
  if (!cv) return
  const L = fit(cv, 30, 30)
  drawCleanMark(L.ctx, 30)
}

function boot() {
  hero.el = $('#hero')
  if (!hero.el || !hero.el.getBoundingClientRect || !HTMLCanvasElement.prototype.getContext) return
  readColors()
  document.documentElement.classList.add('js-hero')
  paintMark()
  setupPill()
  setupYourTurn()
  layoutHero(true)
  // Whenever the hero changes size (a window resize, the display face
  // arriving late), the canvases are fitted again and the painting is
  // laid out anew, so paint never stretches and strokes land under the
  // cursor.
  let timer = 0
  new ResizeObserver(() => {
    const r = hero.el.getBoundingClientRect()
    if (Math.abs(r.width - hero.B.w) < 1 && Math.abs(r.height - hero.B.h) < 1) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      layoutHero(false)
      dabs.resize()
      dabs.draw(performance.now())
    }, 120)
  }).observe(hero.el)
  // The film's poster loads only when the film comes near.
  const video = document.querySelector('video[data-poster]')
  if (video) {
    new IntersectionObserver((entries, io) => {
      if (!entries.some((e) => e.isIntersecting)) return
      video.poster = video.dataset.poster
      io.disconnect()
    }, { rootMargin: '600px' }).observe(video)
  }
}

// The headline face first, so the paint knows where the words sit.
const fontsReady = document.fonts && document.fonts.load ? document.fonts.load("800 40px 'Bricolage Grotesque'") : Promise.resolve()
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1200))]).then(boot, boot)
