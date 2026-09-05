// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { formatDuration } from './time'

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('formats under a minute', () => {
    expect(formatDuration(7_400)).toBe('0:07')
  })

  it('formats minutes and pads seconds', () => {
    expect(formatDuration(83_000)).toBe('1:23')
    expect(formatDuration(600_000)).toBe('10:00')
  })

  it('clamps negatives to zero', () => {
    expect(formatDuration(-500)).toBe('0:00')
  })
})
