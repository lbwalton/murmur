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
  init(rand: () => number): S
  /** Draws 1 frame in the 560 by 380 space. tMs is how far the motion has
   *  run (0 for the still frame); dtSec is the step since the last frame. */
  draw(ctx: CanvasRenderingContext2D, state: S, palette: Palette, tMs: number, dtSec: number): void
}

