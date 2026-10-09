// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (US-098), painted. Each subject is a generator: from
// the day's seed, size, tier, and level it plans the painting as a list
// of gestures, one per take, in the order a painter would make them (the
// sky before the water, the stalk before its leaves, the far ridges
// before the near ones). Its layers share the size out by weight, so any
// subject fits any size, and the seed varies everything within a layer:
// how many stalks and where, the moon's place, the ridgelines. Higher
// tiers paint each gesture richer: washes under the big shapes from blue
// belt, splatter on the accents from purple, a second motif from brown,
// and the heaviest washes and splatter from black (LaBroi asked for
// heavier washes and splatter at the higher belts, 2026-10-08). Levels
// add a bird or two. A change to a generator repaints the past too, since
// a day keeps only its seed. Drawn only by code: landscapes, plants, and
// marks, never figures.
import { type Rgb, cachedBrush, clamp, drawSplat, mix, mulberry, path, rgba, splat, stroke } from '../brush'
import { type PaintingRecord, SUBJECT_NAMES, type SubjectId } from '../../shared/painting'
import { formatDuration } from '../../shared/time'
import { type Gesture, type Mark, type Pt, type Tone, SIGNATURES, SIGNATURE_WORDS, TAU, allocate, clusterFor } from './paintKit'
import { LAYERS } from './paintSubjects'

/** The margin a painting keeps inside its frame, as a share of each side. */
const MAT_SHARE = 0.05

export { allocate, clusterFor } from './paintKit'
export type { Gesture, Mark, Tone } from './paintKit'

/**
 * The painting's plan: one gesture per stroke of its size, in order, then
 * one more for each take past it (up to MAX_EXTRA), each made by the
 * subject from that take's word count, so it keeps growing the scene.
 */
export function planPainting(record: Pick<PaintingRecord, 'subject' | 'seed' | 'target' | 'tier' | 'level'>, extras: readonly number[] = []): Gesture[] {
  const rng = mulberry(record.seed)
  const rnd = (a: number, b: number): number => a + (b - a) * rng()
  const tier = clamp(record.tier, 0, 4)
  const c = clusterFor(tier)
  const wash = (pts: Pt[], w: number): Mark => ({
    kind: 'stroke',
    pts,
    w: w * (1.5 + tier * 0.3),
    tone: 'wash',
    dry: 0.92,
    alpha: 0.09 + tier * 0.05
  })
  const spatter = (x: number, y: number, tone: Tone = 'accent'): Mark[] =>
    tier >= 2 ? [{ kind: 'splat', x, y, r: 0.008 + tier * 0.004, dir: rng() * TAU, tone, count: 4 + (tier - 2) * 6 }] : []
  const subject = LAYERS[record.subject]({ rng, rnd, tier, c, wash, spatter, target: record.target })
  const layers = subject.layers
  const counts = allocate(record.target, layers)
  const plan = layers.flatMap((layer, i) => (counts[i] > 0 ? layer.make(counts[i]) : [])).map((g) => g.map(settle))
  // Levels add birds to the last stroke: one at level two, two from three.
  const birds = Math.min(2, Math.max(0, record.level - 1))
  if (plan.length > 0 && birds > 0) {
    for (let b = 0; b < birds; b++) {
      const x = rnd(0.12, 0.45)
      const y = rnd(0.08, 0.22)
      const s = rnd(0.012, 0.018)
      plan[plan.length - 1].push({
        kind: 'stroke',
        pts: [
          [x - s, y - s * 0.4],
          [x, y + s * 0.25],
          [x + s, y - s * 0.5]
        ],
        w: 0.0035,
        tone: 'ink',
        dry: 0.3,
        bird: true
      })
    }
  }
  // Past its size, each take grows the scene on the subject's schedule.
  // Each has its own random stream, so a later take never moves an earlier
  // stroke; a long take earns a signature mark, up to SIGNATURES a day.
  let signatures = 0
  extras.slice(0, MAX_EXTRA).forEach((words, i) => {
    const r = mulberry((record.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)
    const signature = words >= SIGNATURE_WORDS && signatures < SIGNATURES
    if (signature) signatures += 1
    const s = 0.85 + 0.4 * Math.min(1, Math.max(0, words) / 120)
    plan.push(subject.grow({ i, words, signature, r, s }).map(settle))
  })
  return plan
}

/** Points at or past these lines are anchored to the frame's edge: the
 *  sides, and the ground along the bottom (stalks and reeds rise from it). */
const EDGE_LO = 0.005
const EDGE_HI = 0.995
const GROUND = 0.985
/** How far an anchored point moves out so it reaches through the margin
 *  to the canvas edge (the margin scales the ground by 1 - 2 MAT). */
const BLEED = MAT_SHARE / (1 - 2 * MAT_SHARE)

/**
 * Settles a mark in the frame. Ground, cliffs, and limbs that start at
 * the frame's edge are pushed out through the margin, so they still run
 * off the painting; plants and other marks that poke past the frame are
 * slid back inside it, so a leaf or a blossom is never lost off the
 * edge and every take paints something you can see.
 */
function settle(m: Mark): Mark {
  if (m.kind === 'splat') return m
  if ('pts' in m) {
    const anchored = m.pts.some(([x, y]) => x <= EDGE_LO || x >= EDGE_HI || y >= GROUND)
    if (anchored || (m.kind === 'stroke' && m.tone === 'wash')) {
      return {
        ...m,
        pts: m.pts.map(([x, y]): Pt => [x <= EDGE_LO ? x - BLEED : x >= EDGE_HI ? x + BLEED : x, y >= GROUND ? y + BLEED : y])
      }
    }
    const xs = m.pts.map((p) => p[0])
    const ys = m.pts.map((p) => p[1])
    const dx = inside(Math.min(...xs), Math.max(...xs))
    const dy = inside(Math.min(...ys), Math.max(...ys))
    return dx === 0 && dy === 0 ? m : { ...m, pts: m.pts.map(([x, y]): Pt => [x + dx, y + dy]) }
  }
  const pad = m.kind === 'needles' ? m.r : m.r * 1.6
  return { ...m, x: m.x + inside(m.x - pad, m.x + pad), y: m.y + inside(m.y - pad, m.y + pad) }
}

/** The shift that brings the span lo to hi inside 0.03 to 0.97 (none if
 *  it already fits, or cannot). */
function inside(lo: number, hi: number): number {
  if (hi - lo > 0.94) return 0
  if (lo < 0.03) return 0.03 - lo
  if (hi > 0.97) return 0.97 - hi
  return 0
}

// ------------------------------------------------------------ paint ---

export interface PaintingColors {
  ground: Rgb
  ink: Rgb
  soft: Rgb
  wash: Rgb
  accent: Rgb
  gold: Rgb
}

/** The night ground: rice ink on ink, ember for the accents. */
export function paintingColors(ground: Rgb, rice: Rgb, ember: Rgb, gold: Rgb): PaintingColors {
  return { ground, ink: rice, soft: mix(ground, rice, 0.55), wash: mix(ground, rice, 0.32), accent: ember, gold }
}

const toneColor = (tone: Tone, c: PaintingColors): Rgb =>
  tone === 'wash' ? c.wash : tone === 'soft' ? c.soft : tone === 'accent' ? c.accent : tone === 'gold' ? c.gold : c.ink

/** Longer takes paint bolder strokes. */
export const strokeWeight = (words: number | undefined): number => 0.75 + 0.5 * Math.min(1, (words ?? 80) / 160)

function paintMark(ctx: CanvasRenderingContext2D, m: Mark, w: number, h: number, weight: number, k: number, c: PaintingColors, seed: number): void {
  if (k <= 0) return
  if (m.kind === 'stroke') {
    const pts = m.pts.map(([x, y]): [number, number] => [x * w, y * h])
    const P = path(pts, Math.max(1, w / 420))
    if (P.length < 2) return
    const width = Math.max(0.8, m.w * w * weight)
    const i1 = k >= 1 ? P.length - 1 : Math.max(1, Math.floor(k * (P.length - 1)))
    stroke(ctx, P, cachedBrush(500 + (seed % 40), clamp(Math.round(width / 1.6), 9, 60)), {
      width,
      rgb: toneColor(m.tone, c),
      dry: m.dry,
      alpha: m.alpha,
      core: m.tone === 'ink' ? 0.45 : 0.2,
      ts: m.shape === 'leaf' ? 0.02 : 0.05,
      te: m.shape === 'leaf' ? 0.6 : m.shape === 'stalk' ? 0.06 : 0.3,
      pfn: m.shape === 'leaf' ? (t) => 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8) : undefined,
      i1
    })
    return
  }
  if (m.kind === 'blossom') {
    const r = m.r * w * weight
    const rand = mulberry(seed * 7 + 1)
    const petals = Math.ceil(5 * k)
    ctx.fillStyle = rgba(mix(c.accent, c.ink, 0.22), 0.9)
    for (let p = 0; p < petals; p++) {
      const a = (p / 5) * TAU + rand() * 0.4
      ctx.beginPath()
      ctx.ellipse(m.x * w + Math.cos(a) * r, m.y * h + Math.sin(a) * r, r * 0.8, r * 0.62, a, 0, TAU)
      ctx.fill()
    }
    if (k >= 1) {
      ctx.fillStyle = rgba(c.gold)
      ctx.beginPath()
      ctx.arc(m.x * w, m.y * h, r * 0.32, 0, TAU)
      ctx.fill()
    }
    return
  }
  if (m.kind === 'blot') {
    if (m.fade) {
      // A wash that thins downward, like ink on a rock face.
      const top = Math.min(...m.pts.map((p) => p[1])) * h
      const bottom = Math.max(...m.pts.map((p) => p[1])) * h
      const grad = ctx.createLinearGradient(0, top, 0, bottom)
      grad.addColorStop(0, rgba(toneColor(m.tone, c), m.alpha * k))
      grad.addColorStop(1, rgba(toneColor(m.tone, c), m.alpha * k * 0.2))
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = rgba(toneColor(m.tone, c), m.alpha * k)
    }
    ctx.beginPath()
    m.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    ctx.closePath()
    ctx.fill()
    return
  }
  if (m.kind === 'fill') {
    // A wash under a ridgeline, fading down: the body of a range of hills.
    // It thins to nothing at both ends, so a range never ends in a box.
    const n = m.pts.length
    const under = m.pts.map(([x, y], i): Pt => [x, y + m.depth * Math.sin((Math.PI * i) / Math.max(1, n - 1))])
    const top = Math.min(...m.pts.map((p) => p[1])) * h
    const bottom = Math.max(...under.map((p) => p[1])) * h
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    const rgb = toneColor(m.tone, c)
    grad.addColorStop(0, rgba(rgb, m.alpha * k))
    grad.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    m.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(under[i][0] * w, under[i][1] * h)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (m.kind === 'bud') {
    ctx.fillStyle = rgba(toneColor(m.tone ?? 'accent', c), k)
    ctx.beginPath()
    ctx.arc(m.x * w, m.y * h, m.r * w * weight, 0, TAU)
    ctx.fill()
    return
  }
  if (m.kind === 'needles') {
    const rand = mulberry(seed * 13 + 5)
    const n = 9
    const shown = Math.ceil(n * k)
    for (let i = 0; i < shown; i++) {
      const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 0.9 + m.lean * 0.25 + (rand() - 0.5) * 0.12
      const len = m.r * w * weight * (0.8 + rand() * 0.4)
      const x = m.x * w
      const y = m.y * h
      const P = path(
        [
          [x, y],
          [x + Math.cos(a) * len, y + Math.sin(a) * len]
        ],
        1
      )
      stroke(ctx, P, cachedBrush(900 + (i % 6), 6), { width: Math.max(0.8, w * 0.0035), rgb: c.ink, dry: 0.4, core: 0.6, ts: 0.05, te: 0.5 })
    }
    return
  }
  const sp = splat(seed, m.x * w, m.y * h, { r: m.r * w, count: m.count, mist: m.count, dir: m.dir, spread: 0.9, reach: 2.4 })
  drawSplat(ctx, sp, toneColor(m.tone, c), k)
}

/** A seal's color: one, or two halves for the coral belts, whose blocks
 *  alternate. */
export type SealColor = Rgb | readonly [Rgb, Rgb]

/** The seal a finished painting gets: a square in the color of the belt
 *  it was painted at (ember before the first belt), the ensō pill carved
 *  out of it. k stamps it in. */
export function paintSeal(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, c: PaintingColors, color: SealColor = c.accent): void {
  if (k <= 0) return
  const s = w * 0.07 * (0.6 + 0.4 * Math.min(1, k))
  const x = w * 0.9 - s / 2
  const y = h * 0.86 - s / 2
  const halves = Array.isArray(color[0]) ? (color as readonly [Rgb, Rgb]) : null
  ctx.save()
  ctx.globalAlpha = Math.min(1, k * 1.4)
  ctx.fillStyle = rgba(halves ? halves[0] : (color as Rgb))
  ctx.beginPath()
  ctx.roundRect(x, y, s, s, s * 0.12)
  ctx.fill()
  if (halves) {
    ctx.save()
    ctx.clip()
    ctx.fillStyle = rgba(halves[1])
    ctx.fillRect(x + s / 2, y, s / 2, s)
    ctx.restore()
  }
  ctx.strokeStyle = rgba(c.ground)
  ctx.lineWidth = s * 0.08
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * 0.64 + (Math.PI * 1.86 * i) / 24
    const co = Math.cos(a)
    const si = Math.sin(a)
    const px = x + s / 2 + s * 0.32 * Math.sign(co) * Math.pow(Math.abs(co), 0.8)
    const py = y + s / 2 + s * 0.17 * Math.sign(si) * Math.pow(Math.abs(si), 0.8)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.fillStyle = rgba(c.ground)
  ctx.beginPath()
  ctx.arc(x + s * 0.32, y + s / 2, s * 0.06, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/**
 * Paints the first `done` strokes of a plan on its ground. The newest of
 * them paints `live` of the way (its paint-in); a finished painting gets
 * the seal, stamped in by `seal`.
 */
export function paintPainting(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: readonly Gesture[],
  words: readonly number[],
  c: PaintingColors,
  opts: { done: number; live?: number; seal?: number; seed: number; ground?: boolean; sealColor?: SealColor }
): void {
  // On screen the card's own color shows through (a canvas fill of the
  // same color can render a shade off); a saved card paints its ground.
  if (opts.ground !== false) {
    ctx.fillStyle = rgba(c.ground)
    ctx.fillRect(0, 0, w, h)
  }
  const done = Math.min(opts.done, plan.length)
  // While the newest stroke paints in, the strokes under it are drawn
  // once into a cached image, not again on every frame.
  const live = opts.live !== undefined && opts.live < 1 && done > 1
  const under = live ? settled(ctx, w, h, plan, words, c, done - 1, opts.seed) : null
  if (under) ctx.drawImage(under, 0, 0, w, h)
  // The painting keeps a margin inside its frame, like paper on a mat,
  // so a leaf or a ridge never runs off the edge.
  ctx.save()
  ctx.translate(w * MAT, h * MAT)
  ctx.scale(1 - MAT * 2, 1 - MAT * 2)
  for (let g = under ? done - 1 : 0; g < done; g++) {
    const k = g === done - 1 && opts.live !== undefined ? opts.live : 1
    const marks = plan[g]
    const weight = strokeWeight(words[g])
    marks.forEach((m, j) => paintMark(ctx, m, w, h, weight, clamp(k * marks.length - j, 0, 1), c, opts.seed + g * 13 + j))
  }
  ctx.restore()
  if (opts.seal && opts.seal > 0) paintSeal(ctx, w, h, opts.seal, c, opts.sealColor)
}

/** The margin a painting keeps inside its frame, as a share of each side. */
const MAT = MAT_SHARE

const underCache = new WeakMap<readonly Gesture[], { key: string; image: HTMLCanvasElement }>()

/** The first n strokes of a plan, finished, as an image the size of the
 *  canvas being painted (kept per plan until its strokes or size change).
 *  Null where there is no document (tests). */
function settled(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: readonly Gesture[],
  words: readonly number[],
  c: PaintingColors,
  n: number,
  seed: number
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const scale = ctx.getTransform().a || 1
  const key = `${n}|${w}|${h}|${scale}|${seed}|${c.ink.join()}|${words.slice(0, n).join(',')}`
  const kept = underCache.get(plan)
  if (kept && kept.key === key) return kept.image
  const image = document.createElement('canvas')
  image.width = Math.max(1, Math.round(w * scale))
  image.height = Math.max(1, Math.round(h * scale))
  const g = image.getContext('2d')
  if (!g) return null
  g.setTransform(scale, 0, 0, scale, 0, 0)
  g.translate(w * MAT, h * MAT)
  g.scale(1 - MAT * 2, 1 - MAT * 2)
  for (let i = 0; i < n; i++) {
    const weight = strokeWeight(words[i])
    plan[i].forEach((m, j) => paintMark(g, m, w, h, weight, 1, c, seed + i * 13 + j))
  }
  underCache.set(plan, { key, image })
  return image
}

/** Past its size, a finished painting keeps growing, up to this many
 *  more strokes: every take still adds something (LaBroi, 2026-10-09). */
export const MAX_EXTRA = 60

/** What the painting is called so far: the subject stays a surprise
 *  for its first two strokes. */
export function paintingCaption(subject: SubjectId, done: number, target: number): string {
  const more = done - target
  if (more > 0) return `${SUBJECT_NAMES[subject]}, finished, and ${more} ${more === 1 ? 'stroke' : 'strokes'} more`
  if (done >= target) return `${SUBJECT_NAMES[subject]}, finished`
  const so = `${done} of ${target} strokes`
  return done < 3 ? `a painting, ${so}` : `${SUBJECT_NAMES[subject]}, ${so}`
}

/** The line under a finished painting, from the day's own numbers. */
export function paintingLine(words: readonly number[], longestMs: number | null): string {
  const n = words.length
  const total = words.reduce((a, b) => a + b, 0)
  const said = `${n.toLocaleString()} ${n === 1 ? 'take' : 'takes'}, ${total.toLocaleString()} words.`
  return longestMs && longestMs > 0 ? `${said} The longest ran ${formatDuration(longestMs)}.` : said
}

/** The saved card's size in CSS pixels; it saves at twice this, 1080 by 1350. */
export const CARD = { W: 540, H: 675 }

/**
 * The portrait card Save card writes (US-098): the wordmark and date,
 * the painting as it stands, its name in the display face, how far it
 * got, and the line about the day when it is finished. Drawn on this
 * machine; nothing is sent.
 */
export function paintPaintingCard(
  ctx: CanvasRenderingContext2D,
  plan: readonly Gesture[],
  words: readonly number[],
  c: PaintingColors,
  ink: { text: Rgb; dim: Rgb },
  fonts: { display: string; body: string; mono: string },
  says: { date: string; title: string; caption: string; line: string | null; painter: string },
  opts: { done: number; finished: boolean; seed: number; sealColor?: SealColor }
): void {
  const { W, H } = CARD
  const pad = 36
  ctx.fillStyle = rgba(c.ground)
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  ctx.font = `13px ${fonts.mono}`
  ctx.fillStyle = rgba(c.gold)
  ctx.fillText('murmur', pad, 48)
  ctx.textAlign = 'right'
  ctx.fillStyle = rgba(ink.dim)
  ctx.font = `12px ${fonts.mono}`
  ctx.fillText(says.date, W - pad, 48)
  ctx.textAlign = 'left'
  const pw = W - pad * 2
  const ph = pw * 0.75
  ctx.save()
  ctx.translate(pad, 70)
  ctx.beginPath()
  ctx.roundRect(0, 0, pw, ph, 10)
  ctx.clip()
  paintPainting(ctx, pw, ph, plan, words, c, { done: opts.done, seal: opts.finished ? 1 : 0, seed: opts.seed, sealColor: opts.sealColor })
  ctx.restore()
  let y = 70 + ph + 64
  ctx.fillStyle = rgba(ink.text)
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'condensed'
  // The longest names (willow by the water) shrink to fit the card.
  let size = 46
  ctx.font = `800 ${size}px ${fonts.display}`
  while (size > 26 && ctx.measureText(says.title).width > W - pad * 2) {
    size -= 2
    ctx.font = `800 ${size}px ${fonts.display}`
  }
  ctx.fillText(says.title, pad, y)
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'normal'
  y += 32
  ctx.fillStyle = rgba(ink.dim)
  ctx.font = `15px ${fonts.body}`
  ctx.fillText(says.caption, pad, y)
  if (says.line) {
    y += 30
    ctx.fillStyle = rgba(ink.text)
    ctx.font = `17px ${fonts.body}`
    ctx.fillText(says.line, pad, y)
  }
  y += 26
  ctx.fillStyle = rgba(ink.dim)
  ctx.font = `14px ${fonts.body}`
  ctx.fillText(says.painter, pad, y)
  ctx.font = `11px ${fonts.mono}`
  ctx.fillText('painted one take at a time', pad, H - 34)
  ctx.textAlign = 'right'
  ctx.fillText('murmurapp.app', W - pad, H - 34)
  ctx.textAlign = 'left'
}
