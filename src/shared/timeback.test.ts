// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TYPING_WPM,
  MAX_TYPING_WPM,
  MIN_TYPING_WPM,
  clampTypingWpm,
  formatMinutesBack,
  minutesBack
} from './timeback'

describe('clampTypingWpm', () => {
  it('falls back to the default for anything that is not a finite number', () => {
    expect(clampTypingWpm(undefined)).toBe(DEFAULT_TYPING_WPM)
    expect(clampTypingWpm(Number.NaN)).toBe(DEFAULT_TYPING_WPM)
    expect(clampTypingWpm(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TYPING_WPM)
    expect(clampTypingWpm('50')).toBe(DEFAULT_TYPING_WPM)
    expect(clampTypingWpm(null)).toBe(DEFAULT_TYPING_WPM)
  })

  it('clamps an out-of-range speed into the honest band', () => {
    expect(clampTypingWpm(0)).toBe(MIN_TYPING_WPM)
    expect(clampTypingWpm(-40)).toBe(MIN_TYPING_WPM)
    expect(clampTypingWpm(5)).toBe(MIN_TYPING_WPM)
    expect(clampTypingWpm(900)).toBe(MAX_TYPING_WPM)
  })

  it('keeps a speed inside the band exactly', () => {
    expect(clampTypingWpm(65)).toBe(65)
    expect(clampTypingWpm(40)).toBe(40)
  })
})

describe('minutesBack', () => {
  it('is typing time at the speed minus the time the key was held', () => {
    // 400 words typed at 40 wpm is 10 minutes; spoken in 2, so 8 back.
    expect(minutesBack(400, 120_000, 40)).toBeCloseTo(8, 6)
  })

  it('restates at a different typing speed', () => {
    // The same 400 words at 80 wpm is 5 minutes; spoken in 2, so 3 back.
    expect(minutesBack(400, 120_000, 80)).toBeCloseTo(3, 6)
  })

  it('goes negative when the key was held longer than typing would take', () => {
    // Held for a minute, said nothing: murmur cost that minute.
    expect(minutesBack(0, 60_000, 40)).toBeCloseTo(-1, 6)
  })

  it('never divides by a bad speed', () => {
    // Zero is a number, so it clamps to the floor; NaN is not, so it
    // falls back to the default. Neither can produce Infinity.
    expect(minutesBack(400, 120_000, 0)).toBeCloseTo(400 / MIN_TYPING_WPM - 2, 6)
    expect(minutesBack(400, 120_000, Number.NaN)).toBeCloseTo(400 / DEFAULT_TYPING_WPM - 2, 6)
  })
})

describe('formatMinutesBack', () => {
  it('reads zero and negatives as nothing back', () => {
    expect(formatMinutesBack(0)).toBe('0 min')
    expect(formatMinutesBack(-3)).toBe('0 min')
  })

  it('reads a value that is not a finite number as nothing back', () => {
    // Unreachable from the log, but the function is shared: never
    // "Infinity h NaN min" on any surface.
    expect(formatMinutesBack(Number.NaN)).toBe('0 min')
    expect(formatMinutesBack(Number.POSITIVE_INFINITY)).toBe('0 min')
  })

  it('rounds the half boundary up', () => {
    expect(formatMinutesBack(0.5)).toBe('1 min')
  })

  it('says under a minute for a positive fraction that rounds to zero', () => {
    expect(formatMinutesBack(0.4)).toBe('under a minute')
  })

  it('rounds whole minutes under an hour', () => {
    expect(formatMinutesBack(0.6)).toBe('1 min')
    expect(formatMinutesBack(12.3)).toBe('12 min')
    expect(formatMinutesBack(59.4)).toBe('59 min')
  })

  it('switches to hours at sixty, dropping a zero remainder', () => {
    expect(formatMinutesBack(59.6)).toBe('1 h')
    expect(formatMinutesBack(60)).toBe('1 h')
    expect(formatMinutesBack(65)).toBe('1 h 5 min')
    expect(formatMinutesBack(120)).toBe('2 h')
    expect(formatMinutesBack(150.2)).toBe('2 h 30 min')
  })
})
