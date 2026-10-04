// SPDX-License-Identifier: GPL-3.0-only
// The drying sheen on the ink waveforms. When the brush lifts, one sheen
// crosses the paint as it dries; while processing runs long, a softer
// one follows every 2 seconds until the words land, so a long take or a
// slow provider never looks frozen (US-091, LaBroi 2026-10-02). Reduced
// motion shows none.

/** How often a softer sheen follows the first one, in ms. */
export const SHEEN_EVERY_MS = 2000

/** No pass starts after this much processing. A normal take finishes
 *  well inside it; a phase stuck in processing rests instead of
 *  animating forever. */
export const SHEEN_LIMIT_MS = 120_000

const FIRST_ALPHA = 0.4
const REPEAT_ALPHA = 0.22

/** A sheen's center across the wave (−0.3 to 1.4 of its width) u ms into
 *  its pass; it has crossed once the center passes 1.4. */
const pass = (u: number): number => (u / 700 - 0.2) * 1.5

export interface Sheen {
  /** Center as a fraction of the wave's width. */
  at: number
  /** Peak opacity of the highlight. */
  alpha: number
}

/** The sheen t ms into processing, or null between passes. */
export function sheenAt(t: number): Sheen | null {
  if (t < 0) return null
  const first = pass(t)
  if (first < 1.4) return { at: first, alpha: FIRST_ALPHA }
  if (t < SHEEN_EVERY_MS) return null
  if (t - (t % SHEEN_EVERY_MS) >= SHEEN_LIMIT_MS) return null
  const again = pass(t % SHEEN_EVERY_MS)
  return again < 1.4 ? { at: again, alpha: REPEAT_ALPHA } : null
}

/** Ms from t until the next pass starts, or null when none is coming
 *  (the loop can sleep that long between passes, or rest for good). */
export function nextSheenIn(t: number): number | null {
  const next = t < 0 ? 0 : (Math.floor(t / SHEEN_EVERY_MS) + 1) * SHEEN_EVERY_MS
  return next >= SHEEN_LIMIT_MS ? null : next - t
}

/** The sheen to draw now: only while processing, never with reduced motion. */
export function sheenFor(processing: boolean, t: number, reduced: boolean): Sheen | null {
  return processing && !reduced ? sheenAt(t) : null
}
