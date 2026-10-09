// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { daySummary } from './dayPaint'

const take = (words: number, durationMs = 20_000, wpm = 150): { words: number; durationMs: number; wpm: number } => ({ words, durationMs, wpm })

describe('the wrap-up in words', () => {
  const day = [take(80), take(210), take(64), take(330, 72_000, 168), take(95)]

  it('says the day in words, as Copy summary copies it', () => {
    const s = daySummary(day, 14)
    expect(s.headline).toBe('5 dictations, 779 words')
    expect(s.detail).toBe('14 min back, longest take 1:12, best pace 168 wpm')
    expect(s.text).toBe(`${s.headline}\n${s.detail}`)
    expect(daySummary([take(12)], 0).headline).toBe('1 dictation, 12 words')
  })
})
