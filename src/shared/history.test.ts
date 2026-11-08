// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { type SessionEvent, countsTowardStats, countWords, dayKey, groupByDay, isSessionEvent, wordsPerMinute, KEEP_24_HOURS, KEEP_FOREVER, KEEP_NO_TEXT, hasText, pasteTarget, recordingLimitMs, textCutoff, withoutText } from './history'

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

  it('accepts a note kind and nothing else', () => {
    expect(isSessionEvent({ ...make(1, 2), kind: 'note' })).toBe(true)
    expect(isSessionEvent({ ...make(1, 2), kind: 'paste' })).toBe(false)
  })
})

describe('transform entries (US-054)', () => {
  const base = { at: 1, durationMs: 1, rawText: 'make a list', finalText: 'original', words: 1, wpm: 1 }

  it('are valid events, with or without the unsent flag', () => {
    expect(isSessionEvent({ ...base, kind: 'transform' })).toBe(true)
    expect(isSessionEvent({ ...base, kind: 'transform', unsent: true })).toBe(true)
    expect(isSessionEvent({ ...base, kind: 'transform', unsent: 'yes' })).toBe(false)
    expect(isSessionEvent({ ...base, kind: 'edit' })).toBe(false)
  })

  it('never count toward stats; dictations and notes do', () => {
    expect(countsTowardStats({ ...base, kind: 'transform' })).toBe(false)
    expect(countsTowardStats({ ...base, kind: 'note' })).toBe(true)
    expect(countsTowardStats(base)).toBe(true)
  })
})

describe('Keep history (US-137)', () => {
  const NOW = 1_800_000_000_000
  const DAY = 24 * 60 * 60 * 1000

  it('knows which limits take words and which take entries', () => {
    expect(textCutoff(KEEP_NO_TEXT, NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(textCutoff(KEEP_24_HOURS, NOW)).toBe(NOW - DAY)
    expect(textCutoff(30, NOW)).toBeNull()
    expect(textCutoff(KEEP_FOREVER, NOW)).toBeNull()
  })

  it('gives a recording the same limit, and 24 hours under Don\'t keep', () => {
    expect(recordingLimitMs(KEEP_NO_TEXT)).toBe(DAY)
    expect(recordingLimitMs(KEEP_24_HOURS)).toBe(DAY)
    expect(recordingLimitMs(30)).toBe(30 * DAY)
    expect(recordingLimitMs(KEEP_FOREVER)).toBeNull()
  })

  it('keeps a transform\'s instruction length when its words go', () => {
    const event = { at: 1, durationMs: 2, rawText: 'make it shorter', finalText: 'A.', words: 9, wpm: 3, kind: 'transform' as const }
    expect(withoutText(event).instructionWords).toBe(3)
  })

  it('takes out the words and nothing else', () => {
    const event = { at: 1, durationMs: 2, rawText: 'a', finalText: 'A.', words: 1, wpm: 3, day: '2026-11-06' }
    expect(withoutText(event)).toEqual({ ...event, rawText: '', finalText: '' })
    expect(hasText(event)).toBe(true)
    expect(hasText(withoutText(event))).toBe(false)
  })
})

describe('pasteTarget', () => {
  const entry = (at: number, finalText: string): SessionEvent => ({ at, durationMs: 1, rawText: finalText, finalText, words: 1, wpm: 1 })

  it('is the newest entry with no words put back', () => {
    expect(pasteTarget([entry(1, 'a'), entry(2, 'b')], null)?.at).toBe(2)
  })

  it('is the entry a held take went back to, though newer lines follow it', () => {
    expect(pasteTarget([entry(1, 'a'), entry(2, 'b')], 1)?.at).toBe(1)
  })

  it('falls back to the newest entry when those words are gone', () => {
    expect(pasteTarget([entry(1, ''), entry(2, 'b')], 1)?.at).toBe(2)
    expect(pasteTarget([entry(2, 'b')], 1)?.at).toBe(2)
  })

  it('is nothing with nothing logged', () => {
    expect(pasteTarget([], 1)).toBeUndefined()
  })
})
