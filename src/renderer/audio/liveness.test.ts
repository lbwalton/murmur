// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { LIVENESS_DEFAULTS, livenessAction } from './liveness'

const opts = { stallMs: 5000, armTimeoutMs: 15000 }

describe('livenessAction', () => {
  it('reports healthy while chunks are fresh', () => {
    expect(livenessAction({ now: 10_000, lastChunkAt: 9_500, armingSince: null }, opts)).toBe(
      'healthy'
    )
  })

  it('reports healthy exactly at the stall threshold', () => {
    expect(livenessAction({ now: 15_000, lastChunkAt: 10_000, armingSince: null }, opts)).toBe(
      'healthy'
    )
  })

  it('asks for a rearm once chunks have stalled past the threshold', () => {
    expect(livenessAction({ now: 15_001, lastChunkAt: 10_000, armingSince: null }, opts)).toBe(
      'rearm'
    )
  })

  it('asks for a rearm after a sleep-length gap', () => {
    // A machine asleep for an hour wakes with a huge chunk gap.
    expect(
      livenessAction({ now: 3_600_000, lastChunkAt: 10_000, armingSince: null }, opts)
    ).toBe('rearm')
  })

  it('waits while an arm attempt is in flight', () => {
    expect(
      livenessAction({ now: 20_000, lastChunkAt: 1_000, armingSince: 19_000 }, opts)
    ).toBe('wait')
  })

  it('abandons an arm attempt that has hung past the timeout', () => {
    // getUserMedia can hang right after wake; the attempt must not pin
    // the recorder in "arming" forever.
    expect(
      livenessAction({ now: 40_000, lastChunkAt: 1_000, armingSince: 24_000 }, opts)
    ).toBe('abandon')
  })

  it('keeps waiting exactly at the arm timeout', () => {
    expect(
      livenessAction({ now: 39_000, lastChunkAt: 1_000, armingSince: 24_000 }, opts)
    ).toBe('wait')
  })

  it('ships sane defaults: stall well under arm timeout, both in seconds', () => {
    expect(LIVENESS_DEFAULTS.stallMs).toBeGreaterThanOrEqual(2000)
    expect(LIVENESS_DEFAULTS.stallMs).toBeLessThan(LIVENESS_DEFAULTS.armTimeoutMs)
    expect(LIVENESS_DEFAULTS.watchTickMs).toBeLessThan(LIVENESS_DEFAULTS.stallMs)
  })
})
