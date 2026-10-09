// SPDX-License-Identifier: GPL-3.0-only
// The painting's light (US-100). When a painting finishes, the light of
// the hours it was painted in comes in with its seal: a dawn sun for a
// painting made in the morning, a pale sun by day, a setting sun with a
// cloud across it at dusk, a crescent moon and stars at night. It goes in
// the open sky the painting leaves, found from where its own strokes are,
// and paints under every stroke, the way a painter lays the sky first. A
// painting that already holds a moon keeps it: by night its sky gets the
// stars, by day an afterglow. Pure and deterministic, drawn only by code.
import { mulberry } from '../brush'
import { type Gesture, type Mark, type Pt, TAU, ring } from './paintKit'

export type Light = 'dawn' | 'day' | 'dusk' | 'night'

/** The light of an hour (local, 0 to 23): dawn from 5, day from 10, dusk
 *  from 17, night from 21. */
export function lightFor(hour: number): Light {
  if (hour >= 5 && hour < 10) return 'dawn'
  if (hour >= 10 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}

/** The light in words, for the card: painted at blue belt, by moonlight. */
export const LIGHT_WORDS: Record<Light, string> = { dawn: 'at dawn', day: 'by day', dusk: 'at dusk', night: 'by moonlight' }

/** Paintings are 4 wide by 3 tall, so a round sun is taller in plan units. */
const ASPECT = 4 / 3
const COLS = 20
const ROWS = 16
/** The eight directions around a stroke's centerline. */
const BODY: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
]

function insideShape(pts: readonly Pt[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * How much paint each cell of a coarse grid (COLS by ROWS over the
 * painting) holds: strokes along their length (washes lightly), shapes
 * over their body, flowers and dots where they sit.
 */
export function occupancy(gestures: readonly Gesture[]): number[] {
  const grid = new Array<number>(COLS * ROWS).fill(0)
  const add = (x: number, y: number, v: number): void => {
    const cx = Math.floor(x * COLS)
    const cy = Math.floor(y * ROWS)
    if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) grid[cy * COLS + cx] += v
  }
  for (const gesture of gestures) {
    for (const m of gesture) {
      if (m.kind === 'stroke') {
        const v = m.tone === 'wash' ? 0.3 : 1
        // An ink stroke has a body: the cells its width reaches (the
        // boldest weight, plus the gap between samples and a star's size)
        // get a trace too, so a star never hides under it. Washes are thin
        // enough to shine through.
        const hx = m.tone === 'wash' ? 0 : m.w * 0.65 + 0.012
        const hy = hx * ASPECT
        for (let i = 1; i < m.pts.length; i++) {
          const [x0, y0] = m.pts[i - 1]
          const [x1, y1] = m.pts[i]
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.02))
          for (let j = 0; j <= n; j++) {
            const x = x0 + ((x1 - x0) * j) / n
            const y = y0 + ((y1 - y0) * j) / n
            add(x, y, v)
            if (hx > 0) for (const [dx, dy] of BODY) add(x + dx * hx, y + dy * hy, 0.01)
          }
        }
      } else if (m.kind === 'blot' || m.kind === 'fill') {
        const body = m.kind === 'fill' ? [...m.pts, ...m.pts.map(([x, y]): Pt => [x, y + m.depth]).reverse()] : m.pts
        for (let cy = 0; cy < ROWS; cy++) {
          for (let cx = 0; cx < COLS; cx++) {
            const x = (cx + 0.5) / COLS
            const y = (cy + 0.5) / ROWS
            if (insideShape(body, x, y)) grid[cy * COLS + cx] += 1.5
          }
        }
      } else {
        add(m.x, m.y, m.kind === 'splat' ? 1 : 2)
      }
    }
  }
  return grid
}

/** The paint under a disc at x, y (its rim and a little past it). */
function under(grid: readonly number[], x: number, y: number, r: number): number {
  let sum = 0
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const dx = (cx + 0.5) / COLS - x
      const dy = ((cy + 0.5) / ROWS - y) / ASPECT
      if (Math.hypot(dx, dy) <= r * 1.5) sum += grid[cy * COLS + cx]
    }
  }
  return sum
}

const SKY_TOP = 0.1
const SKY_LOW = 0.4

/** The most open spot for a disc of radius r in the sky, leaning low (a
 *  rising or setting sun) or high, away from the very middle, with all of
 *  its glow (reach) inside the frame; the seed settles near ties. */
function openSky(grid: readonly number[], r: number, reach: number, low: boolean, seed: number): Pt {
  const rand = mulberry(seed)
  const top = Math.max(SKY_TOP, reach * ASPECT + 0.025)
  const side = Math.max(0.14, reach + 0.025)
  let best: Pt = [side, top]
  let bestScore = Infinity
  for (let y = top; y <= SKY_LOW + 1e-9; y += 0.02) {
    for (let x = side; x <= 1 - side + 1e-9; x += 0.02) {
      const middle = Math.max(0, 1 - Math.abs(x - 0.5) / 0.12)
      const lean = (low ? SKY_LOW - y : y - top) * 5
      const score = under(grid, x, y, r) + middle * 2 + lean + rand() * 0.6
      if (score < bestScore) {
        bestScore = score
        best = [x, y]
      }
    }
  }
  return best
}

/** Keeps a cloud's ends inside the frame. */
const edge = (x: number): number => Math.min(0.97, Math.max(0.03, x))

/** A round disc as a shape, r wide. */
const disc = (x: number, y: number, r: number): Pt[] => ring(x, y, r, r * ASPECT, 0, TAU, 36)

/** A crescent lit on its right, r wide. */
function crescent(x: number, y: number, r: number): Pt[] {
  const outer = ring(x, y, r, r * ASPECT, -Math.PI / 2, Math.PI / 2, 18)
  const inner = ring(x - r * 0.42, y, r * 0.82, r * 0.98 * ASPECT, Math.PI / 2 - 0.12, -Math.PI / 2 + 0.12, 18)
  return [...outer, ...inner]
}

/**
 * The light a finished painting gets from the hour it was painted in,
 * placed from its own strokes: the first `target` gestures of its plan,
 * so what grows after never moves it. Marks in plan units, painted under
 * every stroke.
 */
export function planLight(plan: readonly Gesture[], target: number, seed: number, tier: number, hour: number): Gesture {
  const light = lightFor(hour)
  const base = plan.slice(0, target)
  const grid = occupancy(base)
  const rand = mulberry((seed ^ 0x51ed270b) >>> 0)
  const moon = base.flat().find((m): m is Extract<Mark, { kind: 'stroke' }> => m.kind === 'stroke' && m.moon === true)
  const marks: Mark[] = []
  if (light === 'night') {
    let moonAt: Pt | null = null
    let moonR = 0.08
    if (moon) {
      const xs = moon.pts.map((p) => p[0])
      moonAt = [(Math.min(...xs) + Math.max(...xs)) / 2, moon.pts.reduce((a, p) => a + p[1], 0) / moon.pts.length]
      moonR = (Math.max(...xs) - Math.min(...xs)) / 2
    } else {
      const r = 0.045
      moonAt = openSky(grid, r, r * 1.7, false, seed)
      moonR = r
      marks.push({ kind: 'blot', pts: disc(moonAt[0], moonAt[1], r * 1.7), tone: 'wash', alpha: 0.12 + tier * 0.02 })
      marks.push({ kind: 'blot', pts: crescent(moonAt[0], moonAt[1], r), tone: 'ink', alpha: 0.92 })
    }
    // Stars only where the sky is open, never on the moon.
    const want = 16 + tier * 2
    for (let tries = 0; tries < 400 && marks.filter((m) => m.kind === 'bud').length < want; tries++) {
      const x = 0.04 + rand() * 0.92
      const y = 0.04 + rand() * 0.44
      const cell = grid[Math.floor(y * ROWS) * COLS + Math.floor(x * COLS)]
      const nearMoon = moonAt && Math.hypot(x - moonAt[0], (y - moonAt[1]) / ASPECT) < moonR * 2.2
      if (cell > 0 || nearMoon) continue
      const bright = rand() < 0.25
      marks.push({ kind: 'bud', x, y, r: bright ? 0.0042 : 0.0026 + rand() * 0.0012, tone: bright ? 'ink' : 'soft' })
    }
    return marks
  }
  if (moon) {
    // A moon by day: no second disc, an afterglow across the sky under it.
    const bottom = Math.max(...moon.pts.map((p) => p[1]))
    // Under the moon wherever it sits (the maple's hangs low), the second
    // band at dusk still inside the frame.
    const y = Math.min(bottom + 0.05 + rand() * 0.03, 0.9)
    const tone = light === 'day' ? 'gold' : light === 'dawn' ? 'glow' : 'accent'
    marks.push({ kind: 'stroke', pts: [[0.02, y], [0.4, y - 0.012], [0.98, y + 0.008]], w: 0.03, tone, dry: 0.9, alpha: light === 'day' ? 0.16 : 0.3 })
    if (light === 'dusk') marks.push({ kind: 'stroke', pts: [[0.1, y + 0.05], [0.5, y + 0.044], [0.9, y + 0.054]], w: 0.016, tone: 'accent', dry: 0.9, alpha: 0.22 })
    return marks
  }
  const r = light === 'day' ? 0.06 : light === 'dawn' ? 0.07 : 0.08
  const [x, y] = openSky(grid, r, r * 1.55, light !== 'day', seed)
  const tone = light === 'day' ? 'gold' : light === 'dawn' ? 'glow' : 'accent'
  marks.push({ kind: 'blot', pts: disc(x, y, r * 1.55), tone, alpha: 0.07 + tier * 0.015 })
  marks.push({ kind: 'blot', pts: disc(x, y, r), tone, alpha: light === 'day' ? 0.74 : light === 'dawn' ? 0.8 : 0.88 })
  if (light === 'day') {
    // A thin cloud drifting under a high sun.
    const cy = y + r * ASPECT * 1.25
    marks.push({ kind: 'stroke', pts: [[edge(x - r * 3), cy + 0.004], [x + r * 0.5, cy - 0.004], [edge(x + r * 3.2), cy + 0.002]], w: 0.009, tone: 'soft', dry: 0.9, alpha: 0.45 })
  } else if (light === 'dusk') {
    // A cloud drifting across the setting sun.
    const cy = y + r * ASPECT * 0.35
    marks.push({ kind: 'stroke', pts: [[edge(x - r * 2.6), cy + 0.006], [x, cy - 0.004], [edge(x + r * 2.2), cy + 0.004]], w: 0.018, tone: 'wash', dry: 0.85, alpha: 0.9 })
  } else if (light === 'dawn') {
    // Mist low across the rising sun.
    const cy = y + r * ASPECT * 0.7
    marks.push({ kind: 'stroke', pts: [[edge(x - r * 2.2), cy], [x + r * 0.4, cy - 0.006], [edge(x + r * 2.4), cy + 0.003]], w: 0.01, tone: 'soft', dry: 0.88, alpha: 0.7 })
  }
  return marks
}
