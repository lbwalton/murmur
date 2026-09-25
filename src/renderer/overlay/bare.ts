// SPDX-License-Identifier: GPL-3.0-only
// The bare look's canvas treatment (US-061), shared by the pulse and
// speckle waveforms. With no box behind them, marks need two things a
// pill gives for free: an edge that reads over a white page, and room
// to move without meeting a hard line. The canvas overhangs its slot by
// OVERHANG on every side and fades to nothing before its own edge.

// Must match the margins on .look-bare .speckle in overlay/styles.css.
export const OVERHANG = { x: 20, y: 12 }

/** Reads the ink edge color from the tokens, so no color lives here. */
export function inkEdge(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--ink-edge').trim() || 'rgba(15, 14, 17, 0.55)'
}

/** A tight ink shadow under everything drawn next. Canvas shadows ignore
 *  the context scale, so the blur is given in device pixels. */
export function applyInkEdge(ctx: CanvasRenderingContext2D, color: string, dpr: number): void {
  ctx.shadowColor = color
  ctx.shadowBlur = 2.2 * dpr
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/** Dissolve what was drawn toward every edge of the surface, across and
 *  down, so no mark is ever cut off by the canvas bounds. The right
 *  fade is wider by default for pulse, whose rings travel right and
 *  should thin out before they arrive; the even dust passes a
 *  symmetric one so its right column is not dimmer than its left. */
export function fadeToEdges(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rightFadeStart = 0.82
): void {
  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'destination-in'
  const across = ctx.createLinearGradient(0, 0, width, 0)
  across.addColorStop(0, 'rgba(0, 0, 0, 0)')
  across.addColorStop(0.12, 'rgba(0, 0, 0, 1)')
  across.addColorStop(rightFadeStart, 'rgba(0, 0, 0, 1)')
  across.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = across
  ctx.fillRect(0, 0, width, height)
  const down = ctx.createLinearGradient(0, 0, 0, height)
  down.addColorStop(0, 'rgba(0, 0, 0, 0)')
  down.addColorStop(0.22, 'rgba(0, 0, 0, 1)')
  down.addColorStop(0.78, 'rgba(0, 0, 0, 1)')
  down.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = down
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
