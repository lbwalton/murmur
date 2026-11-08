// SPDX-License-Identifier: GPL-3.0-only
// When held recordings are checked (US-137): at launch, on a slow timer
// that survives a sleep, and the moment the soonest one comes due. A
// timer cannot run while murmur is closed, so a recording past its limit
// then goes at the next launch.

// A due take that is mid-retry waits for this, so the check cannot spin.
const SOONEST_CHECK_MS = 5_000

/** Starts the checks and returns a way to run one now, for when a new
 *  take is held. check answers with how long until the next one is due,
 *  or null when none is waiting. */
export function watchHeld(check: () => Promise<number | null>, everyMs: number): () => void {
  let due: NodeJS.Timeout | undefined
  const run = (): void => {
    void check()
      .catch(() => null)
      .then((nextMs) => {
        clearTimeout(due)
        // The slow timer is the ceiling: a take stamped far ahead by a
        // clock change would overflow setTimeout, which then fires at once.
        due = nextMs === null ? undefined : setTimeout(run, Math.min(Math.max(nextMs, SOONEST_CHECK_MS), everyMs)).unref()
      })
  }
  run()
  setInterval(run, everyMs).unref()
  return run
}
