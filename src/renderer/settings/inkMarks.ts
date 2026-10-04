// SPDX-License-Identifier: GPL-3.0-only
// Small painted marks for the window's charts (US-085, US-087), all from
// the app's brush engine and all seeded by the date they stand for, so
// the same history paints the same marks on every open.
import { type Rgb, cachedBrush, drawSplat, path, splat, stroke } from '../brush'

/** A small, stable number from a day's key (YYYY-MM-DD). */
export function daySeed(day: string): number {
  let h = 7
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/**
 * One brush dab standing on a baseline, the ink dabs waveform's mark:
 * a short vertical stroke with a seeded lean, exactly `height` tall.
 */
export function paintDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  height: number,
  width: number,
  rgb: Rgb,
  seed: number,
  alpha = 1
): void {
  const tilt = (((seed * 37) % 7) - 3) * 0.22
  const P = path(
    [
      [x + tilt, baseY],
      [x - tilt, baseY - height]
    ],
    1.3
  )
  stroke(ctx, P, cachedBrush(seed % 64, 9), { width, rgb, alpha, dry: 0.32, ts: 0.18, te: 0.3, core: 0.35 })
}

/** One small blot of paint centered on (x, y), its edge seeded. */
export function paintBlot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, rgb: Rgb, seed: number, alpha = 1): void {
  // A blob splat with no thrown drops: just the soft-edged pool.
  drawSplat(ctx, splat(seed, x, y, { r: radius / 0.42, count: 0, mist: 0, blob: true }), rgb, 1, alpha)
}
