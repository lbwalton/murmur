// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import type { SessionEvent } from './history'
import { type RanksFile, computeProgress } from './ranks'

const SPEC = ranks as unknown as RanksFile
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 0, 5, 10, 0).getTime()

/** One session of `words` on day `day` (0-based). */
function session(day: number, words: number): SessionEvent {
  return { at: T0 + day * DAY, durationMs: 60_000, rawText: 'r', finalText: 'f', words, wpm: 100 }
}

describe('ladder data sanity', () => {
  it('thresholds rise monotonically through every earnable rank', () => {
    const earnable = SPEC.ranks.filter((r) => !r.founderOnly)
    for (let i = 1; i < earnable.length; i++) {
      expect(earnable[i].words as number).toBeGreaterThan(earnable[i - 1].words as number)
      expect(earnable[i].activeDays as number).toBeGreaterThanOrEqual(
        earnable[i - 1].activeDays as number
      )
    }
  })

  it('the 10th degree exists and is founder-only', () => {
    const tenth = SPEC.ranks.find((r) => r.id === 'red-10')
    expect(tenth?.founderOnly).toBe(true)
    expect(tenth?.words).toBeNull()
  })
})

describe('computeProgress', () => {
  it('a fresh log has no belt and full lifetime zeroes', () => {
    const report = computeProgress([], SPEC)
    expect(report.rank.id).toBe('none')
    expect(report.next?.id).toBe('white')
    expect(report.totals).toEqual({ words: 0, activeDays: 0 })
    expect(report.promotions).toEqual([])
  })

  it('the first real session earns the white belt', () => {
    const report = computeProgress([session(0, 150)], SPEC)
    expect(report.rank.id).toBe('white')
    expect(report.promotions.map((p) => p.id)).toEqual(['white'])
  })

  it('words alone cannot skip the active-day gate (the anti-burst rule)', () => {
    // A million words in two days: word gates for everything are met,
    // but two active days only satisfies up to white-1.
    const report = computeProgress([session(0, 500_000), session(1, 500_000)], SPEC)
    expect(report.rank.id).toBe('white-1')
    expect(report.totals.activeDays).toBe(2)
    // Progress toward the next rank shows the day gate is the blocker.
    expect(report.words?.pct).toBe(1)
    expect(report.activeDays?.pct).toBeLessThan(1)
  })

  it('days alone cannot skip the word gate either', () => {
    // 400 days of ten words: 4000 words total.
    const events = Array.from({ length: 400 }, (_, i) => session(i, 10))
    const report = computeProgress(events, SPEC)
    expect(report.rank.id).toBe('white-1')
    expect(report.words?.pct).toBeLessThan(1)
  })

  it('a steady practice earns blue with a dated promotion trail', () => {
    // 14 days at 2000 words: 28k words, 14 active days.
    const events = Array.from({ length: 14 }, (_, i) => session(i, 2000))
    const report = computeProgress(events, SPEC)
    expect(report.rank.id).toBe('blue')
    const ids = report.promotions.map((p) => p.id)
    expect(ids).toEqual(['white', 'white-1', 'white-2', 'white-3', 'white-4', 'blue'])
    // Promotions are dated in order.
    for (let i = 1; i < report.promotions.length; i++) {
      expect(report.promotions[i].at).toBeGreaterThanOrEqual(report.promotions[i - 1].at)
    }
  })

  it('multiple sessions on the same day count as one active day', () => {
    const events = [session(0, 1000), session(0, 1000), session(0, 1000)]
    const report = computeProgress(events, SPEC)
    expect(report.totals.activeDays).toBe(1)
  })

  it('usage can never earn the 10th degree', () => {
    const events = Array.from({ length: 2000 }, (_, i) => session(i, 5000))
    const report = computeProgress(events, SPEC)
    expect(report.rank.id).toBe('red-9')
    expect(report.next).toBeNull()
    expect(report.founder).toBe(false)
  })

  it('the founder flag grants the founder belt regardless of usage', () => {
    const report = computeProgress([session(0, 150)], SPEC, { founder: true })
    expect(report.rank.id).toBe('red-10')
    expect(report.rank.title).toBe('the founder')
    expect(report.next).toBeNull()
    expect(report.founder).toBe(true)
  })

  it('stored day keys survive timezone changes (a belt earned stays earned)', () => {
    // Two events with identical epochs would re-bucket identically, but
    // their stored day keys say they happened on different local days.
    const a = { ...session(0, 150), day: '2026-01-05' }
    const b = { ...session(0, 3000), day: '2026-01-06' }
    const report = computeProgress([a, b], SPEC)
    expect(report.totals.activeDays).toBe(2)
    expect(report.rank.id).toBe('white-1')
  })

  it('event order does not matter', () => {
    const shuffled = [session(3, 1000), session(0, 150), session(2, 1000), session(1, 1000)]
    const ordered = [session(0, 150), session(1, 1000), session(2, 1000), session(3, 1000)]
    expect(computeProgress(shuffled, SPEC)).toEqual(computeProgress(ordered, SPEC))
  })
})
