// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { CUE_NAMES, CUES } from './cues'

describe('lock cue', () => {
  it('rises in 2 notes and is a known cue name', () => {
    expect(CUES.lock).toBeDefined()
    const [low, high] = CUES.lock.map((tone) => tone.freq)
    expect(CUES.lock).toHaveLength(2)
    expect(high).toBeGreaterThan(low)
    expect(CUE_NAMES).toContain('lock')
  })
})
