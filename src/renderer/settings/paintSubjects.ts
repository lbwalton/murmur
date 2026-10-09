// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (US-098): the subjects. Each is a recipe of layers in
// the order a painter works (the sky before the water, the stalk before
// its leaves, the far before the near), with seeded geometry, so the
// same subject is laid out differently every day. Higher tiers add
// washes, splatter, a second motif, and more marks per stroke. Drawn
// only by code: landscapes, plants, water, and marks, never figures.
import { clamp, lerp } from '../brush'
import type { SubjectId } from '../../shared/painting'
import { type Gesture, type Kit, type Layer, type Mark, type Pt, TAU, allocate, farHills, faintMoon, leaf, mirrored, ridge, ring } from './paintKit'

export const LAYERS: Record<SubjectId, (k: Kit) => Layer[]> = {
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
            return [...marks, ...(i % 3 === 2 || i === n - 1 ? k.spatter(first.x, first.y) : [])]
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
  },

  pine: (k) => {
    // A pine growing out over the drop from a cliff on one side.
    const fromLeft = k.rng() < 0.5
    const X = (x: number): number => (fromLeft ? x : 1 - x)
    const tipX = k.rnd(0.36, 0.46)
    const tipY = k.rnd(0.46, 0.56)
    const cliff: Pt[] = [
      [X(0), k.rnd(0.3, 0.4)],
      [X(tipX * 0.55), tipY - k.rnd(0.06, 0.12)],
      [X(tipX), tipY],
      [X(tipX - 0.04), tipY + 0.1],
      [X(tipX * 0.7), 0.82],
      [X(tipX * 0.6), 1.02],
      [X(0), 1.02]
    ]
    const dir = fromLeft ? 1 : -1
    const trunk: Pt[] = [
      [X(tipX - 0.05), tipY - 0.02],
      [X(tipX + 0.08), tipY - k.rnd(0.12, 0.18)],
      [X(tipX + 0.2), tipY - k.rnd(0.1, 0.16)],
      [X(tipX + k.rnd(0.32, 0.4)), tipY - k.rnd(0.2, 0.28)]
    ]
    const ends: Pt[] = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, X(k.rnd(0.68, 0.84)), k.rnd(0.12, 0.2)))
    layers.push(
      {
        weight: 1,
        min: 0,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = lerp(0.62, 0.8, (i + 0.5) / n)
            const x = X(k.rnd(0.45, 0.6))
            return [{ kind: 'stroke', pts: [[x, y], [x + dir * 0.2, y - 0.006], [x + dir * k.rnd(0.3, 0.42), y + 0.004]], w: 0.02, tone: 'wash', dry: 0.9, alpha: 0.75 }]
          })
      },
      {
        weight: 0.5,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            if (i === 0) {
              return [
                { kind: 'blot', pts: cliff, tone: 'soft', alpha: 0.32 + k.tier * 0.06 },
                ...(k.tier >= 1 ? [k.wash(cliff.slice(0, 4), 0.03)] : []),
                { kind: 'stroke', pts: cliff.slice(0, 4), w: 0.02, tone: 'ink', dry: 0.6 }
              ]
            }
            return [{ kind: 'stroke', pts: i === 1 ? cliff.slice(2, 6) : [cliff[1], [X(tipX * 0.4), 0.7], [X(tipX * 0.35), 0.95]], w: 0.016, tone: 'ink', dry: 0.65 }]
          })
      },
      {
        // Texture down the rock, and moss along its edge.
        weight: 2,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () =>
            Array.from({ length: k.c + 2 }, (_, j): Mark => {
              const y = k.rnd(tipY + 0.02, 0.95)
              const x = X(k.rnd(0.03, tipX * 0.65))
              return j % 3 === 2
                ? { kind: 'bud', x: X(k.rnd(0.05, tipX)), y: tipY - k.rnd(0.0, 0.12), r: k.rnd(0.003, 0.005), tone: 'soft' }
                : { kind: 'stroke', pts: [[x, y], [x + dir * 0.012, y + k.rnd(0.03, 0.06)]], w: 0.005, tone: 'soft', dry: 0.9 }
            })
          )
      },
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => [[{ kind: 'stroke', pts: trunk, w: 0.03, tone: 'ink', dry: 0.45 }]]
      },
      {
        weight: 1,
        min: 1,
        max: 6,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [sx, sy] = trunk[1 + (i % 3)]
            const up = i % 2 === 0 ? -1 : 0.3
            const end: Pt = [sx + dir * k.rnd(0.06, 0.14), sy + up * k.rnd(0.03, 0.07)]
            ends.push(end)
            return [{ kind: 'stroke', pts: [[sx, sy], [(sx + end[0]) / 2, (sy + end[1]) / 2 - 0.01], end], w: 0.009, tone: 'ink', dry: 0.5 }]
          })
      },
      {
        weight: 3,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const spots = [...ends, trunk[3]]
            const marks: Mark[] = Array.from({ length: k.c }, (_, j): Mark => {
              const [x, y] = spots[(i + j) % spots.length]
              return { kind: 'needles', x: x + k.rnd(-0.02, 0.02), y: y + k.rnd(-0.015, 0.01), r: 0.036, lean: dir }
            })
            return [...marks, ...(i === n - 1 ? k.spatter(trunk[3][0], trunk[3][1], 'ink') : [])]
          })
      }
    )
    return layers
  },

  orchid: (k) => {
    const bx = k.rnd(0.32, 0.6)
    const by = 0.9
    const tips: Pt[] = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, k.rnd(0.7, 0.85), k.rnd(0.12, 0.2)))
    layers.push(
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => {
          const rock: Pt[] = [[bx - 0.12, 0.98], [bx - 0.1, 0.88], [bx - 0.02, 0.85], [bx + 0.08, 0.87], [bx + 0.13, 0.98]]
          return [
            [
              ...(k.tier >= 1 ? [k.wash([[bx - 0.2, 0.97], [bx, 0.95], [bx + 0.2, 0.97]], 0.025)] : []),
              { kind: 'blot', pts: rock, tone: 'soft', alpha: 0.28 + k.tier * 0.06 },
              { kind: 'stroke', pts: rock.slice(0, 4), w: 0.014, tone: 'ink', dry: 0.7 }
            ]
          ]
        }
      },
      {
        // Long leaves sweeping out from the clump, one or two crossing.
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c }, (_, j): Mark => {
              const side = (i + j) % 2 === 0 ? -1 : 1
              const reach = k.rnd(0.22, 0.45) * side
              const rise = k.rnd(0.3, 0.6)
              const droop = k.rnd(0.0, 0.18)
              return {
                kind: 'stroke',
                pts: [
                  [bx + side * 0.01, by],
                  [bx + reach * 0.35, by - rise * 0.75],
                  [bx + reach * 0.75, by - rise],
                  [bx + reach, by - rise + droop]
                ],
                w: k.rnd(0.011, 0.016),
                tone: 'ink',
                dry: 0.3,
                shape: 'leaf'
              }
            })
          )
      },
      {
        weight: 1,
        min: 1,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const lean = (i - (n - 1) / 2) * 0.08 + k.rnd(-0.04, 0.04)
            const top: Pt = [bx + lean, k.rnd(0.38, 0.55)]
            tips.push(top, [bx + lean * 0.7, (top[1] + by) / 2])
            return [{ kind: 'stroke', pts: [[bx, by - 0.02], [bx + lean * 0.5, (top[1] + by) / 2], top], w: 0.006, tone: 'ink', dry: 0.5 }]
          })
      },
      {
        // Blooms: a few petals round a dot of color.
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [x, y] = tips[i % Math.max(1, tips.length)] ?? [bx, 0.5]
            const petals: Mark[] = Array.from({ length: 4 + k.c }, (_, p): Mark => {
              const ang = -Math.PI / 2 + (p - (3 + k.c) / 2) * 0.7 + k.rnd(-0.15, 0.15)
              return { kind: 'stroke', pts: leaf(x, y, ang, k.rnd(0.03, 0.05)), w: 0.01, tone: 'ink', dry: 0.2, shape: 'leaf' }
            })
            return [...petals, { kind: 'bud', x, y, r: 0.005, tone: 'accent' }, ...(i === n - 1 ? k.spatter(x, y, 'soft') : [])]
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [x, y] = tips[(i * 2 + 1) % Math.max(1, tips.length)] ?? [bx, 0.6]
            return Array.from({ length: k.c }, (_, j): Mark => ({ kind: 'bud', x: x + (j - 0.5) * 0.015, y: y + 0.02 + j * 0.01, r: 0.004, tone: 'accent' }))
          })
      }
    )
    return layers
  },

  chrysanthemum: (k) => {
    const heads = k.target < 10 ? 1 : 1 + Math.floor(k.rng() * 3)
    const centers: Pt[] = Array.from({ length: heads }, (_, i) => [lerp(0.3, 0.7, heads === 1 ? 0.5 : i / (heads - 1)) + k.rnd(-0.05, 0.05), k.rnd(0.22, 0.42)])
    const rings = centers.map(() => 0)
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, k.rnd(0.12, 0.25), k.rnd(0.1, 0.16)))
    layers.push(
      {
        // One stem for every head.
        weight: 0,
        min: heads,
        max: heads,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            const [cx, cy] = centers[i % heads]
            const foot = cx + k.rnd(-0.08, 0.08)
            return [
              ...(k.tier >= 1 && i === 0 ? [k.wash([[0.12, 0.98], [0.5, 0.96], [0.88, 0.98]], 0.025)] : []),
              { kind: 'stroke', pts: [[foot, 0.99], [(foot + cx) / 2 + k.rnd(-0.04, 0.04), (0.99 + cy) / 2], [cx, cy + 0.03]], w: 0.008, tone: 'ink', dry: 0.5 }
            ]
          })
      },
      {
        // Leaves along the stems: broad, in ink and wash.
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [cx, cy] = centers[i % heads]
            const y = lerp(cy + 0.15, 0.9, k.rng())
            return Array.from({ length: k.c + 1 }, (_, j): Mark => {
              const ang = (j % 2 === 0 ? 0.3 : Math.PI - 0.3) + k.rnd(-0.4, 0.4)
              return { kind: 'stroke', pts: leaf(cx + k.rnd(-0.02, 0.02), y, ang, k.rnd(0.06, 0.1)), w: 0.03, tone: j === 0 ? 'ink' : 'wash', dry: 0.35, shape: 'leaf' }
            })
          })
      },
      {
        // Flower heads: each stroke adds a ring of petals, outer to inner.
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const h = i % heads
            const [cx, cy] = centers[h]
            const ring = rings[h]++
            const len = Math.max(0.018, 0.075 - ring * 0.012)
            const count = 7 + k.c * 2
            const turn = k.rng()
            return [
              ...Array.from({ length: count }, (_, p): Mark => {
                const ang = ((p + turn) / count) * TAU
                const x0 = cx + Math.cos(ang) * len * 0.25
                const y0 = cy + Math.sin(ang) * len * 0.22
                return {
                  kind: 'stroke',
                  pts: [[x0, y0], [cx + Math.cos(ang + 0.15) * len * 0.7, cy + Math.sin(ang + 0.15) * len * 0.6], [cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.85]],
                  w: 0.006,
                  tone: ring % 2 === 0 ? 'gold' : 'accent',
                  dry: 0.25
                }
              }),
              ...(i === n - 1 ? k.spatter(cx, cy, 'gold') : [])
            ]
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () =>
            Array.from({ length: k.c + 1 }, (): Mark => {
              const x = k.rnd(0.15, 0.85)
              const y = k.rnd(0.88, 0.97)
              return { kind: 'stroke', pts: leaf(x, y, k.rnd(0, TAU), 0.02), w: 0.006, tone: 'gold', dry: 0.3, shape: 'leaf' }
            })
          )
      }
    )
    return layers
  },

  lotus: (k) => {
    const h = k.rnd(0.55, 0.62)
    const pads: Array<{ x: number; y: number; rx: number }> = []
    const blooms: Pt[] = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(farHills(k, h - 0.02))
    layers.push(
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => [
          [
            ...(k.tier >= 1 ? [k.wash([[0.0, h + 0.012], [0.5, h + 0.02], [1.0, h + 0.012]], 0.02)] : []),
            { kind: 'stroke', pts: [[0.03, h], [0.4, h - 0.008], [0.7, h + 0.006], [0.97, h - 0.004]], w: 0.012, tone: 'wash', dry: 0.75 }
          ]
        ]
      },
      {
        // Pads floating on the water: a wash shape, its rim, its veins.
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x = k.rnd(0.12, 0.88)
            const y = lerp(h + 0.08, 0.92, (i + k.rng()) / n)
            const rx = k.rnd(0.07, 0.13) * lerp(0.7, 1.2, (y - h) / (1 - h))
            const ry = rx * 0.28
            pads.push({ x, y, rx })
            const a0 = k.rnd(0, TAU)
            return [
              { kind: 'blot', pts: ring(x, y, rx, ry, a0, a0 + TAU * 0.92, 24), tone: 'wash', alpha: 0.55 + k.tier * 0.06 },
              { kind: 'stroke', pts: ring(x, y, rx, ry, a0, a0 + TAU * 0.92, 24), w: 0.006, tone: 'soft', dry: 0.6 },
              ...Array.from({ length: k.c + 1 }, (_, v): Mark => {
                const ang = a0 + (v / (k.c + 1)) * TAU
                return { kind: 'stroke', pts: [[x, y], [x + Math.cos(ang) * rx * 0.8, y + Math.sin(ang) * ry * 0.8]], w: 0.003, tone: 'soft', dry: 0.8 }
              })
            ]
          })
      },
      {
        weight: 1,
        min: 1,
        max: 4,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x = k.rnd(0.2, 0.8)
            const top: Pt = [x + k.rnd(-0.05, 0.05), k.rnd(0.22, 0.42) + i * 0.05]
            blooms.push(top)
            return [{ kind: 'stroke', pts: [[x, h + 0.02], [(x + top[0]) / 2 + 0.01, (h + top[1]) / 2], top], w: 0.006, tone: 'ink', dry: 0.5 }]
          })
      },
      {
        // Blooms: cupped petals in the accent, around a gold heart. Past
        // one per stem, new buds rise on short stems instead.
        weight: 2,
        min: 1,
        max: 7,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            if (i >= blooms.length && blooms.length > 0) {
              const x = k.rnd(0.12, 0.88)
              const top = h - k.rnd(0.06, 0.14)
              return [
                { kind: 'stroke', pts: [[x, h + 0.015], [x + 0.005, top]], w: 0.005, tone: 'ink', dry: 0.5 },
                { kind: 'stroke', pts: leaf(x + 0.005, top + 0.012, -Math.PI / 2, 0.028), w: 0.016, tone: 'accent', dry: 0.25, shape: 'leaf', alpha: 0.85 },
                ...(i === n - 1 ? k.spatter(x, top, 'accent') : [])
              ]
            }
            const [x, y] = blooms[i % Math.max(1, blooms.length)] ?? [0.5, 0.35]
            const petals: Mark[] = Array.from({ length: 4 + k.c }, (_, p): Mark => {
              const ang = -Math.PI / 2 + (p - (3 + k.c) / 2) * 0.45
              return { kind: 'stroke', pts: leaf(x, y + 0.02, ang, k.rnd(0.045, 0.065)), w: 0.022, tone: 'accent', dry: 0.25, shape: 'leaf', alpha: 0.85 }
            })
            return [...petals, { kind: 'bud', x, y: y + 0.005, r: 0.006, tone: 'gold' }, ...(i === n - 1 ? k.spatter(x, y, 'accent') : [])]
          })
      },
      {
        weight: 2,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () =>
            Array.from({ length: k.c + 1 }, (): Mark => {
              const y = k.rnd(h + 0.04, 0.96)
              const len = k.rnd(0.06, 0.16)
              const x = k.rnd(0.03, 0.97 - len)
              return { kind: 'stroke', pts: [[x, y], [x + len, y + 0.003]], w: 0.006, tone: 'soft', dry: 0.85 }
            })
          )
      }
    )
    return layers
  },

  waterfall: (k) => {
    const gap = k.rnd(0.4, 0.58)
    const width = k.rnd(0.1, 0.16)
    const top = k.rnd(0.12, 0.22)
    const pool = k.rnd(0.76, 0.82)
    /** A cliff face down one side of the falls, rough-edged. */
    const cliff = (side: -1 | 1): Pt[] => {
      const edge = gap + (side * width) / 2
      const out = (d: number): number => edge + side * d
      const pts: Pt[] = [[side < 0 ? -0.02 : 1.02, k.rnd(0.04, 0.12)], [out(k.rnd(0.1, 0.16)), top - k.rnd(0.02, 0.07)], [out(k.rnd(0.03, 0.06)), top - 0.01], [edge, top + 0.02]]
      for (const t of [0.25, 0.5, 0.75]) pts.push([out(k.rnd(0.0, 0.035) + t * 0.03), lerp(top, pool, t)])
      pts.push([out(k.rnd(0.06, 0.1)), pool], [side < 0 ? -0.02 : 1.02, pool + k.rnd(0.02, 0.07)])
      return pts
    }
    const left = cliff(-1)
    const right = cliff(1)
    const layers: Layer[] = []
    // Its second motif is mist drifting across the falls.
    if (k.tier >= 3 && k.target >= 10) {
      const y = lerp(top, pool, k.rnd(0.35, 0.55))
      layers.push({
        weight: 0,
        min: 1,
        max: 1,
        make: () => [[k.wash([[gap - 0.42, y], [gap, y - 0.015], [gap + 0.42, y + 0.005]], 0.035), k.wash([[gap - 0.3, y + 0.05], [gap + 0.32, y + 0.045]], 0.025)]]
      })
    }
    layers.push(
      {
        weight: 0.5,
        min: 2,
        max: 4,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            const side = i % 2 === 0 ? left : right
            if (i < 2) {
              return [
                { kind: 'blot', pts: side, tone: 'soft', alpha: 0.26 + k.tier * 0.06 },
                ...(k.tier >= 1 ? [k.wash(side.slice(1, 8), 0.03)] : []),
                { kind: 'stroke', pts: side.slice(1, 8), w: 0.016, tone: 'ink', dry: 0.65 }
              ]
            }
            return [{ kind: 'stroke', pts: side.slice(0, 3), w: 0.012, tone: 'ink', dry: 0.7 }]
          })
      },
      {
        // The falling water: long dry streaks down the gap.
        weight: 3,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, () =>
            Array.from({ length: k.c + 1 }, (): Mark => {
              const x = gap + k.rnd(-width / 2 + 0.01, width / 2 - 0.01)
              const y0 = top + k.rnd(0, 0.06)
              const y1 = pool - k.rnd(0, 0.05)
              return { kind: 'stroke', pts: [[x, y0], [x + k.rnd(-0.008, 0.008), (y0 + y1) / 2], [x + k.rnd(-0.01, 0.01), y1]], w: k.rnd(0.005, 0.01), tone: 'ink', dry: 0.88 }
            })
          )
      },
      {
        weight: 1,
        min: 0,
        max: 3,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = pool + 0.01 + i * 0.03
            return [{ kind: 'stroke', pts: [[gap - 0.3, y], [gap, y - 0.01], [gap + 0.3, y]], w: 0.03, tone: 'wash', dry: 0.92, alpha: 0.7 }]
          })
      },
      {
        // The pool's ripples; splatter rides the last one.
        weight: 1,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => [
            ...Array.from({ length: k.c + 1 }, (): Mark => {
              const y = k.rnd(pool + 0.06, 0.97)
              const len = k.rnd(0.08, 0.2)
              const x = clamp(gap + k.rnd(-0.3, 0.3) - len / 2, 0.02, 0.98 - len)
              return { kind: 'stroke', pts: [[x, y], [x + len, y + 0.003]], w: 0.007, tone: 'soft', dry: 0.85 }
            }),
            ...(i === n - 1 ? k.spatter(gap, pool, 'soft') : [])
          ])
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c + 1 }, (): Mark => {
              const side = i % 2 === 0 ? left : right
              const [ax, ay] = side[5]
              const x = ax + (side === left ? -1 : 1) * k.rnd(0.02, 0.15)
              const y = k.rnd(top + 0.05, ay)
              return { kind: 'stroke', pts: [[x, y], [x + (side === left ? -0.01 : 0.01), y + k.rnd(0.03, 0.06)]], w: 0.005, tone: 'soft', dry: 0.9 }
            })
          )
      },
      {
        // Small pines along the cliff tops.
        weight: 1,
        min: 0,
        max: 4,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            const side = i % 2 === 0 ? left : right
            const [x, y] = side[1]
            const tx = x + (side === left ? -1 : 1) * k.rnd(0.0, 0.06) * i
            return [
              { kind: 'stroke', pts: [[tx, y + 0.01], [tx + 0.003, y - 0.045]], w: 0.007, tone: 'ink', dry: 0.4 },
              { kind: 'needles', x: tx, y: y - 0.04, r: 0.018, lean: 0 },
              { kind: 'needles', x: tx, y: y - 0.02, r: 0.02, lean: side === left ? -1 : 1 },
            ]
          })
      }
    )
    return layers
  },

  willow: (k) => {
    const fromLeft = k.rng() < 0.5
    const X = (x: number): number => (fromLeft ? x : 1 - x)
    const bank = k.rnd(0.78, 0.86)
    const base: Pt = [X(k.rnd(0.18, 0.3)), bank]
    const crown: Pt = [X(k.rnd(0.38, 0.5)), k.rnd(0.12, 0.2)]
    const forks: Pt[] = [crown]
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, X(k.rnd(0.68, 0.85)), k.rnd(0.12, 0.2)))
    layers.push(
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => [
          [
            { kind: 'stroke', pts: [[X(0), bank + 0.02], [X(0.25), bank - 0.01], [X(0.55), bank + 0.01]], w: 0.024, tone: 'ink', dry: 0.5 },
            { kind: 'stroke', pts: [[X(0.5), bank + 0.03], [X(1.0), bank + 0.02]], w: 0.01, tone: 'wash', dry: 0.75 }
          ]
        ]
      },
      {
        weight: 0.3,
        min: 1,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture =>
            i === 0
              ? [
                  ...(k.tier >= 1 ? [k.wash([base, [(base[0] + crown[0]) / 2, 0.5], crown], 0.03)] : []),
                  { kind: 'stroke', pts: [base, [(base[0] + crown[0]) / 2 - 0.03, 0.5], crown], w: 0.036, tone: 'ink', dry: 0.5 }
                ]
              : [{ kind: 'stroke', pts: [[base[0], bank + 0.04], [base[0] + 0.01, bank + 0.15]], w: 0.02, tone: 'soft', dry: 0.85 }]
          )
      },
      {
        weight: 1,
        min: 1,
        max: 5,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const t = 0.35 + 0.6 * (i / Math.max(1, n))
            const sx = lerp(base[0], crown[0], t)
            const sy = lerp(base[1], crown[1], t)
            const end: Pt = [sx + (fromLeft ? 1 : -1) * k.rnd(0.12, 0.25) * (i % 2 === 0 ? 1 : -0.6), sy - k.rnd(0.02, 0.1)]
            forks.push(end)
            return [{ kind: 'stroke', pts: [[sx, sy], [(sx + end[0]) / 2, Math.min(sy, end[1]) - 0.03], end], w: 0.012, tone: 'ink', dry: 0.55 }]
          })
      },
      {
        // Strands hanging from the branches, leaves along them.
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [fx, fy] = forks[i % forks.length]
            return Array.from({ length: k.c + 1 }, (_, j): Mark[] => {
              const x0 = fx + k.rnd(-0.04, 0.04)
              const drop = Math.min(k.rnd(0.3, 0.55), 0.95 - fy)
              const sway = k.rnd(-0.04, 0.04)
              const pts: Pt[] = [[x0, fy], [x0 + sway * 0.5, fy + drop * 0.5], [x0 + sway, fy + drop]]
              const leaves: Mark[] = Array.from({ length: 3 }, (_, l): Mark => {
                const t = 0.4 + l * 0.22
                const x = lerp(x0, x0 + sway, t)
                const y = lerp(fy, fy + drop, t)
                return { kind: 'stroke', pts: leaf(x, y, Math.PI / 2 + (l % 2 === 0 ? 0.6 : -0.6), 0.02), w: 0.006, tone: 'ink', dry: 0.3, shape: 'leaf' }
              })
              return j === 0 && i === n - 1 ? [{ kind: 'stroke', pts, w: 0.0035, tone: 'ink', dry: 0.6 }, ...leaves, ...k.spatter(x0 + sway, fy + drop, 'soft')] : [{ kind: 'stroke', pts, w: 0.0035, tone: 'ink', dry: 0.6 }, ...leaves]
            }).flat()
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () =>
            Array.from({ length: k.c + 1 }, (): Mark => {
              const y = k.rnd(bank + 0.05, 0.98)
              const len = k.rnd(0.06, 0.18)
              const x = X(k.rnd(0.35, 0.95 - len))
              return { kind: 'stroke', pts: [[x, y], [x + (fromLeft ? len : -len), y + 0.002]], w: 0.006, tone: 'soft', dry: 0.85 }
            })
          )
      }
    )
    return layers
  },

  boat: (k) => {
    const shore = k.rnd(0.42, 0.5)
    const bx = k.rnd(0.32, 0.68)
    const by = k.rnd(0.62, 0.7)
    const reedsLeft = bx > 0.5
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, reedsLeft ? k.rnd(0.6, 0.82) : k.rnd(0.18, 0.4), k.rnd(0.1, 0.18)))
    layers.push(
      {
        weight: 1,
        min: 1,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x0 = i === 0 ? k.rnd(-0.1, 0.1) : k.rnd(0.4, 0.6)
            const pts = ridge(k.rnd, x0, x0 + k.rnd(0.45, 0.6), shore + i * 0.02, k.rnd(0.04, 0.08), 4)
            return [
              ...(k.tier >= 1 ? [k.wash(pts, 0.025)] : []),
              { kind: 'fill', pts, depth: 0.05, tone: 'wash', alpha: 0.5 + k.tier * 0.08 },
              { kind: 'stroke', pts, w: 0.012, tone: 'wash', dry: 0.7 }
            ]
          })
      },
      {
        weight: 1,
        min: 0,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = shore + 0.05 + i * 0.04
            const x = k.rnd(0.0, 0.4)
            return [{ kind: 'stroke', pts: [[x, y], [x + 0.3, y - 0.004], [x + k.rnd(0.45, 0.6), y + 0.004]], w: 0.016, tone: 'wash', dry: 0.9, alpha: 0.7 }]
          })
      },
      {
        // The boat: a low hull, a little arched cover, a pole.
        weight: 0,
        min: 1,
        max: 1,
        make: () => [
          [
            { kind: 'stroke', pts: [[bx - 0.1, by - 0.012], [bx - 0.04, by + 0.012], [bx + 0.05, by + 0.012], [bx + 0.11, by - 0.016]], w: 0.016, tone: 'ink', dry: 0.35 },
            { kind: 'stroke', pts: ring(bx - 0.005, by - 0.004, 0.038, 0.03, Math.PI, TAU, 12), w: 0.01, tone: 'ink', dry: 0.4 },
            { kind: 'stroke', pts: [[bx + 0.07, by - 0.004], [bx + 0.13, by - 0.12]], w: 0.004, tone: 'ink', dry: 0.5 }
          ]
        ]
      },
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => [
          Array.from({ length: 3 }, (_, j): Mark => {
            const y = by + 0.03 + j * 0.025
            const half = 0.09 - j * 0.02
            return { kind: 'stroke', pts: [[bx - half, y], [bx + half, y + 0.002]], w: 0.008, tone: 'soft', dry: 0.85 }
          })
        ]
      },
      {
        // Ripples spreading from the boat; splatter rides the last one.
        weight: 3,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => [
            ...Array.from({ length: k.c + 1 }, (): Mark => {
              const y = lerp(by + 0.04, 0.95, (i + k.rng()) / n)
              const len = lerp(0.08, 0.24, (y - by) / (1 - by))
              const x = clamp(bx + k.rnd(-0.4, 0.4) - len / 2, 0.02, 0.98 - len)
              return { kind: 'stroke', pts: [[x, y], [x + len * 0.5, y - 0.003], [x + len, y + 0.002]], w: k.rnd(0.006, 0.01), tone: 'soft', dry: 0.82 }
            }),
            ...(i === n - 1 ? k.spatter(bx + 0.12, by - 0.02, 'soft') : [])
          ])
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () => {
            const base = reedsLeft ? k.rnd(0.03, 0.18) : k.rnd(0.82, 0.97)
            return [
              ...Array.from({ length: k.c + 1 }, (_, j): Mark => {
                const x = base + (j - k.c / 2) * 0.02
                const topY = k.rnd(0.62, 0.78)
                const lean = (reedsLeft ? 1 : -1) * k.rnd(0, 0.05)
                return { kind: 'stroke', pts: [[x, 0.99], [x + lean * 0.4, (0.99 + topY) / 2], [x + lean, topY]], w: 0.008, tone: 'ink', dry: 0.4, shape: 'leaf' }
              })
            ]
          })
      }
    )
    return layers
  },

  wave: (k) => {
    // Half the waves break the other way.
    const flip = k.rng() < 0.5
    const cx = k.rnd(0.42, 0.62)
    const crestY = k.rnd(0.22, 0.32)
    const curl: Pt[] = [
      [0.02, 0.78],
      [0.18, 0.66],
      [cx - 0.16, 0.46],
      [cx - 0.06, crestY + 0.04],
      ...ring(cx + 0.04, crestY + 0.09, 0.1, 0.08, -Math.PI * 0.9, Math.PI * 0.35, 14)
    ]
    const lip = curl.slice(3)
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, k.rnd(0.72, 0.88), k.rnd(0.1, 0.16)))
    layers.push(
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => {
          const px = k.rnd(0.7, 0.85)
          const peak: Pt[] = [[px - 0.09, 0.66], [px, 0.56], [px + 0.09, 0.66]]
          return [[{ kind: 'blot', pts: peak, tone: 'wash', alpha: 0.55 }, { kind: 'stroke', pts: peak, w: 0.008, tone: 'soft', dry: 0.7 }]]
        }
      },
      {
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const y = lerp(0.7, 0.95, (i + 0.5) / n)
            const x = k.rnd(-0.05, 0.3)
            const pts: Pt[] = [[x, y], [x + 0.25, y - 0.04], [x + 0.5, y + 0.01], [x + k.rnd(0.7, 0.9), y - 0.02]]
            return [...(k.tier >= 1 ? [k.wash(pts, 0.02)] : []), { kind: 'stroke', pts, w: 0.014, tone: 'soft', dry: 0.7 }]
          })
      },
      {
        // The crest: one big curl, the body washed in under it.
        weight: 0.5,
        min: 1,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture =>
            i === 0
              ? [
                  { kind: 'blot', pts: [...curl.slice(0, 5), [cx + 0.2, 0.75], [0.02, 0.98]], tone: 'wash', alpha: 0.4 + k.tier * 0.08 },
                  { kind: 'stroke', pts: curl, w: 0.04, tone: 'ink', dry: 0.45 }
                ]
              : [{ kind: 'stroke', pts: [[0.25, 0.8], [cx - 0.05, 0.6], [cx + 0.12, crestY + 0.2]], w: 0.02, tone: 'ink', dry: 0.55 }]
          )
      },
      {
        // Foam claws along the lip; splatter rides the last one.
        weight: 3,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => [
            ...Array.from({ length: k.c + 2 }, (_, j): Mark => {
              const [x, y] = lip[(i * 3 + j * 2) % lip.length]
              const s = k.rnd(0.018, 0.03)
              return { kind: 'stroke', pts: [[x, y], [x + s * 0.6, y - s * 0.7], [x + s, y - s * 0.2]], w: 0.006, tone: 'ink', dry: 0.25 }
            }),
            ...(i === n - 1 ? k.spatter(lip[2][0], lip[2][1], 'soft') : [])
          ])
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            const [x, y] = lip[(i * 5 + 2) % lip.length]
            return [
              ...Array.from({ length: 4 + k.c * 2 }, (): Mark => ({ kind: 'bud', x: x + k.rnd(-0.06, 0.08), y: y + k.rnd(-0.08, 0.02), r: k.rnd(0.002, 0.005), tone: 'ink' })),
              ...k.spatter(x, y, 'soft')
            ]
          })
      }
    )
    return flip ? mirrored(layers) : layers
  },

  maple: (k) => {
    const fromLeft = k.rng() < 0.5
    const X = (x: number): number => (fromLeft ? x : 1 - x)
    const limb: Pt[] = [
      [X(-0.02), k.rnd(0.06, 0.14)],
      [X(0.2), k.rnd(0.18, 0.24)],
      [X(0.42), k.rnd(0.26, 0.34)],
      [X(0.62), k.rnd(0.3, 0.4)],
      [X(0.82), k.rnd(0.42, 0.5)]
    ]
    const hangs: Pt[] = []
    /** A maple leaf: five lobes from a point, and its stem. */
    const mapleLeaf = (x: number, y: number, size: number, turn: number, tone: 'accent' | 'gold'): Mark[] => [
      ...[-1.25, -0.6, 0, 0.6, 1.25].map(
        (a, i): Mark => ({ kind: 'stroke', pts: leaf(x, y, turn - Math.PI / 2 + a, size * (i === 2 ? 1 : i % 2 === 1 ? 0.85 : 0.6)), w: size * 0.55, tone, dry: 0.25, shape: 'leaf' })
      ),
      { kind: 'stroke', pts: [[x, y], [x + Math.cos(turn + Math.PI / 2) * size * 0.6, y + Math.sin(turn + Math.PI / 2) * size * 0.6]], w: 0.003, tone: 'ink', dry: 0.5 }
    ]
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, X(k.rnd(0.45, 0.62)), k.rnd(0.62, 0.72)))
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
            hangs.push(...pts.slice(1))
            return [...(k.tier >= 1 ? [k.wash(pts, 0.025)] : []), { kind: 'stroke', pts, w: 0.026 - i * 0.006, tone: 'ink', dry: 0.6 }]
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [sx, sy] = limb[1 + (i % (limb.length - 1))]
            const end: Pt = [sx + k.rnd(-0.08, 0.08), sy + k.rnd(0.06, 0.14)]
            hangs.push(end)
            return [{ kind: 'stroke', pts: [[sx, sy], end], w: 0.006, tone: 'ink', dry: 0.65 }]
          })
      },
      {
        weight: 4,
        min: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) =>
            Array.from({ length: k.c }, (_, j): Mark[] => {
              const [x, y] = hangs[(i * 2 + j) % Math.max(1, hangs.length)] ?? limb[2]
              const leafMarks = mapleLeaf(x + k.rnd(-0.03, 0.03), y + k.rnd(0.01, 0.05), k.rnd(0.035, 0.05), k.rnd(-0.6, 0.6), (i + j) % 3 === 0 ? 'gold' : 'accent')
              return i === n - 1 && j === 0 ? [...leafMarks, ...k.spatter(x, y, 'accent')] : leafMarks
            }).flat()
          )
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, () => mapleLeaf(X(k.rnd(0.2, 0.9)), k.rnd(0.6, 0.95), k.rnd(0.025, 0.035), k.rnd(0, TAU), k.rng() < 0.5 ? 'gold' : 'accent'))
      }
    )
    return layers
  },

  snow: (k) => {
    const ground = k.rnd(0.8, 0.86)
    const trees: Pt[] = []
    const layers: Layer[] = []
    if (k.tier >= 3 && k.target >= 8) layers.push(faintMoon(k, k.rnd(0.2, 0.8), k.rnd(0.1, 0.16)))
    layers.push(
      {
        weight: 1,
        min: 1,
        max: 2,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const x0 = k.rnd(-0.15, 0.3)
            const pts = ridge(k.rnd, x0, x0 + k.rnd(0.6, 0.85), lerp(0.5, 0.6, i / Math.max(1, n)), k.rnd(0.12, 0.2), 5)
            return [
              ...(k.tier >= 1 ? [k.wash(pts, 0.025)] : []),
              { kind: 'fill', pts, depth: 0.15, tone: 'wash', alpha: 0.5 + k.tier * 0.07 },
              { kind: 'stroke', pts, w: 0.012, tone: 'soft', dry: 0.7 }
            ]
          })
      },
      {
        weight: 0,
        min: 1,
        max: 1,
        make: () => {
          const pts: Pt[] = [[0, ground], [0.3, ground - 0.02], [0.65, ground + 0.01], [1, ground - 0.015]]
          return [[{ kind: 'fill', pts, depth: 0.2, tone: 'soft', alpha: 0.18 + k.tier * 0.04 }, { kind: 'stroke', pts, w: 0.02, tone: 'ink', dry: 0.5 }]]
        }
      },
      {
        // Small pines on the snowy ground.
        weight: 2,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => {
            const x = lerp(0.08, 0.92, (i + k.rng()) / n)
            const tall = k.rnd(0.12, 0.22)
            const y = ground + k.rnd(-0.01, 0.01)
            trees.push([x, y - tall])
            return [
              { kind: 'stroke', pts: [[x, y], [x + k.rnd(-0.005, 0.005), y - tall]], w: 0.008, tone: 'ink', dry: 0.4 },
              ...Array.from({ length: 2 + k.c }, (_, j): Mark => ({ kind: 'needles', x: x + (j % 2 === 0 ? -1 : 1) * 0.008, y: y - tall * (0.35 + j * 0.2), r: 0.022 - j * 0.003, lean: 0 }))
            ]
          })
      },
      {
        weight: 1,
        min: 0,
        make: (n) =>
          Array.from({ length: n }, (_, i) => {
            const [x, y] = trees[i % Math.max(1, trees.length)] ?? [0.5, ground - 0.15]
            return [{ kind: 'stroke', pts: [[x - 0.02, y + 0.03], [x, y + 0.02], [x + 0.02, y + 0.03]], w: 0.012, tone: 'ink', dry: 0.15 }]
          })
      },
      {
        // The snow falling: more flakes with every stroke.
        weight: 3,
        min: 1,
        make: (n) =>
          Array.from({ length: n }, (_, i): Gesture => [
            ...Array.from({ length: 8 + k.c * 4 }, (): Mark => ({ kind: 'bud', x: k.rnd(0.02, 0.98), y: k.rnd(0.03, ground - 0.02), r: k.rnd(0.002, 0.005), tone: 'ink' })),
            ...(i === n - 1 ? k.spatter(k.rnd(0.3, 0.7), k.rnd(0.2, 0.5), 'ink') : [])
          ])
      }
    )
    return layers
  }
}
