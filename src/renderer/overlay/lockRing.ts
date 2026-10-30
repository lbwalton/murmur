// SPDX-License-Identifier: GPL-3.0-only
// The hands-free ring (US-117, LaBroi's pick A, 2026-10-30): while murmur
// holds the mic, one brush stroke paints the pill's own outline all the
// way round and a little past its start, closing the loop the icon
// leaves open. Pure geometry and timing; LockRing.tsx paints it.
import type { OverlayLook } from '../../shared/overlay-state'

export { CANCEL_LINGER_MS } from '../../shared/overlay-state'

/** How far past its start the loop runs, as a share of the perimeter. */
export const RING_OVERLAP = 0.05
/** The loop draws in this long after the lock. */
export const LOCK_DRAW_MS = 650
/** The cancel scrape draws in this long. */
export const SCRAPE_MS = 340
/** Then the pill fades this long. */
export const PILL_FADE_MS = 380

/** The ring dries from signal amber to brand gold over the last minute
 *  before the hard stop at 12 minutes (TAKE_LIMIT_MS in main). */
const DRY_FROM_MS = 660_000
const DRY_TO_MS = 720_000

/** Where the walk starts: a little in from bottom center, so the open
 *  end of the icon's loop is where this one closes. */
const START_AT = 0.035
const STEPS = 96

/** The pill's own outline (a stadium, radius h/2) walked clockwise from
 *  just left of bottom center, all the way round and overlap of the
 *  perimeter past the start: 97 points. */
export function stadium(
  x: number,
  y: number,
  w: number,
  h: number,
  overlap = RING_OVERLAP
): Array<[number, number]> {
  const r = h / 2
  const cx = x + w / 2
  const flat = Math.max(0, w - h)
  const perimeter = 2 * flat + 2 * Math.PI * r
  const at = (u: number): [number, number] => {
    u = ((u % perimeter) + perimeter) % perimeter
    const half = flat / 2
    if (u < half) return [cx - u, y + h]
    u -= half
    if (u < Math.PI * r) {
      const a = Math.PI / 2 + u / r
      return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]
    }
    u -= Math.PI * r
    if (u < flat) return [x + r + u, y]
    u -= flat
    if (u < Math.PI * r) {
      const a = -Math.PI / 2 + u / r
      return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]
    }
    u -= Math.PI * r
    return [x + w - r - u, y + h]
  }
  const start = perimeter * START_AT
  const end = start + perimeter * (1 + overlap)
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= STEPS; i++) pts.push(at(start + ((end - start) * i) / STEPS))
  return pts
}

/** How far the ring has dried toward brand gold, elapsedMs into the
 *  take: 0 until 11:00, then linear to 1 at 12:00. */
export function ringDryness(elapsedMs: number): number {
  return Math.min(1, Math.max(0, (elapsedMs - DRY_FROM_MS) / (DRY_TO_MS - DRY_FROM_MS)))
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The box the ring goes round: the pill itself, or in bare the needle
 *  (the dot and the waveform together) inflated 12 px across and 7 px
 *  up and down. */
export function ringBox(target: Box, look: OverlayLook): Box {
  if (look !== 'bare') return target
  return { x: target.x - 12, y: target.y - 7, w: target.w + 24, h: target.h + 14 }
}

/** The brush the ring paints with in each look. */
export function ringBrush(look: OverlayLook): { seed: number; width: number } {
  if (look === 'compact') return { seed: 41, width: 3.3 }
  return { seed: 7, width: look === 'bare' ? 3.8 : 4.6 }
}

/** The cancel scrape: one stroke across the box at 56 percent of its
 *  height, rising a little to the right. */
export function scrapePoints(box: Box): Array<[number, number]> {
  const x0 = box.x + 10
  const x1 = box.x + box.w - 10
  const ym = box.y + box.h * 0.56
  return [
    [x0, ym + 3],
    [(x0 + x1) / 2, ym - 1],
    [x1, ym - 4]
  ]
}
