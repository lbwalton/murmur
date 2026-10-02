// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { brush, mulberry, parseColor, path, pressure, splat, stackOrder } from './brush'

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
