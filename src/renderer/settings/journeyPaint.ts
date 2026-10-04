// SPDX-License-Identifier: GPL-3.0-only
// The Journey, painted (US-076): the belt as painted fabric with crisp
// tape stripes, the ladder as a road painted in each belt's color up to
// where you are, the words gate as a stroke, the days gate as tally
// marks, and achievements as ink stamps. Pure painters over a canvas
// context, all from the brush engine and all seeded, so the same
// progress paints the same picture. k (0 to 1) is how far a paint-in has
// got; 1 is the finished painting reduced motion always gets.
import type { RankSpec } from '../../shared/ranks'
import { type Rgb, cachedBrush, clamp, flickEase, lerp, mix, mulberry, parseColor, path, rgba, stroke, tokenColor } from '../brush'

const TAU = Math.PI * 2

export interface JourneyColors {
  rice: Rgb
  text: Rgb
  ink: Rgb
  ember: Rgb
  gold: Rgb
  dim: Rgb
  belts: Record<string, Rgb>
}

/** The colors the Journey paints with: tokens, and the belt fabrics from
 *  shared/cosmetics.json. */
export function journeyColors(beltHex: Record<string, string>): JourneyColors {
  const belts: Record<string, Rgb> = {}
  for (const [name, value] of Object.entries(beltHex)) {
    const rgb = parseColor(value)
    if (rgb) belts[name] = rgb
  }
  return {
    rice: tokenColor('--rice', [233, 227, 214]),
    text: tokenColor('--text', [236, 233, 228]),
    ink: tokenColor('--ink', [15, 14, 17]),
    ember: tokenColor('--ember', [232, 88, 43]),
    gold: tokenColor('--brand', [217, 164, 65]),
    dim: tokenColor('--text-dim', [154, 150, 143]),
    belts
  }
}

/** A belt's color as paint on the ink ground: the black belt lifts
 *  toward grey so it never vanishes, white reads as rice paper. */
export function beltOnInk(belt: string, c: JourneyColors): Rgb {
  if (belt === 'white') return c.rice
  if (belt === 'black') return mix(c.belts.black ?? c.ink, c.dim, 0.45)
  if (belt.startsWith('coral')) return c.belts['coral-black'] ?? c.ember
  return c.belts[belt] ?? c.rice
}

// ------------------------------------------------------------- belt ---

/**
 * The belt: three overlapping bands of fabric paint, coral panels where
 * the coral belts alternate, stitching, the rank bar (red on a black
 * belt; none on coral or red belts), and tape stripes, which are crisp
 * because tape is not paint. progress paints the fabric in from the left;
 * the tape goes on once the fabric is done. drop slaps one tape on from
 * above (a new stripe, US-077): k runs 0 to 1.
 */
export function paintBelt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  belt: string,
  stripes: number,
  c: JourneyColors,
  progress = 1,
  drop?: { i: number; k: number }
): void {
  const seed = 5
  const bandH = h * 0.5
  const cy = h * 0.5
  const bx0 = w * 0.03
  const bx1 = w * 0.97
  const L = bx1 - bx0
  const coral = belt.startsWith('coral')
  const col = coral ? (c.belts['coral-black'] ?? c.ember) : belt === 'white' ? (c.belts.white ?? c.rice) : (c.belts[belt] ?? c.rice)
  const cut = bx0 + L * progress
  const step = Math.max(1.5, w / 260)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, -h, Math.max(0, cut + h * 0.4), h * 3)
  ctx.clip()
  for (let k = 0; k < 3; k++) {
    const yy = cy + (k - 1) * bandH * 0.3
    const P = path(
      [
        [bx0, yy + 1],
        [bx0 + L * 0.33, yy - 1.4],
        [bx0 + L * 0.66, yy + 1],
        [bx1, yy]
      ],
      step
    )
    stroke(ctx, P, cachedBrush(seed + k, 34), { width: bandH * 0.52, rgb: col, dry: 0.16, core: 0.92, ts: 0.015, te: 0.02, light: 0.12, dark: 0.22 })
  }
  if (coral) {
    // Red and black (7th degree) or red and white (8th) panels.
    const alt = belt === 'coral-white' ? (c.belts.white ?? c.rice) : mix(c.ink, c.dim, 0.08)
    for (let s = 0; s < 8; s += 2) {
      const sx0 = bx0 + (L * s) / 8
      const sx1 = bx0 + (L * (s + 1)) / 8
      for (let x = sx0; x < sx1; x += bandH * 0.1) {
        const P = path(
          [
            [x, cy + bandH * 0.5],
            [x + 0.6, cy - bandH * 0.5]
          ],
          1.4
        )
        stroke(ctx, P, cachedBrush(seed + 9 + (Math.round(x) % 13), 10), { width: bandH * 0.16, rgb: alt, dry: 0.12, core: 0.9, ts: 0.02, te: 0.04 })
      }
    }
  }
  // Stitching along the belt.
  ctx.strokeStyle = rgba(c.ink, 0.25)
  ctx.lineWidth = 0.8
  for (let k = 1; k < 6; k++) {
    const yy = cy - bandH / 2 + (bandH * k) / 6
    ctx.beginPath()
    ctx.moveTo(bx0 + 6, yy)
    ctx.lineTo(bx1 - 6, yy + Math.sin(k) * 0.8)
    ctx.stroke()
  }
  // The rank bar: black on most belts, red on a black belt.
  const hasBar = !coral && belt !== 'red'
  const rx0 = bx0 + L * 0.7
  const rx1 = bx0 + L * 0.86
  if (hasBar) {
    const barCol: Rgb = belt === 'black' ? (c.belts.red ?? c.ember) : mix(c.ink, c.dim, 0.06)
    for (let x = rx0; x < rx1; x += bandH * 0.09) {
      const P = path(
        [
          [x, cy + bandH * 0.52],
          [x + 0.6, cy - bandH * 0.52]
        ],
        1.4
      )
      stroke(ctx, P, cachedBrush(seed + 20 + (Math.round(x) % 11), 12), { width: bandH * 0.15, rgb: barCol, dry: 0.08, core: 0.95, ts: 0.02, te: 0.03 })
    }
  }
  ctx.restore()
  // Tape stripes: up to four, or six degrees on a black belt. The tape
  // goes on as the fabric lands.
  if (hasBar && progress >= 0.97) {
    const max = belt === 'black' ? 6 : 4
    const n = Math.min(stripes, max)
    const sp = (rx1 - rx0) / (max + 1)
    const r = mulberry(seed + 77)
    for (let i = 0; i < n; i++) {
      const tx = rx1 - sp * (i + 0.85)
      let ty = cy
      let rot = (r() - 0.5) * 0.08
      let scale = 1
      let alpha = 1
      if (drop && drop.i === i) {
        // Falls from above, turning and a touch large, and lands flat.
        const k = clamp(drop.k, 0, 1)
        ty -= (1 - flickEase(k)) * h * 0.9
        rot += (1 - k) * 0.5
        scale = 1 + (1 - k) * 0.2
        alpha = clamp(k * 3, 0, 1)
      }
      ctx.save()
      ctx.translate(tx, ty)
      ctx.rotate(rot)
      ctx.scale(scale, scale)
      ctx.globalAlpha = alpha
      ctx.shadowColor = rgba(c.ink, 0.55)
      ctx.shadowBlur = 4
      ctx.shadowOffsetY = 1.5
      ctx.fillStyle = rgba(c.text)
      ctx.fillRect(-sp * 0.23, -bandH * 0.56, sp * 0.46, bandH * 1.12)
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = rgba(c.ink, 0.08)
      for (let k = -4; k <= 4; k++) ctx.fillRect(-sp * 0.23, k * bandH * 0.12, sp * 0.46, 0.7)
      ctx.restore()
    }
  }
}

// ------------------------------------------------------------- road ---

export const ROAD = { W: 1500, H: 120, pad: 34, y: 66 }

/** The belt groups along the road, in order. */
const GROUPS = ['white', 'blue', 'purple', 'brown', 'black', 'coral-black', 'coral-white', 'red']

/** x of rank i on the road (the ladder without the starting none). */
export function rankX(i: number, count: number): number {
  const start = ROAD.pad + 30
  return start + (i * (ROAD.W - ROAD.pad - start)) / Math.max(1, count - 1)
}

/**
 * Where you stand: at your rank's knot plus the share of the way to the
 * next (the slower of the two gates); before the first knot with no belt.
 */
export function youX(roadIndex: number, toNext: number, count: number): number {
  if (roadIndex < 0) return lerp(ROAD.pad, rankX(0, count), clamp(toNext, 0, 1))
  if (roadIndex >= count - 1) return rankX(count - 1, count)
  return lerp(rankX(roadIndex, count), rankX(roadIndex + 1, count), clamp(toNext, 0, 1))
}

/**
 * The road: a pencil track the whole way, each belt group's stretch
 * painted in its color up to `paintTo`, a knot per rank (filled when
 * earned, a gold ring on the next one), the group names under it, and
 * you, marked in brand gold.
 */
export function paintRoad(
  ctx: CanvasRenderingContext2D,
  road: readonly RankSpec[],
  roadIndex: number,
  you: number,
  paintTo: number,
  label: string,
  c: JourneyColors,
  mono: string
): void {
  const y = ROAD.y
  const n = road.length
  ctx.setLineDash([3, 5])
  ctx.strokeStyle = rgba(c.rice, 0.2)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(ROAD.pad, y)
  ctx.lineTo(ROAD.W - ROAD.pad, y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.font = `11px ${mono}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  GROUPS.forEach((g, gi) => {
    const first = road.findIndex((r) => r.belt === g)
    if (first < 0) return
    let last = first
    while (last + 1 < n && road[last + 1].belt === g) last++
    const x0 = rankX(first, n)
    const x1 = g === 'red' || last + 1 >= n ? rankX(last, n) : rankX(last + 1, n)
    ctx.fillStyle = rgba(c.dim)
    ctx.fillText(g.replace('-', ' '), x0, y + 32)
    if (paintTo <= x0 || x1 <= x0) return
    const P = path(
      [
        [x0, y + 1],
        [lerp(x0, x1, 0.4), y - 2],
        [lerp(x0, x1, 0.75), y + 1.5],
        [x1, y]
      ],
      2
    )
    const to = clamp((paintTo - x0) / (x1 - x0), 0, 1)
    const i1 = to >= 1 ? P.length - 1 : Math.floor(to * (P.length - 1))
    if (i1 > 0) stroke(ctx, P, cachedBrush(800 + gi, 22), { width: 14, rgb: beltOnInk(g, c), dry: 0.42, core: 0.4, ts: 0.02, te: 0.05, i1 })
  })
  road.forEach((rank, i) => {
    const x = rankX(i, n)
    const start = rank.stripes === 0 || i === 0 || road[i - 1].belt !== rank.belt
    const r = start ? 5.5 : 3
    if (i <= roadIndex) {
      ctx.fillStyle = rgba(c.ink)
      ctx.beginPath()
      ctx.arc(x, y, r + 1.5, 0, TAU)
      ctx.fill()
      ctx.fillStyle = rgba(beltOnInk(rank.belt, c))
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.fill()
    } else if (i === roadIndex + 1) {
      ctx.strokeStyle = rgba(c.gold)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, r + 3, 0, TAU)
      ctx.stroke()
    } else {
      ctx.strokeStyle = rgba(c.rice, 0.25)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      ctx.stroke()
    }
  })
  // You: a gold dot on the road and your words above it.
  ctx.fillStyle = rgba(c.ink)
  ctx.beginPath()
  ctx.arc(you, y, 8, 0, TAU)
  ctx.fill()
  ctx.fillStyle = rgba(c.gold)
  ctx.beginPath()
  ctx.arc(you, y, 6, 0, TAU)
  ctx.fill()
  ctx.textAlign = you < ROAD.pad + 60 ? 'left' : you > ROAD.W - ROAD.pad - 60 ? 'right' : 'center'
  ctx.fillStyle = rgba(c.gold)
  ctx.fillText(label, you, y - 20)
}

// ------------------------------------------------------------ gates ---

/** The words gate: a stroke over a pencil track, `pct` of the way. */
export function paintWordsGate(ctx: CanvasRenderingContext2D, w: number, h: number, pct: number, col: Rgb, c: JourneyColors): void {
  ctx.setLineDash([3, 5])
  ctx.strokeStyle = rgba(c.rice, 0.2)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(4, h / 2)
  ctx.lineTo(w - 4, h / 2)
  ctx.stroke()
  ctx.setLineDash([])
  const P = path(
    [
      [6, h / 2 + 1],
      [w * 0.35, h / 2 - 1.5],
      [w * 0.7, h / 2 + 1],
      [w - 6, h / 2]
    ],
    2
  )
  const i1 = Math.floor(clamp(pct, 0, 1) * (P.length - 1))
  if (i1 > 0) stroke(ctx, P, cachedBrush(901, 24), { width: Math.min(18, h * 0.5), rgb: col, dry: 0.4, core: 0.35, ts: 0.02, te: 0.04, i1 })
}

/** How many days each tally mark stands for, so a long gate stays
 *  readable: one each up to fifty, then evenly grouped. */
export function daysPerMark(need: number): number {
  return need <= 50 ? 1 : Math.ceil(need / 50)
}

/**
 * The days gate: tally marks in fives, painted for days you have and
 * pencil for days you need. k paints the newest marks in.
 */
export function paintTallies(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  needDays: number,
  haveDays: number,
  col: Rgb,
  c: JourneyColors,
  k = 1
): void {
  const per = daysPerMark(needDays)
  const need = Math.ceil(needDays / per)
  const have = Math.min(need, Math.floor(haveDays / per))
  const unit = Math.min(14, (w - 16) / (need + Math.ceil(need / 5) * 1.2 + 1))
  const top = h * 0.18
  const bot = h * 0.82
  for (let i = 0; i < need; i++) {
    const group = Math.floor(i / 5)
    const inG = i % 5
    const gx = 6 + group * unit * 6.2
    const x = gx + inG * unit
    const slash = inG === 4
    const pts: Array<[number, number]> = slash
      ? [
          [gx - unit * 0.4, bot - 2],
          [gx + unit * 3.4, top + 2]
        ]
      : [
          [x, bot],
          [x + 0.8, top]
        ]
    const prog = i < have ? clamp(k * have - i, 0, 1) : 0
    if (prog > 0) {
      const P = path(pts, 1.3)
      stroke(ctx, P, cachedBrush(950 + (i % 40), 10), {
        width: Math.min(slash ? 5 : 6, unit * 0.5 + 1),
        rgb: col,
        dry: 0.35,
        core: 0.45,
        ts: 0.1,
        te: 0.25,
        i1: Math.max(1, Math.floor(prog * (P.length - 1)))
      })
    } else {
      ctx.setLineDash([2, 3])
      ctx.strokeStyle = rgba(c.rice, 0.25)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      ctx.lineTo(pts[1][0], pts[1][1])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

// ----------------------------------------------------------- stamps ---

/**
 * One achievement as an ink stamp: pressed in ember with a little wear
 * when earned, a faint dashed outline when not. Each has its own glyph.
 */
export function paintStamp(ctx: CanvasRenderingContext2D, w: number, id: string, got: boolean, seed: number, c: JourneyColors, display: string): void {
  const cx = w / 2
  const R = w * 0.42
  const col = got ? c.ember : c.rice
  const A = got ? 1 : 0.22
  const brushIt = (pts: Array<[number, number]>, width: number, dry = 0.4, s = 0): void => {
    if (got) {
      stroke(ctx, path(pts, 1.2), cachedBrush(seed + s, 12), { width, rgb: col, dry, core: 0.5, ts: 0.08, te: 0.2 })
      return
    }
    ctx.strokeStyle = rgba(col, A)
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    const P = path(pts, 2)
    P.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.stroke()
  }
  const ring = (rr: number, n = 40): Array<[number, number]> =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * TAU - 1.2
      return [cx + Math.cos(a) * rr, cx + Math.sin(a) * rr]
    })
  if (got) {
    stroke(ctx, path(ring(R), 1.3), cachedBrush(seed, 16), { width: w * 0.07, rgb: col, dry: 0.3, core: 0.6, ts: 0.01, te: 0.02 })
    ctx.strokeStyle = rgba(col, 0.9)
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.arc(cx, cx, R * 0.8, 0, TAU)
    ctx.stroke()
  } else {
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = rgba(col, A)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(cx, cx, R, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
  }
  const text = (s: string, size: number): void => {
    ctx.fillStyle = rgba(col, got ? 1 : A)
    ctx.font = `800 ${size}px ${display}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s, cx, cx + 1)
  }
  const tallies = (n: number): void => {
    for (let i = 0; i < Math.min(n, 4); i++) {
      const x = cx - w * 0.15 + i * w * 0.1
      brushIt(
        [
          [x, cx + w * 0.14],
          [x + 1, cx - w * 0.14]
        ],
        w * 0.06,
        0.3,
        i + 1
      )
    }
    if (n >= 5) {
      brushIt(
        [
          [cx - w * 0.21, cx + w * 0.12],
          [cx + w * 0.2, cx - w * 0.12]
        ],
        w * 0.05,
        0.3,
        9
      )
    }
    for (let i = 0; i < n - 5; i++) {
      const x = cx + w * 0.25 + i * w * 0.07
      brushIt(
        [
          [x, cx + w * 0.1],
          [x, cx - w * 0.1]
        ],
        w * 0.045,
        0.3,
        12 + i
      )
    }
  }
  const arc = (r: number, from: number, to: number, n: number, dy = 0): Array<[number, number]> =>
    Array.from({ length: n }, (_, i) => {
      const a = from + (i / (n - 1)) * (to - from)
      return [cx + Math.cos(a) * r, cx + dy + Math.sin(a) * r]
    })
  switch (id) {
    case 'first-words':
      brushIt(
        [
          [cx - w * 0.12, cx + w * 0.08],
          [cx, cx - w * 0.02],
          [cx + w * 0.14, cx - w * 0.1]
        ],
        w * 0.08,
        0.35
      )
      break
    case 'streak-3':
      tallies(3)
      break
    case 'streak-7':
      tallies(7)
      break
    case 'streak-30':
      text('30', w * 0.32)
      break
    case 'streak-100':
      if (got) stroke(ctx, path(ring(R * 0.45, 30).slice(0, 28), 1.2), cachedBrush(seed + 5, 12), { width: w * 0.08, rgb: col, dry: 0.5, core: 0.4, ts: 0.05, te: 0.3 })
      else {
        ctx.strokeStyle = rgba(col, A)
        ctx.beginPath()
        ctx.arc(cx, cx, R * 0.45, 0, TAU * 0.9)
        ctx.stroke()
      }
      break
    case 'day-1k':
      text('1k', w * 0.32)
      break
    case 'day-5k':
      text('5k', w * 0.32)
      break
    case 'day-10k':
      text('10k', w * 0.28)
      break
    case 'sessions-100':
      text('100', w * 0.26)
      break
    case 'sessions-1000':
      text('1000', w * 0.2)
      break
    case 'marathon':
      brushIt(
        [
          [cx - w * 0.26, cx + w * 0.02],
          [cx, cx - w * 0.03],
          [cx + w * 0.26, cx + w * 0.01]
        ],
        w * 0.08,
        0.6
      )
      break
    case 'night-owl':
      brushIt(arc(w * 0.17, -1.9, 1.7, 12), w * 0.08, 0.3)
      break
    case 'early-bird':
      brushIt(arc(w * 0.14, Math.PI, TAU, 10, w * 0.08), w * 0.07, 0.3)
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * (1.25 + i * 0.25)
        brushIt(
          [
            [cx + Math.cos(a) * w * 0.2, cx + w * 0.08 + Math.sin(a) * w * 0.2],
            [cx + Math.cos(a) * w * 0.28, cx + w * 0.08 + Math.sin(a) * w * 0.28]
          ],
          w * 0.04,
          0.3,
          20 + i
        )
      }
      break
    case 'comeback':
      brushIt(
        [
          [cx - w * 0.18, cx + w * 0.1],
          [cx - w * 0.05, cx - w * 0.12],
          [cx + w * 0.1, cx - w * 0.05],
          [cx + w * 0.02, cx + w * 0.08],
          [cx - w * 0.08, cx],
          [cx + w * 0.22, cx - w * 0.14]
        ],
        w * 0.06,
        0.45
      )
      break
    default:
      // An achievement without its own glyph gets a single dab.
      brushIt(
        [
          [cx - w * 0.1, cx],
          [cx + w * 0.1, cx]
        ],
        w * 0.08,
        0.4
      )
  }
  if (got) {
    // Stamp wear: tiny knocked-out flecks, so it reads pressed, not printed.
    const r = mulberry(seed * 3 + 1)
    ctx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 140; i++) {
      const a = r() * TAU
      const d = Math.sqrt(r()) * R * 1.1
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 0.3 + r() * 1.1, 0, TAU)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

/** The easing a paint-in uses, exported so a test can pin it. */
export const paintEase = (t: number): number => flickEase(clamp(t, 0, 1))
