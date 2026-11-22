// SPDX-License-Identifier: GPL-3.0-only
// Small drawing helpers the theme paintings share (US-151, US-174).
import { type Rgb, rgba } from '../../brush'

/** a mod b, never negative: wraps a drifting mark back onto the canvas. */
export const mod = (a: number, b: number): number => ((a % b) + b) % b

/** A soft round light: c at alpha in the middle, fading to nothing at r. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: Rgb, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(c, alpha))
  g.addColorStop(1, rgba(c, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}
