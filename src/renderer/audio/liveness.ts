// SPDX-License-Identifier: GPL-3.0-only
// Pure decision logic for the warm-mic watchdog. The capture graph
// proves it is alive by delivering worklet chunks continuously (even
// silence produces chunks); a gap means the graph died, however it
// died: sleep, device yank, driver reset, or a failed re-arm. Kept
// pure so the thresholds and edge cases are unit testable.

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

export const LIVENESS_DEFAULTS = {
  watchTickMs: 2000,
  stallMs: 5000,
  armTimeoutMs: 15_000
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
