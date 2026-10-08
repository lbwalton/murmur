// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { ROAD, daysPerMark, drawFrom, rankX, youX } from './journeyPaint'

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

describe('gates drawing on', () => {
  it('start where you last saw them on the same rank', () => {
    expect(drawFrom(9_000, 6_000, 11_017)).toBe(9_000)
  })

  it('start at the rank with no record, or on a new rank', () => {
    expect(drawFrom(null, 6_000, 11_017)).toBe(6_000)
  })

  it('never run backwards or start before the rank', () => {
    // After Clear all or a retention cut you may have less than you saw.
    expect(drawFrom(14_000, 6_000, 11_017)).toBe(11_017)
    expect(drawFrom(2_000, 6_000, 11_017)).toBe(6_000)
  })
})

describe('the level note', () => {
  it('says what the next level takes', async () => {
    const { levelNote } = await import('./JourneyView')
    expect(levelNote(1, 11_017)).toBe(
      'Level 1. You gain a level for every 100,000 words you dictate, with no days needed. 88,983 more words to reach level 2.'
    )
    expect(levelNote(3, 299_999)).toContain('1 more word to reach level 4.')
  })
})
