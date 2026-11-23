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
  /** The opaque fills other colors are painted over, when there are more
   *  than the scene-sky tokens (a sea under its foam). The peak test lays
   *  every color over the lightest of them (the darkest, for a light
   *  painting). */
  grounds?: readonly string[]
  /** Colors that really land on one another, bottom first, each at its
   *  alpha (a spark over its own halo over the fire's glow). The peak test
   *  holds each whole stack, over the same ground, as it holds 1 color. */
  stacks?: ReadonlyArray<ReadonlyArray<readonly [string, number]>>
  init(rand: () => number): S
  /** Everything that never moves, drawn once per size, scale and palette
   *  into a layer the page keeps. */
  drawStill(ctx: CanvasRenderingContext2D, state: S, palette: Palette): void
  /** What moves, drawn over the still layer each frame. tMs is how far the
   *  motion has run (0 for the still frame); dtSec is the step since the
   *  last frame. */
  drawMoving(ctx: CanvasRenderingContext2D, state: S, palette: Palette, tMs: number, dtSec: number): void
}
