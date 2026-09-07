// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import rates from '../../shared/rates.json'
import type { SessionEvent } from './history'
import { type RatesSpec, aggregate, heatmap, sessionCostUsd } from './analytics'

const RATES = rates as unknown as RatesSpec

function event(at: number, words = 100, durationMs = 60_000): SessionEvent {
  return { at, durationMs, rawText: 'r', finalText: 'f', words, wpm: 100 }
}

// A fixed "now": 2026-09-05 15:00 local.
const NOW = new Date(2026, 8, 5, 15, 0, 0).getTime()

describe('sessionCostUsd', () => {
  it('prices a minute of turbo audio plus the cleanup estimate', () => {
    const cost = sessionCostUsd({ durationMs: 60_000, words: 100 }, RATES, 'whisper-large-v3-turbo', 'openai/gpt-oss-120b')
    // STT: 60s at 0.04/hr; LLM: (100*1.35+180) in + 135 out tokens.
    const stt = (60 / 3600) * 0.04
    const llm = (315 / 1e6) * 0.15 + (135 / 1e6) * 0.6
    expect(cost).toBeCloseTo(stt + llm, 8)
  })

  it('honors the 10 second billing minimum for short takes', () => {
    const short = sessionCostUsd({ durationMs: 2_000, words: 5 }, RATES, 'whisper-large-v3-turbo', 'openai/gpt-oss-20b')
    const floor = (10 / 3600) * 0.04
    expect(short).toBeGreaterThanOrEqual(floor)
  })

  it('falls back to default rates for unknown model ids', () => {
    const cost = sessionCostUsd({ durationMs: 60_000, words: 100 }, RATES, 'mystery-stt', 'mystery-llm')
    expect(cost).toBeGreaterThan(0)
  })
})

describe('aggregate', () => {
  it('returns zeroed totals and a full zero-filled series for an empty log', () => {
    const summary = aggregate([], RATES, { now: () => NOW })
    expect(summary.lifetime).toEqual({ sessions: 0, words: 0, minutes: 0, estCostUsd: 0, avgWpm: 0 })
    expect(summary.days.length).toBe(14)
    expect(summary.days.at(-1)?.day).toBe('2026-09-05')
    expect(summary.days.every((d) => d.sessions === 0)).toBe(true)
  })

  it('separates lifetime, month, and today across boundaries', () => {
    const today = event(new Date(2026, 8, 5, 9, 0).getTime())
    const thisMonth = event(new Date(2026, 8, 2, 9, 0).getTime())
    const lastMonth = event(new Date(2026, 7, 20, 9, 0).getTime())
    const summary = aggregate([lastMonth, thisMonth, today], RATES, { now: () => NOW })
    expect(summary.lifetime.sessions).toBe(3)
    expect(summary.month.sessions).toBe(2)
    expect(summary.today.sessions).toBe(1)
    expect(summary.lifetime.words).toBe(300)
  })

  it('fills the daily series buckets chronologically', () => {
    const twoDaysAgo = event(new Date(2026, 8, 3, 9, 0).getTime(), 50)
    const summary = aggregate([twoDaysAgo], RATES, { now: () => NOW })
    const bucket = summary.days.find((d) => d.day === '2026-09-03')
    expect(bucket?.words).toBe(50)
    expect(bucket?.sessions).toBe(1)
  })

  it('never compounds rounding across many sessions in one day', () => {
    // Five 4-second sessions: true total is 20s = 0.333 minutes, which
    // must round to 0.3 once, not creep upward via per-event rounding.
    const events = Array.from({ length: 5 }, (_, i) => event(NOW - (i + 1) * 60_000, 10, 4_000))
    const summary = aggregate(events, RATES, { now: () => NOW })
    expect(summary.days.at(-1)?.minutes).toBe(0.3)
  })

  it('computes lifetime average wpm from words over minutes', () => {
    const summary = aggregate([event(NOW - 1000, 300, 120_000)], RATES, { now: () => NOW })
    expect(summary.lifetime.avgWpm).toBe(150)
  })

  it('rounds minutes and cost without corrupting counts', () => {
    const summary = aggregate([event(NOW - 1000, 100, 90_000)], RATES, { now: () => NOW })
    expect(summary.lifetime.minutes).toBe(1.5)
    expect(Number.isInteger(summary.lifetime.sessions)).toBe(true)
  })
})

describe('heatmap', () => {
  it('lifetime pads a young profile back to a full year of cells', () => {
    const hm = heatmap([event(NOW - 1000, 200)], { now: () => NOW })
    expect(hm.days.length).toBe(365)
    expect(hm.days.at(-1)?.day).toBe('2026-09-05')
    expect(hm.days.at(-1)?.words).toBe(200)
    expect(hm.totalWords).toBe(200)
    expect(hm.period).toBe('lifetime')
  })

  it('lifetime reaches back to the first dictation when older than a year', () => {
    const first = event(new Date(2024, 2, 10, 9, 0).getTime(), 60)
    const recent = event(NOW - 1000, 40)
    const hm = heatmap([first, recent], { now: () => NOW })
    expect(hm.days[0]?.day).toBe('2024-03-10')
    expect(hm.days.at(-1)?.day).toBe('2026-09-05')
    expect(hm.days.length).toBeGreaterThan(730)
    expect(hm.totalWords).toBe(100)
    expect(hm.years).toEqual([2024, 2026])
  })

  it('renders a calendar year from January first, clipped at today', () => {
    const jan = event(new Date(2026, 0, 15, 9, 0).getTime(), 50)
    const hm = heatmap([jan], { now: () => NOW, year: 2026 })
    expect(hm.days[0]?.day).toBe('2026-01-01')
    expect(hm.days.at(-1)?.day).toBe('2026-09-05')
    expect(hm.days.find((d) => d.day === '2026-01-15')?.words).toBe(50)
    expect(hm.period).toBe(2026)
  })

  it('renders a past year in full and counts only its words', () => {
    const old = event(new Date(2025, 5, 10, 9, 0).getTime(), 80)
    const recent = event(NOW - 1000, 40)
    const hm = heatmap([old, recent], { now: () => NOW, year: 2025 })
    expect(hm.days.length).toBe(365)
    expect(hm.days[0]?.day).toBe('2025-01-01')
    expect(hm.days.at(-1)?.day).toBe('2025-12-31')
    expect(hm.totalWords).toBe(80)
    expect(hm.years).toEqual([2025, 2026])
  })

  it('offers the current year even with an empty log', () => {
    const hm = heatmap([], { now: () => NOW })
    expect(hm.years).toEqual([2026])
    expect(hm.totalWords).toBe(0)
  })
})
