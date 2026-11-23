// SPDX-License-Identifier: GPL-3.0-only
// The window's themes and how one is worn (US-151). Pure: given the saved
// look choices, which themes this person has earned, and whether they own
// murmur Pro, answer what the window wears. A theme is 1 entry in
// shared/themes.json; its colors live in tokens.css, its painting (when it
// has one) in src/renderer/settings/scenes/.
import themesFile from '../../shared/themes.json'
import type { CosmeticItem } from './cosmetics'

export interface ThemeEntry extends CosmeticItem {
  /** The painting behind the cards, or null for a theme that is colors only. */
  scene: string | null
  /** What moves in the painting (petals, rain, sparks), or null for a
   *  painting that stays still. */
  motion: string | null
  /** Always solid (US-174, rice paper): the painting is the window's
   *  ground, so the desktop never shows through and there is no glass
   *  level to pick. */
  solid?: boolean
  /** Wears through the day with today's painting (US-186, rice paper):
   *  its painting and tokens.css say how at each step. */
  wears?: boolean
}

export const THEMES: readonly ThemeEntry[] = (themesFile as { themes: ThemeEntry[] }).themes

/** Night studio: the theme everyone has, worn whenever another cannot be. */
export const DEFAULT_THEME = 'ember'

/** What shows behind the cards when the theme has a painting. */
export type Ground = 'scene' | 'desktop'
export const GROUNDS: readonly Ground[] = ['scene', 'desktop']

/** How much the glass lets through (murmur Pro). Clear is everyone's. */
export type GlassLevel = 'soft' | 'clear' | 'clearest'
export const GLASS_LEVELS: readonly GlassLevel[] = ['soft', 'clear', 'clearest']

/** How fast a painting moves. Reduce motion always gets it still. */
export type Motion = 'off' | 'slow' | 'normal' | 'lively'
export const MOTIONS: readonly Motion[] = ['off', 'slow', 'normal', 'lively']

export function themeById(id: string): ThemeEntry | undefined {
  return THEMES.find((t) => t.id === id)
}

export const normalizeTheme = (v: unknown): string =>
  typeof v === 'string' && themeById(v) ? v : DEFAULT_THEME
export const normalizeGround = (v: unknown): Ground => (GROUNDS.includes(v as Ground) ? (v as Ground) : 'scene')
export const normalizeGlass = (v: unknown): GlassLevel =>
  GLASS_LEVELS.includes(v as GlassLevel) ? (v as GlassLevel) : 'clear'
export const normalizeMotion = (v: unknown): Motion => (MOTIONS.includes(v as Motion) ? (v as Motion) : 'normal')

/** Does this theme need murmur Pro? */
export const needsPro = (theme: ThemeEntry): boolean => theme.unlock?.pro === true

export interface LookChoices {
  uiTheme: string
  ground: Ground
  glass: GlassLevel
  motion: Motion
}

export interface Worn {
  theme: string
  /** The painting behind the cards, or null for none (no scene, or the
   *  desktop picked as the ground). */
  scene: string | null
  glass: GlassLevel
  motion: Motion
}

/**
 * What the window wears. earned lists the theme ids this person's belt
 * has unlocked; null means not known yet (the first paint), when the
 * saved pick is trusted, since it could only be saved once earned.
 * A theme that is not earned, or needs Pro without it, is worn as night
 * studio, and glass other than Clear needs Pro. A solid theme always wears
 * its painting at Clear, and a painting that never moves wears motion off.
 */
export function wornLook(choices: LookChoices, earned: readonly string[] | null, pro: boolean): Worn {
  const picked = themeById(choices.uiTheme)
  const allowed =
    picked !== undefined && (earned === null || earned.includes(picked.id)) && (!needsPro(picked) || pro)
  const theme = allowed ? picked : themeById(DEFAULT_THEME)
  const solid = theme?.solid === true
  return {
    theme: theme?.id ?? DEFAULT_THEME,
    scene: theme?.scene && (choices.ground === 'scene' || solid) ? theme.scene : null,
    glass: pro && !solid ? choices.glass : 'clear',
    motion: theme?.motion ? choices.motion : 'off'
  }
}

/** The painting's speed for a motion setting: 0 stands still. */
export function motionSpeed(motion: Motion): number {
  return motion === 'slow' ? 0.5 : motion === 'lively' ? 1.7 : motion === 'off' ? 0 : 1
}

/** Whether a painting moves now: only while its window is showing and in
 *  front, motion is on, and the system does not ask for less motion. */
export function sceneMoves(state: { visible: boolean; focused: boolean; motion: Motion; reducedMotion: boolean }): boolean {
  return state.visible && state.focused && !state.reducedMotion && motionSpeed(state.motion) > 0
}
