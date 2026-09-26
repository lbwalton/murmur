// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { dayKey } from './history'
import { fireTimeFor, parseRecapTime, recapBody, shouldFire } from './recap'

const at = (h: number, m: number) => new Date(2026, 8, 5, h, m).getTime()

describe('recapBody', () => {
  it('keeps the quiet-day sentence when nothing was dictated', () => {
    expect(recapBody({ sessions: 0, words: 0, minutes: 0, minutesBack: 0 })).toBe(
      'A quiet day: no dictations. Your hotkey misses you.'
    )
  })

  it('reads the day in numbers and stays unchanged with no time back', () => {
    expect(recapBody({ sessions: 1, words: 12, minutes: 0.5, minutesBack: 0 })).toBe(
      '1 session, 0.5 minutes, 12 words today.'
    )
    expect(recapBody({ sessions: 2, words: 40, minutes: 1.1, minutesBack: 0.4 })).toBe(
      '2 sessions, 1.1 minutes, 40 words today.'
    )
  })

  it('adds the time back clause once the day has at least a minute', () => {
    expect(recapBody({ sessions: 1, words: 60, minutes: 0.5, minutesBack: 1 })).toBe(
      '1 session, 0.5 minutes, 60 words today. 1 minute back.'
    )
    expect(recapBody({ sessions: 4, words: 1240, minutes: 12, minutesBack: 19 })).toBe(
      '4 sessions, 12 minutes, 1,240 words today. 19 minutes back.'
    )
    expect(recapBody({ sessions: 9, words: 4000, minutes: 40, minutesBack: 65.2 })).toBe(
      '9 sessions, 40 minutes, 4,000 words today. 1 hour 5 minutes back.'
    )
  })
})

describe('parseRecapTime', () => {
  it('parses 24-hour times and rejects garbage', () => {
    expect(parseRecapTime('17:30')).toEqual({ hour: 17, minute: 30 })
    expect(parseRecapTime('9:05')).toEqual({ hour: 9, minute: 5 })
    expect(parseRecapTime('24:00')).toBeNull()
    expect(parseRecapTime('17:65')).toBeNull()
    expect(parseRecapTime('five')).toBeNull()
  })
})

describe('fireTimeFor', () => {
  it('lands on the same local day at the given time', () => {
    const fire = fireTimeFor(at(9, 0), { hour: 17, minute: 30 })
    expect(new Date(fire).getHours()).toBe(17)
    expect(new Date(fire).getMinutes()).toBe(30)
    expect(dayKey(fire)).toBe('2026-09-05')
  })
})

describe('shouldFire', () => {
  it('does not fire before the recap moment', () => {
    expect(shouldFire(at(17, 29), '17:30', null)).toBe(false)
  })

  it('fires at and after the moment, including hours late (slept machine)', () => {
    expect(shouldFire(at(17, 30), '17:30', null)).toBe(true)
    expect(shouldFire(at(23, 45), '17:30', null)).toBe(true)
  })

  it('fires only once per day', () => {
    expect(shouldFire(at(17, 31), '17:30', '2026-09-05')).toBe(false)
    expect(shouldFire(at(17, 31), '17:30', '2026-09-04')).toBe(true)
  })

  it('never fires on a malformed time', () => {
    expect(shouldFire(at(23, 0), 'bogus', null)).toBe(false)
  })
})
