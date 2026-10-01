// SPDX-License-Identifier: GPL-3.0-only
// When a dead window comes back (US-071). Kept free of Electron so the
// schedule can be unit tested; revive.ts applies it.

export interface ReviveState {
  /** When the last renderer death happened, in ms since the epoch. */
  lastDeathAt: number
  /** Deaths so far in the current run of close-together deaths. */
  run: number
}

export const FRESH_REVIVE: ReviveState = { lastDeathAt: 0, run: 0 }
export const QUIET_MS = 60_000
export const FIRST_DELAY_MS = 250
export const MAX_DELAY_MS = 30_000

/** The delay before reloading after a death at now, and the state to
 *  keep. An isolated death revives fast; deaths within a minute of each
 *  other double the wait toward 30 seconds, so a crash loop cannot spin
 *  the CPU; a quiet minute starts the count over. Escalation keys off
 *  the deaths themselves, so a successful load cannot reset a loop. */
export function nextRevive(state: ReviveState, now: number): { delayMs: number; state: ReviveState } {
  const run = now - state.lastDeathAt > QUIET_MS ? 0 : state.run
  return {
    delayMs: Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** run),
    state: { lastDeathAt: now, run: run + 1 }
  }
}
