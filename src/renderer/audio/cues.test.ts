// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { CUE_NAMES, CUES } from './cues'

describe('lock cue', () => {
  it('is 2 light ticks on one note, unlike the start blip, and a known cue name', () => {
    expect(CUE_NAMES).toContain('lock')
    expect(CUES.lock).toHaveLength(2)
    const [first, second] = CUES.lock
    expect(first.freq).toBe(1319)
    expect(second.freq).toBe(first.freq)
    expect(second.at).toBeGreaterThan(first.at)
    // The start blip rises across 2 notes; the lock never does.
    expect(CUES.start.map((t) => t.freq)).not.toEqual(CUES.lock.map((t) => t.freq))
    expect(new Set(CUES.start.map((t) => t.freq)).size).toBeGreaterThan(1)
  })
})
