// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import ranksFile from '../../../shared/ranks.json'
import type { RankSpec } from '../../shared/ranks'
import { ROAD, daysPerMark, earnedIndex, rankX, youX } from './journeyPaint'

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

describe('earned rank on the road', () => {
  const road = (ranksFile as { ranks: RankSpec[] }).ranks.filter((r) => r.id !== 'none')
  const at = (id: string): number => road.findIndex((r) => r.id === id)

  it('is the highest rank both gates have reached, never the founder belt', () => {
    expect(earnedIndex(road, 0, 0)).toBe(-1)
    expect(earnedIndex(road, 11017, 7)).toBe(at('white-2'))
    expect(earnedIndex(road, 11017, 3)).toBe(at('white-1'))
    expect(earnedIndex(road, 99_000_000, 99_999)).toBe(at('red-9'))
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
