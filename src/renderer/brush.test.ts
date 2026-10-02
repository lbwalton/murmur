// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  type SceneItem,
  animateScene,
  brush,
  mulberry,
  paintScene,
  parseColor,
  path,
  pressure,
  splat,
  stackOrder
} from './brush'

describe('the brush is seeded', () => {
  it('gives the same numbers for the same seed and different ones for another', () => {
    const a = mulberry(7)
    const b = mulberry(7)
    const c = mulberry(8)
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
  })

  it('builds the same bristles for the same seed', () => {
    const strip = (seed: number) => brush(seed, 12).map((b) => [b.off, b.w, b.a, b.load, b.lam, b.nz(3.3)])
    expect(strip(41)).toEqual(strip(41))
    expect(strip(41)).not.toEqual(strip(42))
  })

  it('spreads bristles across the whole width', () => {
    const offs = brush(5, 20).map((b) => b.off)
    expect(Math.min(...offs)).toBeLessThan(-0.85)
    expect(Math.max(...offs)).toBeGreaterThan(0.85)
  })

  it('throws the same splatter for the same seed', () => {
    expect(splat(9, 10, 10, { count: 8, dir: 1 })).toEqual(splat(9, 10, 10, { count: 8, dir: 1 }))
  })
})

describe('paths', () => {
  it('resamples evenly and measures its length', () => {
    const P = path([
      [0, 0],
      [100, 0]
    ], 2)
    expect(P.length).toBe(51)
    expect(P.total).toBeCloseTo(100)
    expect(P[1].x - P[0].x).toBeCloseTo(2)
    expect(P[10].nx).toBeCloseTo(0)
    expect(Math.abs(P[10].ny)).toBeCloseTo(1)
  })

  it('keeps raw corners when asked', () => {
    const P = path([
      [0, 0],
      [10, 0],
      [10, 10]
    ], 1, true)
    expect(P.some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true)
    expect(P.total).toBeCloseTo(20)
  })

  it('presses in and lifts off', () => {
    expect(pressure(0)).toBeLessThan(0.5)
    expect(pressure(0.5)).toBe(1)
    expect(pressure(1)).toBeLessThan(0.4)
  })
})

describe('stacking', () => {
  it('stacks marks by when they start, keeping list order for ties', () => {
    expect(stackOrder([{ start: 400 }, { start: 0 }, { start: 900 }, { start: 0 }, {}])).toEqual([1, 3, 4, 0, 2])
  })
})

describe('colors', () => {
  // Built rather than written out: raw hex in the renderer belongs to tokens.css alone.
  const hex = (n: number, digits = 6): string => '#' + n.toString(16).padStart(digits, '0')
  it('reads hex and rgb tokens', () => {
    expect(parseColor(hex(0xf0a44b))).toEqual([240, 164, 75])
    expect(parseColor(` ${hex(0xfff, 3)} `)).toEqual([255, 255, 255])
    expect(parseColor('rgb(15, 14, 17)')).toEqual([15, 14, 17])
    expect(parseColor('rgba(236,233,228,0.5)')).toEqual([236, 233, 228])
    expect(parseColor('amber')).toBeNull()
  })
})

// A canvas that paints nothing and remembers what was drawn onto it:
// which canvases (drawImage) and which fill colors, in order.
interface FakeCanvas {
  id: string
  width: number
  height: number
  images: string[][]
  fills: string[]
  ctx: CanvasRenderingContext2D
}
function fakeCanvas(id: string, width: number, height: number): FakeCanvas {
  const c: FakeCanvas = { id, width, height, images: [], fills: [], ctx: null as unknown as CanvasRenderingContext2D }
  c.ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => {
      if (key === 'drawImage') return (src: { id?: string }) => c.images[c.images.length - 1]?.push(src.id ?? '?')
      if (key === 'clearRect') return () => c.images.push([])
      return () => undefined
    },
    set: (_t, key, value) => {
      if (key === 'fillStyle') c.fills.push(String(value))
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  c.images.push([])
  return c
}

describe('an animated scene stacks like the finished one (US-073)', () => {
  // Four marks listed out of start order, overlapping in time: a slow
  // stroke, a quick dot, another stroke, and a splat that starts with it.
  const color = (i: number): [number, number, number] => [10 + i, 20 + i, 30 + i]
  const items: SceneItem[] = [
    { start: 300, dur: 400, stroke: { P: path([[0, 0], [60, 10]], 2), B: brush(1, 6), opts: { width: 8, rgb: color(0), core: 0.5 } } },
    { start: 0, dur: 800, stroke: { P: path([[10, 40], [90, 30]], 2), B: brush(2, 6), opts: { width: 10, rgb: color(1), core: 0.5 } } },
    { start: 100, dur: 100, dot: { x: 20, y: 20, r: 4, rgb: color(2) } },
    { start: 300, splat: { sp: splat(3, 50, 50, { count: 4, mist: 0 }), rgb: color(3), flight: 50 } }
  ]
  const ORDER = stackOrder(items)
  const prefix = (i: number): string => `rgba(${10 + i},${20 + i},${30 + i},`

  function run(): { base: FakeCanvas; layers: Map<string, number>; flat: FakeCanvas | null; done: boolean } {
    let t = 0
    const queue: Array<() => void> = []
    const made: FakeCanvas[] = []
    const base = fakeCanvas('base', 200, 200)
    const fx = fakeCanvas('fx', 200, 200)
    let done = false
    animateScene({ canvas: base as never, ctx: base.ctx, dpr: 1 }, { canvas: fx as never, ctx: fx.ctx, dpr: 1 }, items, {
      createCanvas: (w, h) => {
        const c = fakeCanvas(`c${made.length}`, w, h)
        made.push(c)
        return { canvas: c as never, ctx: c.ctx }
      },
      now: () => t,
      frame: (cb) => void queue.push(cb),
      onDone: () => {
        done = true
      }
    })
    while (queue.length > 0 && t < 5000) {
      queue.shift()!()
      t += 16
    }
    // Every scratch layer after the flat picture belongs to one mark:
    // the first fill color painted on it names the mark.
    const layers = new Map<string, number>()
    for (const c of made.slice(1)) {
      const first = c.fills[0] ?? ''
      const at = items.findIndex((_, i) => first.startsWith(prefix(i)))
      if (at >= 0) layers.set(c.id, at)
    }
    return { base, layers, flat: made[0] ?? null, done }
  }

  it('draws the wet layers over the flat picture in stacking order on every frame', () => {
    const { base, layers, done } = run()
    expect(done).toBe(true)
    let sawTwoWet = false
    for (const frameImages of base.images) {
      if (frameImages.length === 0) continue
      expect(frameImages[0]).toBe('c0')
      const marks = frameImages.slice(1).map((id) => layers.get(id) as number)
      const positions = marks.map((m) => ORDER.indexOf(m))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      if (marks.length > 1) sawTwoWet = true
    }
    expect(sawTwoWet).toBe(true)
  })

  it('flattens finished marks in the same order a still painting uses', () => {
    const { flat } = run()
    const still = fakeCanvas('still', 200, 200)
    paintScene(still.ctx, items)
    const firsts = (fills: string[]): number[] => {
      const seen: number[] = []
      for (const f of fills) {
        const at = items.findIndex((_, i) => f.startsWith(prefix(i)))
        if (at >= 0 && !seen.includes(at)) seen.push(at)
      }
      return seen
    }
    expect(firsts(flat!.fills)).toEqual(ORDER)
    expect(firsts(still.fills)).toEqual(ORDER)
  })
})
