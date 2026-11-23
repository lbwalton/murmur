// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { PaintingRecord } from './painting'
import { WEAR_STEPS, todaysWear, wearStep } from './paperWear'

describe('paper wearing through the day (US-186)', () => {
  it('is fresh before the first take, and on nonsense', () => {
    expect(wearStep(0, 12)).toBe(0)
    expect(wearStep(-3, 12)).toBe(0)
    expect(wearStep(5, 0)).toBe(0)
    expect(wearStep(Number.NaN, 12)).toBe(0)
    expect(wearStep(4, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('moves a step at each quarter of the day, and is most worn when the painting is finished', () => {
    expect(WEAR_STEPS).toBe(4)
    // A 12-stroke day: steps at 3, 6, 9 and 12 takes.
    expect([1, 2, 3, 5, 6, 8, 9, 11, 12].map((t) => wearStep(t, 12))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4])
    // The smallest day (6 strokes).
    expect([1, 2, 3, 4, 5, 6].map((t) => wearStep(t, 6))).toEqual([0, 1, 2, 2, 3, 4])
  })

  it('stays at its most worn past a finished painting', () => {
    expect(wearStep(40, 12)).toBe(WEAR_STEPS)
  })

  it("reads today's painting from the book, and a day with none is fresh", () => {
    const record = (takes: number, target: number): PaintingRecord =>
      ({ words: Array.from({ length: takes }, () => 10), target }) as unknown as PaintingRecord
    const book = { '2026-11-21': record(12, 12), '2026-11-22': record(6, 12) }
    expect(todaysWear(book, '2026-11-22')).toBe(2)
    expect(todaysWear(book, '2026-11-23')).toBe(0)
    expect(todaysWear(book, 'not a day')).toBe(0)
    expect(todaysWear({}, '2026-11-22')).toBe(0)
  })
})
