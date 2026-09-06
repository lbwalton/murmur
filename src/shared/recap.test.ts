// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { dayKey } from './history'
import { fireTimeFor, parseRecapTime, shouldFire } from './recap'

const at = (h: number, m: number) => new Date(2026, 8, 5, h, m).getTime()

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
