// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { FRESH_REVIVE, MAX_DELAY_MS, QUIET_MS, nextRevive } from './revive-rules'

function deaths(times: number[]): number[] {
  let state = FRESH_REVIVE
  return times.map((now) => {
    const next = nextRevive(state, now)
    state = next.state
    return next.delayMs
  })
}

describe('nextRevive', () => {
  it('revives an isolated death fast', () => {
    expect(deaths([1_000_000])).toEqual([250])
  })

  it('doubles the wait for deaths close together, capped at 30 seconds', () => {
    const times = Array.from({ length: 10 }, (_, i) => 1_000_000 + i * 1_000)
    expect(deaths(times)).toEqual([250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, MAX_DELAY_MS, MAX_DELAY_MS, MAX_DELAY_MS])
  })

  it('starts over after a quiet minute', () => {
    expect(deaths([1_000_000, 1_001_000, 1_002_000, 1_002_000 + QUIET_MS + 1])).toEqual([250, 500, 1_000, 250])
  })

  it('keeps escalating at exactly a minute apart', () => {
    expect(deaths([1_000_000, 1_000_000 + QUIET_MS])).toEqual([250, 500])
  })
})
