// SPDX-License-Identifier: GPL-3.0-only
// The window's look (US-150): glass that shows the desktop where the
// system can do it, and a solid window with a gold glow where it cannot
// or the person asked for less transparency. Pure, so main, smoke and
// the tests agree.

export type WindowLook = 'glass' | 'solid'

/** macOS: the material behind a window's content. Checked against the
 *  Electron 44 typings (BrowserWindow `vibrancy`), 2026-11-12. */
export const MAC_VIBRANCY = 'under-window' as const
/** Windows 11: the acrylic background material (BrowserWindow
 *  `backgroundMaterial`), which Electron supports from 22H2 up. */
export const WIN_MATERIAL = 'acrylic' as const
/** Windows 11 22H2's build number; Windows 10 and older 11s are below it. */
export const WIN_MATERIAL_BUILD = 22621

export interface LookFacts {
  platform: string
  /** process.getSystemVersion(): 10.0.22631 on Windows, 26.1.0 on a Mac. */
  systemVersion: string
  /** The system's Reduce transparency setting (transparency effects off
   *  on Windows). */
  reducedTransparency: boolean
}

/** The Windows build number in a system version, or 0. */
export function windowsBuild(systemVersion: string): number {
  const build = Number(systemVersion.split('.')[2])
  return Number.isFinite(build) ? build : 0
}

export function windowLook(facts: LookFacts): WindowLook {
  if (facts.reducedTransparency) return 'solid'
  if (facts.platform === 'darwin') return 'glass'
  if (facts.platform === 'win32') return windowsBuild(facts.systemVersion) >= WIN_MATERIAL_BUILD ? 'glass' : 'solid'
  return 'solid'
}

/** A look read from somewhere untrusted (a URL, an environment
 *  variable): only the 2 real values pass. */
export function asLook(value: unknown): WindowLook | null {
  return value === 'glass' || value === 'solid' ? value : null
}

/** The night studio ink, and the same with no alpha at all: a glass
 *  window has nothing painted behind the page. */
export const SOLID_BACKGROUND = '#0F0E11'
export const CLEAR_BACKGROUND = '#00000000'

/** What the settings window is made with for a look. */
export function windowOptions(
  look: WindowLook,
  platform: string
): { backgroundColor: string; vibrancy?: typeof MAC_VIBRANCY; visualEffectState?: 'active'; backgroundMaterial?: typeof WIN_MATERIAL } {
  if (look === 'solid') return { backgroundColor: SOLID_BACKGROUND }
  if (platform === 'darwin') {
    // Active, so the glass does not go flat grey each time another app
    // has focus, which is most of the time murmur is on screen.
    return { backgroundColor: CLEAR_BACKGROUND, vibrancy: MAC_VIBRANCY, visualEffectState: 'active' }
  }
  if (platform === 'win32') return { backgroundColor: CLEAR_BACKGROUND, backgroundMaterial: WIN_MATERIAL }
  return { backgroundColor: SOLID_BACKGROUND }
}
