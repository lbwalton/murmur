// SPDX-License-Identifier: GPL-3.0-only
// The brush (US-073): one seeded paint engine for every renderer. A
// stroke is a bundle of bristles dragged along a path; each bristle
// carries its own load of paint, runs dry toward the tail in streaks,
// and wobbles a little. Splatter is a spray of drops thrown off a point.
// Everything is seeded, so the same seed paints the same mark every
// time and no painted image ever needs to live in the repo.

export type Rgb = [number, number, number]

/** A tiny seeded random generator (mulberry32). */
export function mulberry(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 1D value noise in [0, 1], seeded. */
export function noise1(seed: number): (x: number) => number {
  const r = mulberry(seed)
  const v = new Float32Array(256)
  for (let i = 0; i < 256; i++) v[i] = r()
  return (x) => {
    const i = Math.floor(x)
    const f = x - i
    const u = f * f * (3 - 2 * f)
    const a = v[i & 255]
    return a + (v[(i + 1) & 255] - a) * u
  }
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3)
/** Fast start, long settle: the flick of a brush. */
export const flickEase = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t))

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const rgba = (c: Rgb, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

/** Parses a CSS color in hex or rgb()/rgba() form; null if neither. */
export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v)
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null
}

/** A design token as a color, so no color lives in this file. */
export function tokenColor(name: string, fallback: Rgb): Rgb {
  if (typeof document === 'undefined') return fallback
  return parseColor(getComputedStyle(document.documentElement).getPropertyValue(name)) ?? fallback
}

export interface PathPoint {
  x: number
  y: number
  /** Arc length from the start, in pixels. */
  s: number
  /** Unit normal. */
  nx: number
  ny: number
}
export type BrushPath = PathPoint[] & { total: number }

function catmullRom(pts: ReadonlyArray<readonly [number, number]>, per: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[Math.max(k - 1, 0)]
    const p1 = pts[k]
    const p2 = pts[k + 1]
    const p3 = pts[Math.min(k + 2, pts.length - 1)]
    for (let j = 0; j < per; j++) {
      const u = j / per
      const u2 = u * u
      const u3 = u2 * u
      const at = (i: 0 | 1): number =>
        0.5 *
        (2 * p1[i] +
          (-p0[i] + p2[i]) * u +
          (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 +
          (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3)
      out.push([at(0), at(1)])
    }
  }
  const last = pts[pts.length - 1]
  out.push([last[0], last[1]])
  return out
}

/**
 * A path through the given points, smoothed (unless raw) and resampled
 * every `step` pixels, with normals and arc length. Raw keeps sharp
 * turns and retraces, which letterforms need.
 */
export function path(pts: ReadonlyArray<readonly [number, number]>, step = 2, raw = false): BrushPath {
  const dense = raw || pts.length <= 2 ? pts.map((p) => [p[0], p[1]] as [number, number]) : catmullRom(pts, 28)
  const lens = [0]
  for (let i = 1; i < dense.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
  }
  const total = lens[lens.length - 1]
  const n = Math.max(2, Math.ceil(total / step) + 1)
  const out = [] as unknown as BrushPath
  let j = 1
  for (let i = 0; i < n; i++) {
    const s = (total * i) / (n - 1)
    while (j < lens.length - 1 && lens[j] < s) j++
    const seg = lens[j] - lens[j - 1] || 1
    const t = clamp((s - lens[j - 1]) / seg, 0, 1)
    out.push({ x: lerp(dense[j - 1][0], dense[j][0], t), y: lerp(dense[j - 1][1], dense[j][1], t), s, nx: 0, ny: 0 })
  }
  for (let i = 0; i < n; i++) {
    const a = out[Math.max(0, i - 1)]
    const b = out[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy) || 1
    out[i].nx = -dy / d
    out[i].ny = dx / d
  }
  out.total = total
  return out
}

export interface Bristle {
  /** Position across the stroke, -1 to 1. */
  off: number
  w: number
  a: number
  /** How much paint it carries; low loads run dry sooner. */
  load: number
  tone: number
  nz: (x: number) => number
  /** Streak length in pixels. */
  lam: number
  jit: number
}

/** A brush of n bristles, spread evenly across its width. */
export function brush(seed: number, n = 30): Bristle[] {
  const r = mulberry(seed * 7919 + 13)
  const out: Bristle[] = []
  for (let i = 0; i < n; i++) {
    const off = ((i + r()) / n) * 2 - 1
    out.push({
      off,
      w: 0.55 + r() * 0.9,
      a: 0.4 + r() * 0.55,
      load: (0.78 + r() * 0.6) * (1 - off * off * 0.45),
      tone: r() * 2 - 1,
      nz: noise1(seed * 131 + i * 17),
      lam: 28 + r() * 120,
      jit: r()
    })
  }
  return out
}

const brushCache = new Map<string, Bristle[]>()
/** A cached brush. Callers keep seeds to a small set so this stays small. */
export function cachedBrush(seed: number, n: number): Bristle[] {
  const key = `${seed}:${n}`
  let b = brushCache.get(key)
  if (!b) {
    if (brushCache.size > 512) brushCache.clear()
    b = brush(seed, n)
    brushCache.set(key, b)
  }
  return b
}

/** Press in quickly, lift off slowly. */
export function pressure(t: number, ts = 0.07, te = 0.3): number {
  let p = 1
  if (t < ts) p = 0.35 + 0.65 * easeOut(t / ts)
  if (t > 1 - te) p *= 1 - 0.72 * Math.pow((t - (1 - te)) / te, 1.4)
  return p
}

export interface StrokeOptions {
  width: number
  rgb: Rgb
  /** 0 is wet and solid, 1 runs dry fast. */
  dry?: number
  alpha?: number
  /** Opacity of the wet body under the bristles; defaults from dryness. */
  core?: number
  noCore?: boolean
  /** Attack and lift fractions for the default pressure. */
  ts?: number
  te?: number
  /** A custom pressure along the stroke, 0 to 1 in, 0 to 1 out. */
  pfn?: (t: number) => number
  /** Paint only these point indices (incremental or partial strokes). */
  i0?: number
  i1?: number
  /** Shifts the bristle texture along the path, so a scrolling stroke keeps its pattern. */
  sOff?: number
  light?: number
  dark?: number
}

/** Paints bristles along P. */
export function stroke(ctx: CanvasRenderingContext2D, P: BrushPath, B: readonly Bristle[], o: StrokeOptions): void {
  const n = P.length
  const W = o.width
  const dry = o.dry ?? 0.4
  const A = o.alpha ?? 1
  const ts = o.ts ?? 0.07
  const te = o.te ?? 0.3
  const i0 = o.i0 ?? 0
  const i1 = o.i1 ?? n - 1
  if (i1 <= i0 || A <= 0) return
  const pf = o.pfn ?? ((t: number) => pressure(t, ts, te))
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'
  const core = o.core ?? 0.5 * (1 - dry)
  if (core > 0 && !o.noCore) {
    ctx.fillStyle = rgba(o.rgb, core * A)
    ctx.beginPath()
    for (let i = i0; i <= i1; i++) {
      const p = P[i]
      const h = W * 0.3 * pf(i / (n - 1))
      if (i === i0) ctx.moveTo(p.x + p.nx * h, p.y + p.ny * h)
      else ctx.lineTo(p.x + p.nx * h, p.y + p.ny * h)
    }
    for (let i = i1; i >= i0; i--) {
      const p = P[i]
      const h = W * 0.3 * pf(i / (n - 1))
      ctx.lineTo(p.x - p.nx * h, p.y - p.ny * h)
    }
    ctx.closePath()
    ctx.fill()
  }
  const light = o.light ?? 0.07
  const dark = o.dark ?? 0.22
  const sOff = o.sOff ?? 0
  const unit = (W * 2.4) / Math.max(1, B.length)
  const cap = 2.2 + W * 0.012
  const white: Rgb = [255, 255, 255]
  const black: Rgb = [0, 0, 0]
  for (const b of B) {
    const col = b.tone > 0 ? mix(o.rgb, white, b.tone * light) : mix(o.rgb, black, -b.tone * dark)
    ctx.strokeStyle = rgba(col, b.a * A)
    ctx.lineWidth = Math.max(0.5, Math.min(b.w * unit, cap))
    ctx.beginPath()
    let pen = false
    for (let i = i0; i <= i1; i++) {
      const pt = P[i]
      const t = i / (n - 1)
      const ink = b.load * 1.1 - Math.pow(t, 1.6) * dry * 1.35 + (1 - dry) * 0.2
      if (b.nz((pt.s + sOff) / b.lam) < ink) {
        const off = b.off * W * 0.5 * pf(t) + (b.nz((pt.s + sOff) / 90 + 40) - 0.5) * Math.min(W, 36) * 0.18 * b.jit
        const x = pt.x + pt.nx * off
        const y = pt.y + pt.ny * off
        if (pen) ctx.lineTo(x, y)
        else {
          ctx.moveTo(x, y)
          pen = true
        }
      } else pen = false
    }
    ctx.stroke()
  }
}

export interface Drop {
  x: number
  y: number
  r: number
  ang: number
  /** Elongation along the throw. */
  el: number
  /** Launch delay, 0 to 1 of the flight. */
  dl: number
  blob?: boolean
  seed?: number
}
export interface Splat {
  x: number
  y: number
  drops: Drop[]
}
export interface SplatOptions {
  r?: number
  count?: number
  mist?: number
  /** Throw direction in radians; omit for an even burst. */
  dir?: number | null
  spread?: number
  reach?: number
  blob?: boolean
}

/** A spray of drops thrown from (x, y). */
export function splat(seed: number, x: number, y: number, o: SplatOptions = {}): Splat {
  const r = mulberry(seed * 977 + 3)
  const R = o.r ?? 24
  const n = Math.round(o.count ?? 22)
  const dir = o.dir ?? null
  const spr = o.spread ?? 1.1
  const reach = o.reach ?? 2.8
  const drops: Drop[] = []
  if (o.blob) drops.push({ x, y, r: R * 0.42, ang: 0, el: 1, dl: 0, blob: true, seed: seed + 1 })
  for (let i = 0; i < n; i++) {
    const g = ((r() + r() + r()) / 3) * 2 - 1
    const ang = dir === null ? r() * Math.PI * 2 : dir + g * spr
    const f = Math.pow(r(), 0.65)
    const dist = R * (0.35 + f * reach)
    const size = Math.max(0.6, R * 0.17 * (1.15 - f) * (0.45 + r() * 0.9))
    const el = dir === null ? 1 + r() * 0.5 : 1 + f * 2.2 * r()
    drops.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, r: size, ang, el, dl: f * 0.35 + r() * 0.08 })
  }
  const mist = Math.round(o.mist ?? n)
  for (let i = 0; i < mist; i++) {
    const g = ((r() + r()) / 2) * 2 - 1
    const ang = dir === null ? r() * Math.PI * 2 : dir + g * spr * 1.3
    const f = 0.3 + r() * 0.9
    const dist = R * (0.5 + f * reach * 1.1)
    drops.push({ x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist, r: 0.35 + r() * 0.9, ang, el: 1, dl: clamp(f * 0.4, 0, 0.6) })
  }
  return { x, y, drops }
}

/** Draws a splat with its drops k of the way through their flight. */
export function drawSplat(ctx: CanvasRenderingContext2D, sp: Splat, rgb: Rgb, k = 1, alpha = 1): void {
  ctx.fillStyle = rgba(rgb, alpha)
  ctx.lineCap = 'round'
  for (const d of sp.drops) {
    const l = clamp((k - d.dl) / (1 - d.dl), 0, 1)
    if (l <= 0) continue
    const e = flickEase(l)
    const x = lerp(sp.x, d.x, e)
    const y = lerp(sp.y, d.y, e)
    if (l < 1 && !d.blob) {
      const e2 = flickEase(Math.max(0, l - 0.18))
      ctx.strokeStyle = rgba(rgb, alpha * 0.5)
      ctx.lineWidth = d.r * 0.9
      ctx.beginPath()
      ctx.moveTo(lerp(sp.x, d.x, e2), lerp(sp.y, d.y, e2))
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.beginPath()
    if (d.blob) {
      const nz = noise1(d.seed ?? 1)
      const R = d.r * e
      for (let i = 0; i <= 22; i++) {
        const a = (i / 22) * Math.PI * 2
        const rr = R * (0.72 + nz(i * 0.9) * 0.5)
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      ctx.closePath()
    } else ctx.ellipse(x, y, d.r * d.el * (0.7 + 0.3 * l), d.r * (0.7 + 0.3 * l), d.ang, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** One mark in a painted scene: a stroke, a splat, or a dot. */
export interface SceneItem {
  start?: number
  dur?: number
  stroke?: { P: BrushPath; B: readonly Bristle[]; opts: StrokeOptions }
  splat?: { sp: Splat; rgb: Rgb; alpha?: number }
  dot?: { x: number; y: number; r: number; rgb: Rgb }
}

/**
 * The stacking order of a scene: by the time each mark starts, ties
 * kept in list order. Animated and static painting both use it, so a
 * mark never jumps above or below another when an animation settles.
 */
export function stackOrder(items: readonly SceneItem[]): number[] {
  return items
    .map((it, i) => ({ i, t: it.start ?? 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((u) => u.i)
}

/** Paints a scene's finished state in stacking order. */
export function paintScene(ctx: CanvasRenderingContext2D, items: readonly SceneItem[]): void {
  for (const i of stackOrder(items)) {
    const it = items[i]
    if (it.stroke) stroke(ctx, it.stroke.P, it.stroke.B, it.stroke.opts)
    if (it.splat) drawSplat(ctx, it.splat.sp, it.splat.rgb, 1, it.splat.alpha ?? 1)
    if (it.dot) {
      ctx.fillStyle = rgba(it.dot.rgb)
      ctx.beginPath()
      ctx.arc(it.dot.x, it.dot.y, it.dot.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
