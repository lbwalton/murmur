// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { LIVENESS_DEFAULTS, livenessAction, signalAction } from './liveness'

const opts = { stallMs: 5000, armTimeoutMs: 15000 }
const signalOpts = { silentMs: 3000, minSignalChunks: 20, maxSilentRearms: 5 }

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

describe('signalAction', () => {
  // A graph installed at 10s; chunk times are the stream's own clock.
  const fresh = { armedAt: 10_000, silentRearms: 0 }

  it('reads live once the graph has carried sustained signal', () => {
    expect(signalAction({ ...fresh, lastChunkAt: 10_100, signalChunks: 20 }, signalOpts)).toBe(
      'live'
    )
  })

  it('stays live when a proven graph goes quiet later', () => {
    // A pause, or a noise gate emitting digital zero between words. Not
    // a fault: rebuilding here would churn gated mic paths on every
    // pause. A stream that truly dies mid-session is the press-time
    // heal's job (dictation.ts).
    expect(
      signalAction({ ...fresh, lastChunkAt: 600_000, signalChunks: 20 }, signalOpts)
    ).toBe('live')
  })

  it('does not mistake a single pop for a microphone', () => {
    // The 2026-09-17 first press measured one 0.0129 transient in an
    // otherwise dead stream; a few chunks of that must not read as proof.
    expect(signalAction({ ...fresh, lastChunkAt: 13_001, signalChunks: 3 }, signalOpts)).toBe(
      'rearm'
    )
  })

  it('probes a fresh graph that has delivered no chunks yet', () => {
    expect(signalAction({ ...fresh, lastChunkAt: 10_000, signalChunks: 0 }, signalOpts)).toBe(
      'probing'
    )
  })

  it('keeps probing exactly at the window', () => {
    expect(signalAction({ ...fresh, lastChunkAt: 13_000, signalChunks: 0 }, signalOpts)).toBe(
      'probing'
    )
  })

  it('a chunk stall is not a silent stream', () => {
    // Chunks stopped 2s after install and never resumed. In the stream's
    // clock nothing has moved, so the verdict freezes at probing however
    // long the wall clock runs; the chunk watchdog owns the stall.
    expect(signalAction({ ...fresh, lastChunkAt: 12_000, signalChunks: 0 }, signalOpts)).toBe(
      'probing'
    )
  })

  it('asks for a rearm once silent chunks have flowed past the window', () => {
    // The 2026-09-17 wake: the resume re-arm came back with a stream
    // carrying nothing. Rebuild it without waiting for a press.
    expect(signalAction({ ...fresh, lastChunkAt: 13_001, signalChunks: 0 }, signalOpts)).toBe(
      'rearm'
    )
  })

  it('does not let a fresh graph reopen its own budget', () => {
    // The trap: if a rebuild counted as signal, a stream that comes back
    // dead every time would reset the budget on every rebuild and loop
    // forever. Probing is grace, not signal, so the count stands.
    expect(
      signalAction({ armedAt: 10_000, lastChunkAt: 13_001, signalChunks: 0, silentRearms: 5 }, signalOpts)
    ).toBe('exhausted')
  })

  it('keeps rearming while budget remains', () => {
    expect(
      signalAction({ armedAt: 10_000, lastChunkAt: 20_000, signalChunks: 0, silentRearms: 4 }, signalOpts)
    ).toBe('rearm')
  })

  it('gives up once the budget is spent, so a muted mic cannot loop forever', () => {
    expect(
      signalAction({ armedAt: 10_000, lastChunkAt: 20_000, signalChunks: 0, silentRearms: 5 }, signalOpts)
    ).toBe('exhausted')
  })

  it('reads live the moment sustained signal arrives, even after exhaustion', () => {
    // The user unmutes: the same graph now carries sound; nothing to rebuild.
    expect(
      signalAction({ armedAt: 10_000, lastChunkAt: 20_000, signalChunks: 20, silentRearms: 5 }, signalOpts)
    ).toBe('live')
  })

  it('ships sane defaults: a tick inside the window, proof beyond a pop, a real budget', () => {
    expect(LIVENESS_DEFAULTS.silentMs).toBeGreaterThanOrEqual(1000)
    expect(LIVENESS_DEFAULTS.watchTickMs).toBeLessThan(LIVENESS_DEFAULTS.silentMs)
    // A click or DC-settle pop is a handful of 128-frame chunks; a quiet
    // room's floor is in every chunk, so a live mic proves itself in
    // well under a tenth of a second.
    expect(LIVENESS_DEFAULTS.minSignalChunks).toBeGreaterThanOrEqual(10)
    expect(LIVENESS_DEFAULTS.minSignalChunks).toBeLessThanOrEqual(100)
    expect(LIVENESS_DEFAULTS.maxSilentRearms).toBeGreaterThanOrEqual(3)
  })
})
