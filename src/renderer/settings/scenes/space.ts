// SPDX-License-Identifier: GPL-3.0-only
// The space every theme painting is drawn in (US-151), apart from the
// registry so a painting never imports the list it is part of.
import type { Rgb } from '../../brush'

/** Every painting is drawn on this canvas size, then scaled to cover. */
export const SCENE_W = 560
export const SCENE_H = 380

export type Palette = Record<string, Rgb>

export interface ThemeScene<S = unknown> {
  /** The tokens it paints with, without the leading dashes. */
  colors: readonly string[]
  /** For each token, the strongest alpha it is ever painted at (1 for
   *  opaque). look.test.ts holds every token at its peak, laid over the
   *  scene's lightest sky, at or under the theme's --scene-bright. */
  peaks: Readonly<Record<string, number>>
  init(rand: () => number): S
  /** Everything that never moves, drawn once per size, scale and palette
   *  into a layer the page keeps. */
  drawStill(ctx: CanvasRenderingContext2D, state: S, palette: Palette): void
  /** What moves, drawn over the still layer each frame. tMs is how far the
   *  motion has run (0 for the still frame); dtSec is the step since the
   *  last frame. */
  drawMoving(ctx: CanvasRenderingContext2D, state: S, palette: Palette, tMs: number, dtSec: number): void
}
