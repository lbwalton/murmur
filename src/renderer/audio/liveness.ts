// SPDX-License-Identifier: GPL-3.0-only
// Pure decision logic for the warm-mic watchdogs. The capture graph
// proves it is alive by delivering worklet chunks continuously (even
// silence produces chunks); a gap means the graph died, however it
// died: sleep, device yank, driver reset, or a failed re-arm. A fresh
// graph proves it is real by carrying sustained signal (a quiet room's
// noise floor counts, a single wake pop does not); a graph that flows
// for a whole window without ever doing so has nothing behind it, the
// way a waking Mac or a reconfigured managed device hands one back.
// Kept pure so the thresholds and edge cases are unit testable.

export interface LivenessState {
  /** Date.now() at evaluation time. */
  now: number
  /** Date.now() when the last worklet chunk arrived (or last successful arm). */
  lastChunkAt: number
  /** Date.now() when an in-flight arm attempt started, or null. */
  armingSince: number | null
}

export interface LivenessOptions {
  /** Chunk silence longer than this means the graph is dead. */
  stallMs: number
  /** An arm attempt older than this is hung and must be abandoned. */
  armTimeoutMs: number
}

export type LivenessAction = 'healthy' | 'wait' | 'rearm' | 'abandon'

export interface SignalState {
  /** Date.now() when the last worklet chunk arrived: the stream's own clock. */
  lastChunkAt: number
  /** Date.now() when the current graph was installed. */
  armedAt: number
  /** Chunks from the current graph that carried signal (peak at or above the dead-stream floor). */
  signalChunks: number
  /** Silent-stream re-arms already spent on this outage. */
  silentRearms: number
}

export interface SignalOptions {
  /** A fresh graph that has flowed this long without proving itself is empty. */
  silentMs: number
  /** Signal chunks that prove a graph: more than a pop, far less than a syllable. */
  minSignalChunks: number
  /** Silent re-arms allowed per outage before giving up until signal returns or main asks. */
  maxSilentRearms: number
}

export type SignalAction = 'live' | 'probing' | 'rearm' | 'exhausted'

export const LIVENESS_DEFAULTS = {
  watchTickMs: 2000,
  stallMs: 5000,
  armTimeoutMs: 15_000,
  silentMs: 3000,
  minSignalChunks: 20,
  maxSilentRearms: 5
} as const

/**
 * Decide what the watchdog should do this tick. 'abandon' means the
 * current arm attempt hung (getUserMedia can hang right after wake) and
 * a fresh attempt should replace it.
 */
export function livenessAction(state: LivenessState, opts: LivenessOptions): LivenessAction {
  if (state.armingSince !== null) {
    return state.now - state.armingSince > opts.armTimeoutMs ? 'abandon' : 'wait'
  }
  return state.now - state.lastChunkAt > opts.stallMs ? 'rearm' : 'healthy'
}

/**
 * Decide what the signal watchdog should do this tick. Time is measured
 * in the stream's own clock (the last chunk's arrival), never the wall
 * clock: a stall freezes the verdict along with the chunks, so stalls
 * belong to the chunk watchdog alone. A graph that has carried sustained
 * signal is 'live' for good: going quiet later is a pause or a noise
 * gate (those output digital zero between words), and a stream that
 * truly dies mid-session is the press-time heal's job. A fresh graph is
 * 'probing' until its window passes; that grace is not signal, so a
 * stream that comes back dead every time cannot reopen its own budget.
 * 'exhausted' means the budget is spent: the stream stays as it is
 * until signal arrives or main asks for a re-arm.
 */
export function signalAction(state: SignalState, opts: SignalOptions): SignalAction {
  if (state.signalChunks >= opts.minSignalChunks) return 'live'
  if (state.lastChunkAt - state.armedAt <= opts.silentMs) return 'probing'
  return state.silentRearms >= opts.maxSilentRearms ? 'exhausted' : 'rearm'
}
