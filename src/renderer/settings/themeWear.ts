// SPDX-License-Identifier: GPL-3.0-only
// Puts what the window wears (US-151) on <html>: data-theme for the
// colors, data-glass for Soft and Clearest (Clear is the :root values),
// and data-ground='scene' when a painting fills the window behind the
// cards. tokens.css and styles.css read these attributes.
import { type Worn, normalizeGlass, normalizeGround, normalizeMotion, normalizeTheme, wornLook } from '../../shared/themes'

export function wearTheme(worn: Worn, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = worn.theme
  if (worn.glass === 'clear') delete root.dataset.glass
  else root.dataset.glass = worn.glass
  if (worn.scene) root.dataset.ground = 'scene'
  else delete root.dataset.ground
}

/** The theme from the window's address, worn before the first paint. The
 *  saved pick is trusted until the belt and Pro are known. */
export function wearFromAddress(search: string): void {
  const q = new URLSearchParams(search)
  if (!q.has('theme')) return
  wearTheme(
    wornLook(
      {
        uiTheme: normalizeTheme(q.get('theme')),
        ground: normalizeGround(q.get('ground')),
        glass: normalizeGlass(q.get('glass')),
        motion: normalizeMotion(null)
      },
      null,
      true
    )
  )
}
