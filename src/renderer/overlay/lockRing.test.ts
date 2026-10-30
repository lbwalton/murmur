// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { CANCEL_LINGER_MS as SHARED_LINGER } from '../../shared/overlay-state'
import {
  CANCEL_LINGER_MS,
  LOCK_DRAW_MS,
  RING_OVERLAP,
  ringBox,
  ringBrush,
  ringDryness,
  scrapePoints,
  stadium
} from './lockRing'

/** How far a point sits from the outline of the stadium in the box. */
function offOutline(p: readonly [number, number], x: number, y: number, w: number, h: number): number {
  const r = h / 2
  const cx = Math.min(Math.max(p[0], x + r), x + w - r)
  return Math.abs(Math.hypot(p[0] - cx, p[1] - (y + r)) - r)
}

describe('the lock ring (US-117)', () => {
  it('the stadium starts just left of bottom center and ends past its start', () => {
    const pts = stadium(0, 0, 200, 56)
    expect(pts[0][1]).toBeCloseTo(56)
    expect(pts[0][0]).toBeLessThan(100)
    expect(pts).toHaveLength(97)
    expect(pts.at(-1)![1]).toBeCloseTo(56)
    expect(pts.at(-1)![0]).toBeLessThan(pts[0][0]) // overlapped past the start
  })

  it('every point sits on the pill outline', () => {
    for (const [x, y, w, h] of [
      [0, 0, 200, 56],
      [37, 12, 151, 38],
      [46, 14, 248, 54]
    ]) {
      const pts = stadium(x, y, w, h)
      for (const p of pts) expect(offOutline(p, x, y, w, h)).toBeLessThan(0.01)
    }
  })

  it('walks clockwise: up the left end first, then along the top', () => {
    const pts = stadium(0, 0, 200, 56)
    const left = pts.findIndex((p) => p[0] < 1)
    const top = pts.findIndex((p) => p[1] < 1)
    const right = pts.findIndex((p) => p[0] > 199)
    expect(left).toBeGreaterThan(0)
    expect(top).toBeGreaterThan(left)
    expect(right).toBeGreaterThan(top)
  })

  it('overlaps its start by RING_OVERLAP of the perimeter', () => {
    expect(RING_OVERLAP).toBe(0.05)
    const perimeter = 2 * (200 - 56) + Math.PI * 56
    const pts = stadium(0, 0, 200, 56)
    // Start and end both sit on the bottom flat, the end further left.
    expect(pts[0][0] - pts.at(-1)![0]).toBeCloseTo(perimeter * RING_OVERLAP)
    const none = stadium(0, 0, 200, 56, 0)
    expect(none.at(-1)![0]).toBeCloseTo(none[0][0])
  })

  it('a square box is a circle, still on its outline', () => {
    const pts = stadium(0, 0, 40, 40)
    for (const p of pts) expect(offOutline(p, 0, 0, 40, 40)).toBeLessThan(0.01)
  })

  it('dries to gold only in the last minute', () => {
    expect(ringDryness(0)).toBe(0)
    expect(ringDryness(659_999)).toBe(0)
    expect(ringDryness(690_000)).toBeCloseTo(0.5)
    expect(ringDryness(720_000)).toBe(1)
    expect(ringDryness(800_000)).toBe(1)
    expect(ringDryness(-5)).toBe(0)
  })

  it('goes round the pill itself, and in bare round the needle with room to spare', () => {
    const box = { x: 58, y: 21, w: 224, h: 40 }
    expect(ringBox(box, 'pill')).toEqual(box)
    expect(ringBox(box, 'compact')).toEqual(box)
    expect(ringBox(box, 'bare')).toEqual({ x: 46, y: 14, w: 248, h: 54 })
  })

  it('paints with the brush picked for each look', () => {
    expect(ringBrush('pill')).toEqual({ seed: 7, width: 4.6 })
    expect(ringBrush('compact')).toEqual({ seed: 41, width: 3.3 })
    expect(ringBrush('bare')).toEqual({ seed: 7, width: 3.8 })
  })

  it('scrapes across at 56 percent of the height, inside the ends', () => {
    const pts = scrapePoints({ x: 0, y: 0, w: 200, h: 50 })
    expect(pts[0][0]).toBe(10)
    expect(pts[0][1]).toBeCloseTo(31)
    expect(pts.at(-1)![0]).toBe(190)
    expect(pts.at(-1)![1]).toBeCloseTo(24)
  })

  it('names its times', () => {
    expect(LOCK_DRAW_MS).toBe(650)
    expect(CANCEL_LINGER_MS).toBe(900)
    // Main lingers the cancelled phase by the same constant the scrape is timed to.
    expect(CANCEL_LINGER_MS).toBe(SHARED_LINGER)
  })
})
