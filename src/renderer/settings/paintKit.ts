// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (US-098): the shared kit the subjects paint with. A
// subject is a list of layers in a painter's order; each layer makes as
// many gestures (one per take) as the day's size gives it, from marks in
// coordinates 0 to 1 across a 4:3 ground. Tiers make gestures richer.

import { lerp } from '../brush'

export type Tone = 'ink' | 'soft' | 'wash' | 'accent' | 'gold'
export type Pt = [number, number]

export type Mark =
  | { kind: 'stroke'; pts: Pt[]; w: number; tone: Tone; dry: number; shape?: 'leaf' | 'stalk'; alpha?: number }
  | { kind: 'blossom'; x: number; y: number; r: number }
  | { kind: 'bud'; x: number; y: number; r: number; tone?: Tone }
  | { kind: 'fill'; pts: Pt[]; depth: number; tone: Tone; alpha: number }
  /** A closed shape filled flat: a lotus pad, a rock, a cliff. */
  | { kind: 'blot'; pts: Pt[]; tone: Tone; alpha: number }
  | { kind: 'needles'; x: number; y: number; r: number; lean: number }
  | { kind: 'splat'; x: number; y: number; r: number; dir: number | null; tone: Tone; count: number }

/** One take's worth of paint: a mark, or at higher tiers a few. */
export type Gesture = Mark[]

export interface LayerShare {
  weight: number
  min: number
  max?: number
}

export interface Layer extends LayerShare {
  make: (count: number) => Gesture[]
}

export const TAU = Math.PI * 2

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

/** Marks per detail gesture: one at white and blue belt, two at purple, three at brown, four at black, so every belt from purple paints more. */
export const clusterFor = (tier: number): number => [1, 1, 2, 3, 4][Math.max(0, Math.min(4, Math.round(tier)))]

export function ring(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 26): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

export function leaf(x: number, y: number, ang: number, len: number): Pt[] {
  return [
    [x, y],
    [x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - 0.004],
    [x + Math.cos(ang) * len, y + Math.sin(ang) * len]
  ]
}

/** A ridgeline across the ground from x0 to x1 around height y. */
export function ridge(rnd: (a: number, b: number) => number, x0: number, x1: number, y: number, rise: number, n = 5): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push([lerp(x0, x1, t), y - (i % 2 === 1 ? rise * rnd(0.6, 1.2) : rise * rnd(-0.15, 0.35))])
  }
  return pts
}

export interface Kit {
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
export function faintMoon(k: Kit, cx: number, cy: number): Layer {
  const r = k.rnd(0.05, 0.07)
  return {
    weight: 0,
    min: 1,
    max: 1,
    make: () => [[k.wash(ring(cx, cy, r * 1.3, r * 1.25, 0, TAU), 0.03), { kind: 'stroke', pts: ring(cx, cy, r, r, -2.3, -2.3 + 5.8), w: 0.014, tone: 'soft', dry: 0.6 }]]
  }
}

/** Far hills on the horizon, the second motif for the moon. */
export function farHills(k: Kit, y: number): Layer {
  return {
    weight: 0,
    min: 1,
    max: 1,
    make: () => [[k.wash(ridge(k.rnd, 0.0, 1.0, y, 0.07, 6), 0.03), { kind: 'stroke', pts: ridge(k.rnd, 0.02, 0.98, y, 0.06, 6), w: 0.03, tone: 'wash', dry: 0.75 }]]
  }
}

/** A mark mirrored left to right. */
export function mirrorMark(m: Mark): Mark {
  switch (m.kind) {
    case 'stroke':
    case 'fill':
    case 'blot':
      return { ...m, pts: m.pts.map(([x, y]): Pt => [1 - x, y]) }
    case 'needles':
      return { ...m, x: 1 - m.x, lean: -m.lean }
    case 'splat':
      return { ...m, x: 1 - m.x, dir: m.dir === null ? null : Math.PI - m.dir }
    default:
      return { ...m, x: 1 - m.x }
  }
}

/** A subject's layers mirrored left to right, so it can face either way. */
export function mirrored(layers: readonly Layer[]): Layer[] {
  return layers.map((layer) => ({ ...layer, make: (n: number) => layer.make(n).map((g) => g.map(mirrorMark)) }))
}
