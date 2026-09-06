// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import defs from '../../shared/achievements.json'
import type { SessionEvent } from './history'
import { type AchievementsFile, evaluateAchievements } from './achievements'

const SPEC = defs as unknown as AchievementsFile
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 0, 5, 10, 0).getTime()

function session(day: number, over: Partial<SessionEvent> = {}): SessionEvent {
  return {
    at: T0 + day * DAY,
    durationMs: 30_000,
    rawText: 'r',
    finalText: 'f',
    words: 100,
    wpm: 100,
    hour: 10,
    ...over
  }
}

function ids(events: SessionEvent[]): string[] {
  return evaluateAchievements(events, SPEC).map((e) => e.id)
}

describe('evaluateAchievements', () => {
  it('an empty log earns nothing', () => {
    expect(ids([])).toEqual([])
  })

  it('the first session earns first-words with its timestamp', () => {
    const earned = evaluateAchievements([session(0)], SPEC)
    expect(earned[0]).toEqual({ id: 'first-words', at: T0 })
  })

  it('streaks require consecutive stored days and break on gaps', () => {
    const consecutive = [session(0), session(1), session(2)]
    expect(ids(consecutive)).toContain('streak-3')
    const gapped = [session(0), session(1), session(3), session(4)]
    expect(ids(gapped)).not.toContain('streak-3')
  })

  it('day words accumulate across sessions within one day only', () => {
    const oneDay = [session(0, { words: 600 }), session(0, { words: 500 })]
    expect(ids(oneDay)).toContain('day-1k')
    const split = [session(0, { words: 600 }), session(1, { words: 500 })]
    expect(ids(split)).not.toContain('day-1k')
  })

  it('marathon needs a single long hold, not accumulation', () => {
    expect(ids([session(0, { durationMs: 301_000 })])).toContain('marathon')
    expect(ids([session(0), session(0), session(0)])).not.toContain('marathon')
  })

  it('time windows use the stored hour', () => {
    expect(ids([session(0, { hour: 1 })])).toContain('night-owl')
    expect(ids([session(0, { hour: 5 })])).toContain('early-bird')
    expect(ids([session(0, { hour: 12 })])).not.toContain('night-owl')
  })

  it('the comeback fires on returning after a quiet week', () => {
    expect(ids([session(0), session(8)])).toContain('comeback')
    expect(ids([session(0), session(3)])).not.toContain('comeback')
  })

  it('lifetime session counts accumulate', () => {
    const many = Array.from({ length: 100 }, (_, i) => session(Math.floor(i / 3), {}))
    expect(ids(many)).toContain('sessions-100')
  })

  it('earn timestamps are stable and first-earn only', () => {
    const events = [session(0), session(1), session(2), session(3)]
    const first = evaluateAchievements(events, SPEC)
    const again = evaluateAchievements([...events, session(4)], SPEC)
    const firstWords = (list: typeof first) => list.find((e) => e.id === 'first-words')
    expect(firstWords(again)).toEqual(firstWords(first))
  })
})
