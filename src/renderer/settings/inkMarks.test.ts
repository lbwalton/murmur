// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { daySeed } from './inkMarks'

describe('daySeed', () => {
  it('gives a day the same seed every time, and its neighbors other seeds', () => {
    expect(daySeed('2026-10-03')).toBe(daySeed('2026-10-03'))
    const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    expect(new Set(week.map(daySeed)).size).toBe(week.length)
    for (const day of week) expect(Number.isInteger(daySeed(day)) && daySeed(day) >= 0).toBe(true)
  })
})
