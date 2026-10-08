// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { STILL_LEVEL, stillLevels, voiceLevel } from './fakeVoice'

describe('voiceLevel', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => voiceLevel(i / 100))

  it('stays in the range the overlay hears from normal speech', () => {
    for (const level of samples) {
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(0.3)
    }
    expect(Math.max(...samples)).toBeGreaterThan(0.2)
    expect(STILL_LEVEL).toBeGreaterThan(0.1)
  })

  it('pauses between phrases, like a breath', () => {
    expect(voiceLevel(2.8)).toBeLessThan(0.01)
    expect(voiceLevel(3.3)).toBeLessThan(0.01)
    const quiet = samples.filter((level) => level < 0.02).length / samples.length
    expect(quiet).toBeGreaterThan(0.2)
    expect(quiet).toBeLessThan(0.6)
  })

  it('is the same voice every time', () => {
    expect(voiceLevel(1.234)).toBe(voiceLevel(1.234))
    expect(stillLevels(21)).toEqual(stillLevels(21))
    expect(stillLevels(21)).toHaveLength(21)
  })
})
