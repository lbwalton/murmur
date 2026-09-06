// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { countWords, dayKey, groupByDay, isSessionEvent, wordsPerMinute } from './history'

const event = (at: number, words = 10): ReturnType<typeof make> => make(at, words)
function make(at: number, words: number) {
  return { at, durationMs: 5_000, rawText: 'r', finalText: 'f', words, wpm: 120 }
}

describe('countWords and wordsPerMinute', () => {
  it('counts words through whitespace runs', () => {
    expect(countWords('  hello   there\nworld ')).toBe(3)
    expect(countWords('')).toBe(0)
  })

  it('computes rounded wpm and survives zero duration', () => {
    expect(wordsPerMinute(30, 15_000)).toBe(120)
    expect(wordsPerMinute(0, 15_000)).toBe(0)
    expect(wordsPerMinute(30, 0)).toBe(0)
  })
})

describe('groupByDay', () => {
  it('groups by local day, newest day and event first', () => {
    const noonToday = new Date(2026, 8, 5, 12, 0, 0).getTime()
    const morningToday = new Date(2026, 8, 5, 9, 0, 0).getTime()
    const yesterday = new Date(2026, 8, 4, 12, 0, 0).getTime()
    const grouped = groupByDay([event(morningToday), event(yesterday), event(noonToday)])
    expect(grouped.map((g) => g.day)).toEqual(['2026-09-05', '2026-09-04'])
    expect(grouped[0].events.map((e) => e.at)).toEqual([noonToday, morningToday])
  })

  it('uses local midnight as the boundary', () => {
    const lateNight = new Date(2026, 8, 4, 23, 59, 0).getTime()
    const justAfter = new Date(2026, 8, 5, 0, 1, 0).getTime()
    expect(dayKey(lateNight)).toBe('2026-09-04')
    expect(dayKey(justAfter)).toBe('2026-09-05')
  })
})

describe('isSessionEvent', () => {
  it('accepts a full event and rejects wrong shapes', () => {
    expect(isSessionEvent(make(1, 2))).toBe(true)
    expect(isSessionEvent(null)).toBe(false)
    expect(isSessionEvent({ at: 'nope' })).toBe(false)
    expect(isSessionEvent({ ...make(1, 2), words: '10' })).toBe(false)
  })
})
