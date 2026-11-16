// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  ARRIVE,
  LIFT,
  OFFER_AFTER_DAYS,
  arrivalDue,
  calendarDaysSince,
  dailyFillDue,
  fillDurationMs,
  fillStrokes,
  liftWaitMs,
  markFor,
  rollDelaysMs,
  resolveInstallDate,
  shouldOfferPro,
  strokeProgress,
  thanksDue
} from './proMark'

const free = { pro: false, retained: false }
const parked = { pro: false, retained: true }
const active = { pro: true }
const founding = { pro: true, founder: true }

/** Local noon on a calendar day, so daylight saving never moves a day. */
const day = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

describe('markFor', () => {
  it('fills for Pro and founding members everywhere', () => {
    for (const status of [active, founding]) {
      expect(markFor('header', status)).toBe('filled')
      expect(markFor('offer', status)).toBe('filled')
    }
  })

  it('outlines the offer surfaces for free users and a parked key, with no header mark', () => {
    for (const status of [free, parked]) {
      expect(markFor('header', status)).toBe('none')
      expect(markFor('offer', status)).toBe('outlined')
    }
  })

  it('shows nothing while the status loads', () => {
    expect(markFor('header', null)).toBe('none')
    expect(markFor('offer', null)).toBe('none')
  })
})

describe('calendarDaysSince', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(calendarDaysSince(day(2026, 10, 1, 23), day(2026, 10, 2, 1))).toBe(1)
    expect(calendarDaysSince(day(2026, 10, 1, 1), day(2026, 10, 1, 23))).toBe(0)
    expect(calendarDaysSince(day(2026, 10, 1), day(2026, 10, 31))).toBe(30)
  })

  it('crosses a daylight saving change without losing a day', () => {
    expect(calendarDaysSince(day(2026, 10, 20), day(2026, 11, 19))).toBe(30)
  })
})

describe('shouldOfferPro', () => {
  const installedAt = day(2026, 9, 1)
  const base = { installedAt, done: false, status: free }

  it('waits until day 30: day 29 no, day 30 yes', () => {
    expect(OFFER_AFTER_DAYS).toBe(30)
    expect(shouldOfferPro({ ...base, now: day(2026, 9, 30) })).toBe(false)
    expect(shouldOfferPro({ ...base, now: day(2026, 10, 1) })).toBe(true)
    expect(shouldOfferPro({ ...base, now: day(2026, 12, 1) })).toBe(true)
  })

  it('never shows again once answered', () => {
    expect(shouldOfferPro({ ...base, done: true, now: day(2026, 10, 5) })).toBe(false)
  })

  it('never shows to Pro users, founding members, or a parked key', () => {
    for (const status of [active, founding, parked]) {
      expect(shouldOfferPro({ ...base, status, now: day(2026, 10, 5) })).toBe(false)
    }
  })

  it('stays quiet without a status or an install date', () => {
    expect(shouldOfferPro({ ...base, status: null, now: day(2026, 10, 5) })).toBe(false)
    expect(shouldOfferPro({ ...base, installedAt: 0, now: day(2026, 10, 5) })).toBe(false)
  })
})

describe('resolveInstallDate', () => {
  const now = day(2026, 10, 22)

  it('keeps a recorded date', () => {
    expect(resolveInstallDate(day(2026, 9, 9), day(2026, 9, 1), now)).toBe(day(2026, 9, 9))
  })

  it('dates an install from before the field by its earliest dictation', () => {
    expect(resolveInstallDate(0, day(2026, 9, 20), now)).toBe(day(2026, 9, 20))
  })

  it('dates a new install, or one with no dictations, by this launch', () => {
    expect(resolveInstallDate(0, null, now)).toBe(now)
  })

  it('ignores a dictation date from the future or garbage', () => {
    expect(resolveInstallDate(0, now + 86_400_000, now)).toBe(now)
    expect(resolveInstallDate(Number.NaN, Number.NaN, now)).toBe(now)
  })
})

describe('dailyFillDue', () => {
  const base = { status: active, enabled: true, lastPaintDay: '2026-10-21', today: '2026-10-22' }

  it('plays on the first open of a new day', () => {
    expect(dailyFillDue(base)).toBe(true)
  })

  it('stays still the rest of the same day', () => {
    expect(dailyFillDue({ ...base, lastPaintDay: '2026-10-22' })).toBe(false)
  })

  it('never plays for free users, a parked key, or with the switch off', () => {
    expect(dailyFillDue({ ...base, status: free })).toBe(false)
    expect(dailyFillDue({ ...base, status: parked })).toBe(false)
    expect(dailyFillDue({ ...base, status: null })).toBe(false)
    expect(dailyFillDue({ ...base, enabled: false })).toBe(false)
  })
})

describe('fillStrokes', () => {
  it('draws the same strokes for the same day, every time', () => {
    expect(fillStrokes('2026-10-22')).toEqual(fillStrokes('2026-10-22'))
  })

  it('draws a different badge on a different day', () => {
    expect(fillStrokes('2026-10-23')).not.toEqual(fillStrokes('2026-10-22'))
  })

  it('paints 3 or 4 strokes: 1 shallow ground, the rest steeper from their own angles', () => {
    for (let i = 1; i <= 60; i++) {
      const strokes = fillStrokes(`2026-${String(Math.ceil(i / 28) + 9).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`)
      expect(strokes.length === 3 || strokes.length === 4).toBe(true)
      expect(Math.abs(strokes[0].angle)).toBeLessThanOrEqual(7)
      const steep = strokes.slice(1).map((s) => s.angle)
      for (const a of steep) expect(Math.abs(a)).toBeGreaterThanOrEqual(11)
      // Each later stroke comes from its own angle.
      for (let x = 0; x < steep.length; x++) {
        for (let y = x + 1; y < steep.length; y++) expect(Math.abs(steep[x] - steep[y])).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('runs the ground stroke wet and the rest dry, but not coarse (the soft grain)', () => {
    for (let i = 1; i <= 60; i++) {
      const [ground, ...steep] = fillStrokes(`2026-12-${String((i % 28) + 1).padStart(2, '0')}-${i}`)
      expect(ground.dry).toBeLessThan(0.5)
      for (const s of steep) {
        expect(s.dry).toBeGreaterThanOrEqual(0.5)
        expect(s.dry).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('lands in about 3 seconds (LB picked the slow speed)', () => {
    for (let i = 1; i <= 40; i++) {
      const d = `2026-11-${String((i % 28) + 1).padStart(2, '0')}-${i}`
      const ms = fillDurationMs(fillStrokes(d))
      expect(ms).toBeGreaterThan(2400)
      expect(ms).toBeLessThan(3300)
    }
  })

  it('paints each stroke from nothing to whole, fast at first', () => {
    const [s] = fillStrokes('2026-10-22')
    expect(strokeProgress(s, s.startMs - 1)).toBe(0)
    expect(strokeProgress(s, s.startMs + s.durMs)).toBe(1)
    expect(strokeProgress(s, s.startMs + s.durMs / 4)).toBeGreaterThan(0.5)
  })
})

describe('LIFT', () => {
  it('lifts to 2x with a small overshoot and settles back without one', () => {
    expect(LIFT.scale).toBe(2)
    expect(LIFT.overshoot).toBeGreaterThan(LIFT.scale)
    expect(LIFT.overshoot).toBeLessThan(2.1)
    expect(LIFT.waitMs + LIFT.growMs + LIFT.holdMs + LIFT.settleMs).toBeLessThan(2000)
  })

  it('waits for the window murmur opens at launch to be seen, and not after', () => {
    // The page mounts about 0.6 s after the window appears: the lift now
    // comes about 1.5 s later than the 1 s it took before.
    expect(liftWaitMs(600)).toBe(1900)
    expect(liftWaitMs(2149)).toBe(LIFT.waitMs + 1)
    expect(liftWaitMs(2150)).toBe(LIFT.waitMs)
    expect(liftWaitMs(2300)).toBe(LIFT.waitMs)
    expect(liftWaitMs(60_000)).toBe(LIFT.waitMs)
  })
})

describe('rollDelaysMs', () => {
  it('rolls from the top of the window down, one step apart, after the header', () => {
    // The rail's mark sits low on screen, the section title higher, Profiles highest.
    const rail = { top: 600, left: 40 }
    const title = { top: 120, left: 220 }
    const profiles = { top: 80, left: 300 }
    expect(rollDelaysMs([rail, profiles, title])).toEqual([450, 150, 300])
  })

  it('breaks a tie on the same line from the left', () => {
    expect(rollDelaysMs([{ top: 50, left: 200 }, { top: 50, left: 20 }])).toEqual([300, 150])
  })

  it("finishes the 3 marks' glows (rail, Profiles, section title) inside the 3 s they stay arriving", () => {
    expect(3 * ARRIVE.stepMs + ARRIVE.glowMs).toBeLessThan(3000)
  })
})

describe('arrivalDue', () => {
  const now = 1_000_000

  it('plays a fresh purchase once, even when the mark mounts in the same instant', () => {
    expect(arrivalDue(now - 50, 0, now)).toBe(true)
    expect(arrivalDue(now, 0, now)).toBe(true)
  })

  it('never replays one already played, or a stale one when the header remounts later', () => {
    expect(arrivalDue(now - 50, now - 50, now)).toBe(false)
    expect(arrivalDue(now - 5000, 0, now)).toBe(false)
    expect(arrivalDue(0, 0, now)).toBe(false)
  })
})

describe('thanksDue', () => {
  it('says thank you once after an activation, to Pro only', () => {
    expect(thanksDue(active, true)).toBe(true)
    expect(thanksDue(founding, true)).toBe(true)
    expect(thanksDue(active, false)).toBe(false)
    expect(thanksDue(free, true)).toBe(false)
    expect(thanksDue(parked, true)).toBe(false)
    expect(thanksDue(null, true)).toBe(false)
  })
})
