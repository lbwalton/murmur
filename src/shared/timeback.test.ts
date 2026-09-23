// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TYPING_WPM,
  MAX_TYPING_WPM,
  MILESTONE_STEP_MINUTES,
  MIN_TYPING_WPM,
  clampTypingWpm,
  crossedMilestone,
  dayMinutesBack,
  formatMinutesBack,
  formatMinutesBackWords,
  milestoneBody,
  milestoneToAnnounce,
  minutesBack,
  shownMinutes,
  trayTooltip
} from './timeback'
import type { SessionEvent } from './history'

function take(day: string, words: number, durationMs: number): SessionEvent {
  return { at: 0, durationMs, rawText: 'r', finalText: 'f', words, wpm: 0, day }
}

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

describe('dayMinutesBack', () => {
  it('sums the raw time back of one day only', () => {
    const events = [
      take('2026-09-22', 400, 120_000), // 8 back
      take('2026-09-22', 0, 60_000), // -1: held, said nothing
      take('2026-09-21', 400, 120_000) // another day
    ]
    expect(dayMinutesBack(events, '2026-09-22', 40)).toBeCloseTo(7, 6)
    expect(dayMinutesBack(events, '2026-09-23', 40)).toBe(0)
    expect(dayMinutesBack([], '2026-09-22', 40)).toBe(0)
  })

  it('stays raw: a day in debt reads below zero here, floored only on display', () => {
    expect(dayMinutesBack([take('2026-09-22', 0, 120_000)], '2026-09-22', 40)).toBeCloseTo(-2, 6)
  })
})

describe('shownMinutes', () => {
  it('reads a raw total the way the card and the tooltip do', () => {
    // Floored at zero, rounded to a tenth like the analytics buckets,
    // then to the minute like the card: one rounding for every surface.
    expect(shownMinutes(29.4)).toBe(29)
    expect(shownMinutes(29.5)).toBe(30)
    expect(shownMinutes(0.04)).toBe(0)
    expect(shownMinutes(-3)).toBe(0)
  })

  it('reads anything that is not a finite number as zero', () => {
    expect(shownMinutes(Number.NaN)).toBe(0)
    expect(shownMinutes(Number.POSITIVE_INFINITY)).toBe(0)
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

describe('formatMinutesBackWords', () => {
  it('spells the units out for a sentence', () => {
    expect(formatMinutesBackWords(1)).toBe('1 minute')
    expect(formatMinutesBackWords(19.4)).toBe('19 minutes')
    expect(formatMinutesBackWords(30)).toBe('30 minutes')
    expect(formatMinutesBackWords(60)).toBe('1 hour')
    expect(formatMinutesBackWords(90)).toBe('1 hour 30 minutes')
    expect(formatMinutesBackWords(120)).toBe('2 hours')
    expect(formatMinutesBackWords(121)).toBe('2 hours 1 minute')
  })

  it('reads nothing and fractions the same way the short form does', () => {
    expect(formatMinutesBackWords(0)).toBe('0 minutes')
    expect(formatMinutesBackWords(-5)).toBe('0 minutes')
    expect(formatMinutesBackWords(0.3)).toBe('under a minute')
    expect(formatMinutesBackWords(Number.NaN)).toBe('0 minutes')
  })
})

describe('crossedMilestone', () => {
  it('is null while no mark was crossed', () => {
    expect(crossedMilestone(0, 29.9)).toBeNull()
    expect(crossedMilestone(31, 45)).toBeNull()
  })

  it('reports the mark a single step across', () => {
    expect(crossedMilestone(28, 31)).toBe(30)
    expect(crossedMilestone(29.9, 30)).toBe(30)
  })

  it('reports only the highest mark when one take jumps two', () => {
    expect(crossedMilestone(25, 95)).toBe(90)
  })

  it('treats anything below zero as zero on both sides', () => {
    // Held-and-said-nothing takes drag the raw sum negative; the first
    // real take climbs from zero, not from the debt.
    expect(crossedMilestone(-12, 31)).toBe(30)
    expect(crossedMilestone(-12, -3)).toBeNull()
  })

  it('crosses nothing when the total fell', () => {
    expect(crossedMilestone(61, 40)).toBeNull()
  })

  it('takes a custom step', () => {
    expect(crossedMilestone(0, 12, 10)).toBe(10)
    expect(MILESTONE_STEP_MINUTES).toBe(30)
  })

  it('is exact at the mark itself', () => {
    expect(crossedMilestone(59.99, 60.01)).toBe(60)
    expect(crossedMilestone(60, 60.5)).toBeNull()
    expect(crossedMilestone(30, 30)).toBeNull()
  })

  it('crosses nothing on inputs that are not finite numbers', () => {
    expect(crossedMilestone(Number.NaN, 31)).toBeNull()
    expect(crossedMilestone(28, Number.NaN)).toBeNull()
    expect(crossedMilestone(0, Number.POSITIVE_INFINITY)).toBeNull()
    expect(crossedMilestone(0, 31, 0)).toBeNull()
    expect(crossedMilestone(0, 31, Number.NaN)).toBeNull()
  })
})

describe('milestoneToAnnounce', () => {
  it('announces a crossed mark that has not been shown today', () => {
    expect(milestoneToAnnounce(28, 31, [])).toBe(30)
  })

  it('never repeats a mark already shown, even after the total fell and rose again', () => {
    // 35 back, a slow take drops it to 25, the next climbs to 40: the
    // 30 mark is crossed again in arithmetic but was already celebrated.
    expect(milestoneToAnnounce(25, 40, [30])).toBeNull()
  })

  it('still announces a higher mark past one already shown', () => {
    expect(milestoneToAnnounce(55, 62, [30])).toBe(60)
  })
})

describe('milestoneBody', () => {
  it('names the mark in words', () => {
    expect(milestoneBody(30)).toBe('30 minutes earned back today.')
    expect(milestoneBody(60)).toBe('1 hour earned back today.')
    expect(milestoneBody(90)).toBe('1 hour 30 minutes earned back today.')
  })
})

describe('trayTooltip', () => {
  it('is plain murmur until the day has a minute back', () => {
    expect(trayTooltip(0)).toBe('murmur')
    expect(trayTooltip(0.4)).toBe('murmur')
    expect(trayTooltip(-2)).toBe('murmur')
    expect(trayTooltip(Number.NaN)).toBe('murmur')
    expect(trayTooltip(Number.POSITIVE_INFINITY)).toBe('murmur')
  })

  it('carries the short form once the day has some', () => {
    expect(trayTooltip(42)).toBe('murmur · 42 min back today')
    expect(trayTooltip(65)).toBe('murmur · 1 h 5 min back today')
  })
})
