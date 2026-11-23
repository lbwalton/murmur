// SPDX-License-Identifier: GPL-3.0-only
// Paper that wears through the day (US-186; LB's picks 2026-11-22: the
// paper and its cards both age, medium by the day's end, moved along by
// your own dictations). The wear follows today's painting a day: each
// take adds a stroke there, and the paper is as worn as it gets once
// today's painting is finished. It moves in steps, so every step is 1
// color set in tokens.css that look.test.ts holds to 4.5 to 1, and a new
// day starts on fresh paper.
import { type PaintingBook, isDayKey } from './painting'

/** The worn steps after fresh paper (0). */
export const WEAR_STEPS = 4

/** How worn the paper is after `takes` of a day's `target`: 0 is fresh,
 *  WEAR_STEPS the most a day wears it (today's painting finished). */
export function wearStep(takes: number, target: number): number {
  if (!Number.isFinite(takes) || !Number.isFinite(target) || takes <= 0 || target <= 0) return 0
  return Math.min(WEAR_STEPS, Math.floor((Math.min(takes, target) / target) * WEAR_STEPS))
}

/** Today's step, from the painting book (a day with no painting yet is
 *  fresh paper). */
export function todaysWear(book: Readonly<PaintingBook>, day: string): number {
  if (!isDayKey(day)) return 0
  const today = Object.hasOwn(book, day) ? book[day] : undefined
  return today ? wearStep(today.words.length, today.target) : 0
}
