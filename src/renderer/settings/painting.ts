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
import { type Rgb, cachedBrush, clamp, drawSplat, lerp, mix, mulberry, path, rgba, splat, stroke } from '../brush'
import { type PaintingRecord, SUBJECT_NAMES, type SubjectId } from '../../shared/painting'
import { formatDuration } from '../../shared/time'

export type Tone = 'ink' | 'soft' | 'wash' | 'accent'
type Pt = [number, number]

export type Mark =
  | { kind: 'stroke'; pts: Pt[]; w: number; tone: Tone; dry: number; shape?: 'leaf' | 'stalk'; alpha?: number }
  | { kind: 'blossom'; x: number; y: number; r: number }
  | { kind: 'bud'; x: number; y: number; r: number; tone?: Tone }
  | { kind: 'fill'; pts: Pt[]; depth: number; tone: Tone; alpha: number }
  | { kind: 'needles'; x: number; y: number; r: number; lean: number }
  | { kind: 'splat'; x: number; y: number; r: number; dir: number | null; tone: Tone; count: number }

/** One take's worth of paint: a mark, or at higher tiers a few. */
export type Gesture = Mark[]

export interface LayerShare {
  weight: number
  min: number
  max?: number
}

interface Layer extends LayerShare {
  make: (count: number) => Gesture[]
}

const TAU = Math.PI * 2

/**
 * Shares `total` strokes out across layers in order: each gets its
 * minimum (the last layers give theirs up first when the total is too
 * small), then each further stroke goes to the layer furthest below its
 * share by weight, never past a layer's maximum.
 */
export function allocate(total: number, layers: readonly LayerShare[]): number[] {
  const counts = layers.map((l) => l.min)
  let left = total - counts.reduce((a, b) => a + b, 0)
  for (let i = layers.length - 1; left < 0 && i >= 0; i--) {
    const cut = Math.min(counts[i], -left)
    counts[i] -= cut
    left += cut
  }
  while (left > 0) {
    const open = layers.flatMap((l, i) => (l.weight > 0 && (l.max === undefined || counts[i] < l.max) ? [i] : []))
    if (open.length === 0) break
    const weights = open.reduce((a, i) => a + layers[i].weight, 0)
    const pool = open.reduce((a, i) => a + counts[i], 0) + left
    let best = open[0]
    let gap = -Infinity
    for (const i of open) {
      const g = (layers[i].weight / weights) * pool - counts[i]
      if (g > gap + 1e-9) {
        gap = g
        best = i
      }
    }
    counts[best] += 1
    left -= 1
  }
  return counts
}

/** Marks per detail gesture: one, two from purple belt, three from black. */
export const clusterFor = (tier: number): number => 1 + Math.floor(tier / 2)

function ring(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 26): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

function leaf(x: number, y: number, ang: number, len: number): Pt[] {
  return [
    [x, y],
    [x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - 0.004],
    [x + Math.cos(ang) * len, y + Math.sin(ang) * len]
  ]
}

/** A ridgeline across the ground from x0 to x1 around height y. */
function ridge(rnd: (a: number, b: number) => number, x0: number, x1: number, y: number, rise: number, n = 5): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push([lerp(x0, x1, t), y - (i % 2 === 1 ? rise * rnd(0.6, 1.2) : rise * rnd(-0.15, 0.35))])
  }
  return pts
}

/** The painting's plan: one gesture per stroke of its size, in order. */
export function planPainting(record: Pick<PaintingRecord, 'subject' | 'seed' | 'target' | 'tier' | 'level'>): Gesture[] {
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
  const layers = LAYERS[record.subject]({ rng, rnd, tier, c, wash, spatter, target: record.target })
  const counts = allocate(record.target, layers)
  const plan = layers.flatMap((layer, i) => (counts[i] > 0 ? layer.make(counts[i]) : []))
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
        dry: 0.3
      })
    }
  }
  return plan
}

interface Kit {
  rng: () => number
  rnd: (a: number, b: number) => number
  tier: number
  /** Marks per detail gesture. */
  c: number
  wash: (pts: Pt[], w: number) => Mark
  spatter: (x: number, y: number, tone?: Tone) => Mark[]
  target: number
}

/** A faint moon, the second motif from brown belt on. */
function faintMoon(k: Kit, cx: number, cy: number): Layer {
  const r = k.rnd(0.05, 0.07)
  return {
    weight: 0,
    min: 1,
    max: 1,
    make: () => [[k.wash(ring(cx, cy, r * 1.3, r * 1.25, 0, TAU), 0.03), { kind: 'stroke', pts: ring(cx, cy, r, r, -2.3, -2.3 + 5.8), w: 0.014, tone: 'soft', dry: 0.6 }]]
  }
}

/** Far hills on the horizon, the second motif for the moon. */
function farHills(k: Kit, y: number): Layer {
  return {
    weight: 0,
    min: 1,
    max: 1,
    make: () => [[k.wash(ridge(k.rnd, 0.0, 1.0, y, 0.07, 6), 0.03), { kind: 'stroke', pts: ridge(k.rnd, 0.02, 0.98, y, 0.06, 6), w: 0.03, tone: 'wash', dry: 0.75 }]]
  }
}

const LAYERS: Record<SubjectId, (k: Kit) => Layer[]> = {
  moon: (k) => {
    // The moon high on one side, reeds rising on the other.
    const moonLeft = k.rng() < 0.45
    const cx = moonLeft ? k.rnd(0.2, 0.36) : k.rnd(0.6, 0.8)
    const cy = k.rnd(0.15, 0.3)
    const r = k.rnd(0.08, 0.12)
    const h = k.rnd(0.54, 0.64)
    const layers: Layer[] = [
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => {
          const a0 = k.rnd(-2.6, -1.9)
          return [
            [
              ...(k.tier >= 1 ? [k.wash(ring(cx, cy, r * 1.35, r * 1.3, 0, TAU, 32), 0.04)] : []),
              { kind: 'stroke', pts: ring(cx, cy, r, r * 0.96, a0, a0 + k.rnd(5.5, 5.95)), w: 0.028, tone: 'ink', dry: 0.45 }
            ]
          ]
        }
      }
    ]
    if (k.tier >= 3 && k.target >= 8) layers.push(farHills(k, h - 0.02))
    layers.push(
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => [
          [
            ...(k.tier >= 1 ? [k.wash([[0.0, h + 0.01], [0.5, h + 0.02], [1.0, h + 0.01]], 0.02)] : []),
            { kind: 'stroke', pts: [[0.04, h], [0.35, h - 0.012], [0.66, h + 0.006], [0.96, h - 0.006]], w: 0.012, tone: 'wash', dry: 0.7 }
          ]
        ]
      },
      {
        weight: 1,
        min: 0,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = lerp(0.38, h - 0.08, (i + 0.5) / n) + k.rnd(-0.02, 0.02)
            const x = moonLeft ? k.rnd(0.4, 0.6) : k.rnd(0.05, 0.25)
            return [{ kind: 'stroke', pts: [[x, y], [x + 0.18, y - 0.006], [x + k.rnd(0.3, 0.42), y + 0.004]], w: 0.007, tone: 'wash', dry: 0.88, alpha: 0.7 }]
          })
      },
      {
        // Ripples, near the moon's path and sparser further out, nearer ones longer.
        weight: 3,
        min: 2,
        max: 9,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const t = i / Math.max(1, n - 1)
            return Array.from({ length: k.c + 1 }, (_, j): Mark => {
              const y = lerp(h + 0.05, 0.92, t) + k.rnd(-0.015, 0.015) + j * 0.022
              const len = lerp(0.07, 0.22, t) * k.rnd(0.7, 1.2)
              const x = clamp(cx + k.rnd(-0.3, 0.3) - len / 2, 0.03, 0.97 - len)
              return { kind: 'stroke', pts: [[x, y], [x + len * 0.5, y - 0.003], [x + len, y + 0.002]], w: k.rnd(0.007, 0.011), tone: 'soft', dry: 0.82 }
            })
          })
      },
      {
        weight: 1,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: 2 }, (_, j): Mark => {
              const y = h + 0.035 + (i * 2 + j) * 0.04
              const half = r * (0.75 - (i * 2 + j) * 0.12) * k.rnd(0.8, 1.1)
              const x = cx + k.rnd(-0.01, 0.01)
              return { kind: 'stroke', pts: [[x - half, y], [x + half, y + 0.003]], w: 0.016, tone: 'soft', dry: 0.85 }
            })
          )
      },
      {
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const base = moonLeft ? k.rnd(0.78, 0.96) : k.rnd(0.04, 0.22)
            // A clump of reeds: two blades at white belt, more with rank.
            const marks: Mark[] = Array.from({ length: k.c + 1 }, (_, j): Mark => {
              const x = base + (j - k.c / 2) * 0.022
              const top = k.rnd(0.5, 0.72)
              const lean = (moonLeft ? -1 : 1) * k.rnd(0.0, 0.06)
              return { kind: 'stroke', pts: [[x, 0.99], [x + lean * 0.4, (0.99 + top) / 2], [x + lean, top]], w: k.rnd(0.008, 0.011), tone: 'ink', dry: 0.4, shape: 'leaf' }
            })
            return [...marks, ...(i === n - 1 ? k.spatter(base, k.rnd(0.58, 0.68), 'soft') : [])]
          })
      }
    )
    return layers
  },

  bamboo: (k) => {
    const stalks = k.target <= 8 ? 1 : 1 + Math.floor(k.rng() * 3)
    const left = k.rnd(0.18, 0.45)
    const xs = Array.from({ length: stalks }, (_, i) => (stalks === 1 ? k.rnd(0.3, 0.7) : left + i * k.rnd(0.12, 0.22)))
    const tops = xs.map(() => k.rnd(0.04, 0.24))
    const leans = xs.map(() => k.rnd(-0.03, 0.03))
    /** Joints painted so far, bottom to top, where branches start. */
    const joints: Pt[] = []
    const tips: Array<{ x: number; y: number; ang: number }> = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, k.rnd(0.12, 0.25), k.rnd(0.12, 0.2)))
    layers.push(
      {
        weight: 3,
        min: 2,
        make: (n) => {
          // Segments shared across stalks, each stalk bottom to top.
          const per = allocate(n, xs.map(() => ({ weight: 1, min: 1 })))
          const out: Gesture[] = []
          xs.forEach((x0, s) => {
            const segs = per[s]
            for (let i = 0; i < segs; i++) {
              const y0 = lerp(0.99, tops[s], i / segs)
              const y1 = lerp(0.99, tops[s], (i + 1) / segs) + 0.012
              const xa = x0 + leans[s] * (1 - y0)
              const xb = x0 + leans[s] * (1 - y1)
              const w = 0.034 - (i / Math.max(1, segs)) * 0.01
              joints.push([xb, y1 - 0.006])
              out.push([
                ...(k.tier >= 1 && i === 0 ? [k.wash([[xa - 0.12, 0.985], [xa + 0.12, 0.98]], 0.02)] : []),
                { kind: 'stroke', pts: [[xa, y0], [xb, y1]], w, tone: 'ink', dry: 0.32, shape: 'stalk' },
                { kind: 'stroke', pts: [[xb - 0.018, y1 - 0.004], [xb + 0.018, y1 - 0.008]], w: 0.008, tone: 'ink', dry: 0.2 }
              ])
            }
          })
          // Leaves start at the top of each stalk that was painted.
          xs.forEach((x0, s) => {
            if (per[s] > 0) tips.push({ x: x0 + leans[s] * (1 - tops[s]), y: tops[s], ang: -Math.PI / 2 })
          })
          return out
        }
      },
      {
        weight: 1,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [jx, jy] = joints[(i * 5 + 3) % Math.max(1, joints.length)] ?? [0.5, 0.5]
            const side = i % 2 === 0 ? 1 : -1
            const len = k.rnd(0.1, 0.18)
            const ang = -Math.PI / 2 + side * k.rnd(0.6, 1.0)
            const ex = jx + Math.cos(ang) * len
            const ey = jy + Math.sin(ang) * len
            tips.push({ x: ex, y: ey, ang })
            return [{ kind: 'stroke', pts: [[jx, jy], [jx + Math.cos(ang) * len * 0.55, jy + Math.sin(ang) * len * 0.5], [ex, ey]], w: 0.008, tone: 'ink', dry: 0.5 }]
          })
      },
      {
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const tip = tips[(i * 3 + 1) % Math.max(1, tips.length)] ?? { x: 0.5, y: 0.2, ang: -Math.PI / 2 }
            const marks: Mark[] = Array.from({ length: k.c + 1 }, (_, j): Mark => {
              // Most leaves hang from where they start; a few reach up.
              const hang = k.rng() < 0.65
              const ang = hang ? k.rnd(0.35, 2.8) : k.rnd(-2.6, -0.5)
              const along = k.rnd(0, 0.035)
              const x = tip.x - Math.cos(tip.ang) * along + (j - k.c / 2) * 0.01
              const y = tip.y - Math.sin(tip.ang) * along
              return { kind: 'stroke', pts: leaf(x, y, ang, k.rnd(0.09, 0.16)), w: 0.021, tone: 'ink', dry: 0.25, shape: 'leaf' }
            })
            return [...marks, ...(i === n - 1 ? k.spatter(tip.x, tip.y, 'soft') : [])]
          })
      }
    )
    return layers
  },

  plum: (k) => {
    const flip = k.rng() < 0.5
    const X = (x: number): number => (flip ? 1 - x : x)
    // The limb: a meander in from one edge, low to high.
    const limb: Pt[] = [
      [X(0.0), k.rnd(0.82, 0.92)],
      [X(0.18), k.rnd(0.7, 0.78)],
      [X(0.34), k.rnd(0.62, 0.7)],
      [X(0.52), k.rnd(0.48, 0.56)],
      [X(0.68), k.rnd(0.36, 0.44)],
      [X(0.86), k.rnd(0.28, 0.34)]
    ]
    const along: Pt[] = []
    const ends: Pt[] = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, X(k.rnd(0.68, 0.82)), k.rnd(0.12, 0.2)))
    layers.push(
      {
        weight: 1,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const a = Math.floor((i * (limb.length - 1)) / n)
            const b = Math.max(a + 1, Math.floor(((i + 1) * (limb.length - 1)) / n))
            const pts = limb.slice(a, b + 1)
            along.push(...pts)
            return [
              ...(k.tier >= 1 ? [k.wash(pts.map(([x, y]): Pt => [x, y + 0.02]), 0.04)] : []),
              { kind: 'stroke', pts, w: 0.046 - i * 0.008, tone: 'ink', dry: 0.58 }
            ]
          })
      },
      {
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [sx, sy] = along[(i * 3 + 1) % Math.max(1, along.length)] ?? limb[2]
            const up = i % 2 === 0
            const ang = up ? -Math.PI / 2 + k.rnd(-0.6, 0.6) : k.rnd(0.2, 0.9) * (flip ? -1 : 1) + (flip ? Math.PI : 0)
            const len = k.rnd(0.12, 0.22)
            const pts: Pt[] = [
              [sx, sy],
              [sx + Math.cos(ang) * len * 0.5 + k.rnd(-0.02, 0.02), sy + Math.sin(ang) * len * 0.5],
              [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]
            ]
            along.push(pts[1], pts[2])
            ends.push(pts[2])
            return [{ kind: 'stroke', pts, w: 0.02, tone: 'ink', dry: 0.62 }]
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [sx, sy] = along[(i * 7 + 2) % Math.max(1, along.length)] ?? limb[3]
            const ang = k.rnd(-2.6, -0.5)
            const len = k.rnd(0.05, 0.1)
            const end: Pt = [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]
            ends.push(end)
            return [{ kind: 'stroke', pts: [[sx, sy], end], w: 0.009, tone: 'ink', dry: 0.68 }]
          })
      },
      {
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const marks: Mark[] = Array.from({ length: k.c }, (_, j): Mark => {
              const [bx, by] = along[(i * 5 + j * 3 + 4) % Math.max(1, along.length)] ?? limb[4]
              return { kind: 'blossom', x: bx + k.rnd(-0.02, 0.02), y: by + k.rnd(-0.025, 0.015), r: 0.016 }
            })
            const first = marks[0] as { x: number; y: number }
            return [...marks, ...(i % 3 === 2 ? k.spatter(first.x, first.y) : [])]
          })
      },
      {
        weight: 1,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c }, (_, j): Mark => {
              const [ex, ey] = ends[(i + j * 2) % Math.max(1, ends.length)] ?? limb[5]
              return { kind: 'bud', x: ex, y: ey, r: 0.007 }
            })
          )
      }
    )
    return layers
  },

  mountains: (k) => {
    const pineLeft = k.rng() < 0.4
    const pineX = pineLeft ? k.rnd(0.14, 0.3) : k.rnd(0.7, 0.86)
    const pineTop = k.rnd(0.5, 0.6)
    const apexes: Array<{ x: number; y: number; side: number }> = []
    const lines: Pt[][] = []
    const branches: Array<{ x: number; y: number; lean: number }> = []
    /** A range of peaks from x0 to x1 standing on `base`. */
    const range = (x0: number, x1: number, base: number, height: number, peaks: number): Pt[] => {
      const pts: Pt[] = [[x0, base + k.rnd(0, 0.02)]]
      for (let p = 0; p < peaks; p++) {
        const span = (x1 - x0) / peaks
        const ax = x0 + span * (p + 0.5) + k.rnd(-0.2, 0.2) * span
        const ay = base - height * k.rnd(0.65, 1)
        pts.push([x0 + span * (p + 0.2), base - height * k.rnd(0.2, 0.45)], [ax, ay])
        apexes.push({ x: ax, y: ay, side: k.rng() < 0.5 ? -1 : 1 })
        if (p < peaks - 1) pts.push([x0 + span * (p + 1), base - height * k.rnd(0.1, 0.3)])
      }
      pts.push([x1, base + k.rnd(0, 0.02)])
      lines.push(pts)
      return pts
    }
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 16) layers.push(faintMoon(k, pineLeft ? k.rnd(0.6, 0.85) : k.rnd(0.15, 0.4), k.rnd(0.09, 0.15)))
    layers.push(
      {
        // Far ranges: pale washes against the sky.
        weight: 1,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x0 = k.rnd(-0.15, 0.35)
            const pts = range(x0, x0 + k.rnd(0.6, 0.85), lerp(0.46, 0.52, i / Math.max(1, n)), k.rnd(0.16, 0.26), 2 + Math.floor(k.rng() * 2))
            return [
              { kind: 'fill', pts, depth: 0.16, tone: 'wash', alpha: 0.55 + k.tier * 0.08 },
              { kind: 'stroke', pts, w: 0.011, tone: 'wash', dry: 0.7 }
            ]
          })
      },
      {
        weight: 1,
        min: 0,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = lerp(0.5, 0.58, (i + 0.5) / n)
            const x = k.rnd(-0.05, 0.3)
            return [{ kind: 'stroke', pts: [[x, y], [x + 0.3, y - 0.01], [x + k.rnd(0.5, 0.7), y + 0.005]], w: 0.02, tone: 'wash', dry: 0.9, alpha: 0.8 }]
          })
      },
      {
        // Nearer ranges, a shade stronger.
        weight: 1,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x0 = k.rnd(-0.1, 0.55)
            const pts = range(x0, x0 + k.rnd(0.35, 0.55), lerp(0.66, 0.72, i / Math.max(1, n)), k.rnd(0.1, 0.17), 1 + Math.floor(k.rng() * 2))
            return [
              { kind: 'fill', pts, depth: 0.12, tone: 'soft', alpha: 0.4 + k.tier * 0.07 },
              { kind: 'stroke', pts, w: 0.015, tone: 'soft', dry: 0.65 }
            ]
          })
      },
      {
        // Texture strokes down the faces of the peaks, dry and short.
        weight: 2,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c + 1 }, (_, j): Mark => {
              const a = apexes[(i * 3 + j) % Math.max(1, apexes.length)] ?? { x: 0.5, y: 0.4, side: 1 }
              const down = k.rnd(0.02, 0.07)
              const x = a.x + a.side * down * k.rnd(0.6, 1.2)
              const y = a.y + down
              const len = k.rnd(0.03, 0.06)
              return { kind: 'stroke', pts: [[x, y], [x + a.side * len * 0.6, y + len]], w: 0.005, tone: 'soft', dry: 0.9 }
            })
          )
      },
      {
        // The near ground, in ink.
        weight: 1,
        min: 1,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x0 = i % 2 === 0 ? k.rnd(-0.1, 0.1) : k.rnd(0.4, 0.55)
            const pts = range(x0, x0 + k.rnd(0.45, 0.6), 0.88 + i * 0.04, k.rnd(0.03, 0.06), 2)
            return [
              ...(k.tier >= 1 ? [k.wash(pts, 0.03)] : []),
              { kind: 'fill', pts, depth: 0.12, tone: 'ink', alpha: 0.1 + k.tier * 0.03 },
              { kind: 'stroke', pts, w: 0.026, tone: 'ink', dry: 0.5 }
            ]
          })
      },
      {
        // Moss dots along the ridges.
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c + 2 }, (_, j): Mark => {
              const line = lines[(i + j) % Math.max(1, lines.length)] ?? [[0.5, 0.6]]
              const [px, py] = line[Math.floor(k.rng() * line.length)] ?? [0.5, 0.6]
              return { kind: 'bud', x: px + k.rnd(-0.03, 0.03), y: py + k.rnd(-0.01, 0.015), r: k.rnd(0.003, 0.006), tone: 'soft' }
            })
          )
      },
      {
        weight: 1,
        min: 1,
        max: 4,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            if (i === 0) {
              return [{ kind: 'stroke', pts: [[pineX, 0.98], [pineX - 0.012, 0.77], [pineX + 0.006, pineTop]], w: 0.022, tone: 'ink', dry: 0.35 }]
            }
            const y = lerp(0.82, pineTop + 0.04, i / n)
            const side = i % 2 === 0 ? 1 : -1
            const len = k.rnd(0.06, 0.1)
            const ex = pineX + side * len
            branches.push({ x: ex, y: y - 0.01, lean: side })
            return [{ kind: 'stroke', pts: [[pineX, y], [pineX + side * len * 0.5, y - 0.012], [ex, y - 0.01]], w: 0.009, tone: 'ink', dry: 0.5 }]
          })
      },
      {
        weight: 2,
        min: 1,
        make: (n) => {
          if (branches.length === 0) branches.push({ x: pineX, y: pineTop, lean: 0 })
          return Array.from({ length: n }, (_, i) => {
            const marks: Mark[] = Array.from({ length: k.c }, (_, j): Mark => {
              const b = branches[(i + j) % branches.length]
              return { kind: 'needles', x: b.x + k.rnd(-0.02, 0.02), y: b.y + k.rnd(-0.015, 0.01), r: 0.032, lean: b.lean }
            })
            return [...marks, ...(i === n - 1 ? k.spatter(pineX, pineTop, 'ink') : [])]
          })
        }
      }
    )
    return layers
  }
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
  tone === 'wash' ? c.wash : tone === 'soft' ? c.soft : tone === 'accent' ? c.accent : c.ink

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
  if (m.kind === 'fill') {
    // A wash under a ridgeline, fading down: the body of a range of hills.
    const top = Math.min(...m.pts.map((p) => p[1])) * h
    const bottom = (Math.max(...m.pts.map((p) => p[1])) + m.depth) * h
    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    const rgb = toneColor(m.tone, c)
    grad.addColorStop(0, rgba(rgb, m.alpha * k))
    grad.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    m.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    ctx.lineTo(m.pts[m.pts.length - 1][0] * w, bottom)
    ctx.lineTo(m.pts[0][0] * w, bottom)
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

/** The seal a finished painting gets: an ember square, the ensō pill
 *  carved out of it. k stamps it in. */
export function paintSeal(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, c: PaintingColors): void {
  if (k <= 0) return
  const s = w * 0.07 * (0.6 + 0.4 * Math.min(1, k))
  const x = w * 0.9 - s / 2
  const y = h * 0.86 - s / 2
  ctx.save()
  ctx.globalAlpha = Math.min(1, k * 1.4)
  ctx.fillStyle = rgba(c.accent)
  ctx.beginPath()
  ctx.roundRect(x, y, s, s, s * 0.12)
  ctx.fill()
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
  opts: { done: number; live?: number; seal?: number; seed: number }
): void {
  ctx.fillStyle = rgba(c.ground)
  ctx.fillRect(0, 0, w, h)
  const done = Math.min(opts.done, plan.length)
  for (let g = 0; g < done; g++) {
    const k = g === done - 1 && opts.live !== undefined ? opts.live : 1
    const marks = plan[g]
    const weight = strokeWeight(words[g])
    marks.forEach((m, j) => paintMark(ctx, m, w, h, weight, clamp(k * marks.length - j, 0, 1), c, opts.seed + g * 13 + j))
  }
  if (opts.seal && opts.seal > 0) paintSeal(ctx, w, h, opts.seal, c)
}

/** What the painting is called so far: the subject stays a surprise
 *  for its first two strokes. */
export function paintingCaption(subject: SubjectId, done: number, target: number): string {
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
  says: { date: string; title: string; caption: string; line: string | null },
  opts: { done: number; finished: boolean; seed: number }
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
  paintPainting(ctx, pw, ph, plan, words, c, { done: opts.done, seal: opts.finished ? 1 : 0, seed: opts.seed })
  ctx.restore()
  let y = 70 + ph + 64
  ctx.fillStyle = rgba(ink.text)
  ctx.font = `800 46px ${fonts.display}`
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'condensed'
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
  ctx.font = `11px ${fonts.mono}`
  ctx.fillStyle = rgba(ink.dim)
  ctx.fillText('painted one take at a time', pad, H - 34)
  ctx.textAlign = 'right'
  ctx.fillText('murmurapp.app', W - pad, H - 34)
  ctx.textAlign = 'left'
}
