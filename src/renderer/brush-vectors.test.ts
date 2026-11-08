// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/brush-vectors.json through the brush. MurmurCore's Brush
// runs the same file, so the keyboard's ink and desktop's paint the same
// marks (ios/prd.json IOS-020).
import { describe, expect, it } from 'vitest'
import vectors from '../../shared/brush-vectors.json'
import { type BrushPath, type StrokeOptions, brush, mulberry, noise1, path, pressure, stroke } from './brush'

interface PathCase {
  name: string
  pts: [number, number][]
  step: number
  raw: boolean
  out: { total: number; points: number[][] }
}

interface StrokeCase {
  name: string
  path: number
  seed: number
  n: number
  options: Record<string, unknown>
  ops: unknown[]
}

/** Named pressure functions, as the file names them. */
const PRESSURES: Record<string, (t: number) => number> = { sine: (t) => 0.5 + 0.5 * Math.sin(t * Math.PI) }

/** A canvas that writes down what a stroke paints: each fill's color and
 *  shape, and each bristle's color, width, and pen-down runs. */
function recorder(): { ctx: CanvasRenderingContext2D; ops: unknown[] } {
  const ops: unknown[] = []
  let fillStyle = ''
  let strokeStyle = ''
  let lineWidth = 1
  let lines: number[][][] = []
  const parse = (s: string): number[] => {
    const m = /^rgba\(([^)]*)\)$/.exec(s)
    if (!m) throw new Error(`not rgba: ${s}`)
    return m[1].split(',').map(Number)
  }
  const ctx = {
    set fillStyle(v: string) {
      fillStyle = v
    },
    set strokeStyle(v: string) {
      strokeStyle = v
    },
    set lineWidth(v: number) {
      lineWidth = v
    },
    lineCap: 'butt',
    lineJoin: 'round',
    beginPath: () => {
      lines = []
    },
    moveTo: (x: number, y: number) => {
      lines.push([[x, y]])
    },
    lineTo: (x: number, y: number) => {
      lines[lines.length - 1].push([x, y])
    },
    closePath: () => undefined,
    fill: () => {
      ops.push({ fill: parse(fillStyle), points: lines.flat() })
    },
    stroke: () => {
      ops.push({ stroke: parse(strokeStyle), width: lineWidth, lines })
    }
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const pathOf = (c: PathCase): BrushPath => path(c.pts, c.step, c.raw)

describe('shared/brush-vectors.json', () => {
  it('random numbers and noise', () => {
    for (const m of vectors.mulberries) {
      const r = mulberry(m.seed)
      expect(m.values.map(() => r())).toEqual(m.values)
    }
    for (const n of vectors.noises) {
      const f = noise1(n.seed)
      expect(n.xs.map(f)).toEqual(n.values)
    }
  })

  for (const c of vectors.paths as unknown as PathCase[]) {
    it(`path: ${c.name}`, () => {
      const P = pathOf(c)
      expect({ total: P.total, points: P.map((p) => [p.x, p.y, p.s, p.nx, p.ny]) }).toEqual(c.out)
    })
  }

  it('brushes and pressure', () => {
    for (const b of vectors.brushes) {
      const made = brush(b.seed, b.n).map((x) => ({ off: x.off, w: x.w, a: x.a, load: x.load, tone: x.tone, lam: x.lam, jit: x.jit, nz: [0.5, 3.2, 40.7, 300.1].map((v) => x.nz(v)) }))
      expect(made).toEqual(b.bristles)
    }
    for (const p of vectors.pressures) {
      expect([0, 0.03, 0.1, 0.5, 0.8, 0.95, 1].map((t) => pressure(t, p.ts, p.te))).toEqual(p.values)
    }
  })

  for (const c of vectors.strokes as unknown as StrokeCase[]) {
    it(`stroke: ${c.name}`, () => {
      const { ctx, ops } = recorder()
      const options = { ...c.options }
      if (typeof options.pfn === 'string') options.pfn = PRESSURES[options.pfn]
      stroke(ctx, pathOf((vectors.paths as unknown as PathCase[])[c.path]), brush(c.seed, c.n), options as unknown as StrokeOptions)
      expect(ops).toEqual(c.ops)
    })
  }
})
