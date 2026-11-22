// SPDX-License-Identifier: GPL-3.0-only
// Theme paintings (US-151): the scene a theme paints behind the cards,
// drawn in code, seeded and deterministic like the brush engine, with no
// image files. Every color comes from the theme's block in tokens.css
// (the scene-* tokens), read from the element the canvas sits under, so
// a tile can preview a theme the window is not wearing.
import { mulberry, parseColor } from '../../brush'
import { fire } from './fire'
import { moonlit } from './moonlit'
import { rice } from './rice'
import { storm } from './storm'
import { wave } from './wave'
import { type Palette, SCENE_H, SCENE_W, type ThemeScene } from './space'

export { SCENE_H, SCENE_W, type Palette, type ThemeScene } from './space'

export const THEME_SCENES: Record<string, ThemeScene<never>> = {
  rice: rice as ThemeScene<never>,
  moonlit: moonlit as ThemeScene<never>,
  wave: wave as ThemeScene<never>,
  fire: fire as ThemeScene<never>,
  storm: storm as ThemeScene<never>
}

/** The theme's paint, read where the canvas is (a tile reads its preview
 *  theme). A missing token paints black rather than throwing. */
export function readPalette(el: Element, names: readonly string[]): Palette {
  const style = getComputedStyle(el)
  const out: Palette = {}
  for (const name of names) out[name] = parseColor(style.getPropertyValue(`--${name}`)) ?? [0, 0, 0]
  return out
}

/** Seeded per theme, so a painting is the same every time it is shown. */
export function sceneSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

export function sceneRandom(id: string): () => number {
  return mulberry(sceneSeed(id))
}

/** Scale and offset that make the 560 by 380 painting cover a box. */
export function coverFit(w: number, h: number): { scale: number; x: number; y: number } {
  const scale = Math.max(w / SCENE_W, h / SCENE_H)
  return { scale, x: (w - SCENE_W * scale) / 2, y: (h - SCENE_H * scale) / 2 }
}
