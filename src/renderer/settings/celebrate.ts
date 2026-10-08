// SPDX-License-Identifier: GPL-3.0-only
// What the Journey celebrates when it opens (US-077): every rank climbed
// past the highest one already celebrated. A new belt among them gets the
// full ceremony (the newest new belt); a stripe or degree on the current
// belt gets the tape moment on the belt, after the ceremony if both.
import type { Promotion, RankSpec } from '../../shared/ranks'

export interface Celebration {
  /** The new belt to hold the ceremony for, if one was earned. */
  belt: RankSpec | null
  /** The current rank, when it is a stripe or degree earned since. */
  tape: RankSpec | null
  /** The ladder index of the highest rank now reached: remember it. */
  reached: number
}

/** A promotion this fresh is celebrated even with no record yet (the
 *  first open after the very first belt). */
export const FRESH_MS = 24 * 60 * 60 * 1000

/**
 * Celebrates by height, not by date: promotions are recomputed from the
 * history that remains, so after a retention cut or Clear all the same
 * ranks can carry newer dates; a rank at or below the highest already
 * celebrated (seenIndex) never plays again. With no record (seenIndex
 * null), only promotions from the last day count, so a long history
 * never replays its old belts on first open.
 */
export function toCelebrate(
  promotions: readonly Promotion[],
  ladder: readonly RankSpec[],
  seenIndex: number | null,
  now: number
): Celebration | null {
  const indexed = promotions
    .map((p) => ({ p, index: ladder.findIndex((r) => r.id === p.id) }))
    .filter((x) => x.index >= 0)
  const latest = indexed.at(-1)
  if (!latest) return null
  const fresh = indexed.filter((x) => (seenIndex === null ? now - x.p.at <= FRESH_MS : x.index > seenIndex))
  if (fresh.length === 0) return null
  const newBelt = (index: number): boolean => index === 0 || ladder[index - 1].belt !== ladder[index].belt
  const belts = fresh.filter((x) => newBelt(x.index))
  const belt = belts.at(-1) ?? null
  const top = fresh.at(-1)
  const tape = top && !newBelt(top.index) && (!belt || top.index > belt.index) ? ladder[top.index] : null
  return { belt: belt ? ladder[belt.index] : null, tape, reached: latest.index }
}

const SEEN_KEY = 'murmur-ceremony-rank'
// Kept here too, so a window without storage still celebrates only once.
let seenInMemory: number | null = null

/** The ladder index of the highest rank already celebrated, or null. */
export function lastCelebrated(): number | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (raw !== null) {
      const value = Number(raw)
      if (Number.isInteger(value) && value >= 0) return value
    }
  } catch {
    // Storage unavailable: fall back to this session's memory.
  }
  return seenInMemory
}

/** Raises the mark to index; never lowers it (after Clear all the rank
 *  drops, and belts re-earned below the mark are not celebrated again). */
export function rememberCelebrated(index: number): void {
  const before = lastCelebrated()
  seenInMemory = before === null ? index : Math.max(before, index)
  try {
    localStorage.setItem(SEEN_KEY, String(seenInMemory))
  } catch {
    // Remembered in memory for this session.
  }
}
