// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { ROAD, daysPerMark, rankX, youX } from './journeyPaint'

describe('the road', () => {
  const n = 31

  it('lays the ranks out evenly from the start to the end of the road', () => {
    expect(rankX(0, n)).toBeGreaterThan(ROAD.pad)
    expect(rankX(n - 1, n)).toBeCloseTo(ROAD.W - ROAD.pad)
    expect(rankX(2, n) - rankX(1, n)).toBeCloseTo(rankX(1, n) - rankX(0, n))
  })

  it('puts you between your rank and the next by the slower gate', () => {
    expect(youX(3, 0, n)).toBe(rankX(3, n))
    expect(youX(3, 0.5, n)).toBeCloseTo((rankX(3, n) + rankX(4, n)) / 2)
    expect(youX(3, 2, n)).toBe(rankX(4, n))
  })

  it('starts you before the first knot without a belt, and ends you at the last', () => {
    expect(youX(-1, 0, n)).toBe(ROAD.pad)
    expect(youX(-1, 1, n)).toBe(rankX(0, n))
    expect(youX(n - 1, 0.4, n)).toBe(rankX(n - 1, n))
  })
})

describe('tally marks', () => {
  it('keeps one mark a day up to fifty, then groups them', () => {
    expect(daysPerMark(9)).toBe(1)
    expect(daysPerMark(50)).toBe(1)
    expect(daysPerMark(60)).toBe(2)
    expect(daysPerMark(400)).toBe(8)
    expect(Math.ceil(400 / daysPerMark(400))).toBeLessThanOrEqual(50)
  })
})
