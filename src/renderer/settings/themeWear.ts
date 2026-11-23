// SPDX-License-Identifier: GPL-3.0-only
// Puts what the window wears (US-151) on <html>: data-theme for the
// colors, data-glass for Soft and Clearest (Clear is the :root values),
// data-ground='scene' when a painting fills the window behind the cards,
// and data-wear for how worn a paper theme is today (US-186; left off on
// fresh paper). tokens.css and styles.css read these attributes.
import { WEAR_STEPS } from '../../shared/paperWear'
import { type Worn, normalizeGlass, normalizeGround, normalizeMotion, normalizeTheme, wornLook } from '../../shared/themes'
import { THEME_SCENES } from './scenes'

export function wearTheme(worn: Worn, wear = 0, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = worn.theme
  if (worn.glass === 'clear') delete root.dataset.glass
  else root.dataset.glass = worn.glass
  if (worn.scene) root.dataset.ground = 'scene'
  else delete root.dataset.ground
  if (wear > 0) root.dataset.wear = String(wear)
  else delete root.dataset.wear
}

/** Whether a theme's painting wears through the day (US-186). */
export const paintingWears = (scene: string | null | undefined): boolean => Boolean(scene && THEME_SCENES[scene]?.worn)

/** Today's paper wear from the window's address (US-186): main reads it
 *  from the painting book, so worn paper opens worn. 0 when absent. */
export function addressWear(search: string): number {
  const wear = Number(new URLSearchParams(search).get('wear'))
  return Number.isInteger(wear) && wear > 0 && wear <= WEAR_STEPS ? wear : 0
}

/** The theme from the window's address, worn before the first paint. The
 *  saved pick is trusted until the belt and Pro are known. */
export function wearFromAddress(search: string): void {
  const q = new URLSearchParams(search)
  if (!q.has('theme')) return
  const worn = wornLook(
    {
      uiTheme: normalizeTheme(q.get('theme')),
      ground: normalizeGround(q.get('ground')),
      glass: normalizeGlass(q.get('glass')),
      motion: normalizeMotion(null)
    },
    null,
    true
  )
  wearTheme(worn, paintingWears(worn.scene) ? addressWear(search) : 0)
}
