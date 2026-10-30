// SPDX-License-Identifier: GPL-3.0-only
// Zoom for the settings window (US-111). This is Chromium's own page
// zoom, not CSS zoom: devicePixelRatio scales with it, so every brush
// canvas (the header Pro mark, the painting, the Journey) redraws at
// the zoomed resolution and stays sharp.
//
// Chromium keeps zoom per host, and a file URL has no host, so it keys
// on the page's full URL instead: the settings page, the pill, and the
// audio window each load their own file, so zooming one leaves the
// others at 100 percent (the settingsZoom smoke check proves it). In
// development every window shares the dev server's host, so there the
// zoom spreads to the pill too; packaged builds never see that.
import type { BrowserWindow } from 'electron'
import { type ZoomAction, nextZoom, zoomActionForKey } from '../shared/zoom'
import { getSettings, updateSettings } from './settings'

/**
 * Apply the saved zoom whenever the page commits (the first load and
 * every reload, the US-071 revive among them). captureFactor, from an
 * isolated capture run, replaces the saved zoom for that run only.
 */
export function attachSettingsZoom(win: BrowserWindow, captureFactor?: number): void {
  const wc = win.webContents
  wc.on('did-navigate', () => {
    wc.setZoomFactor(captureFactor ?? getSettings().windowZoom)
  })
  // macOS owns the shortcut through the View menu (index.ts). Windows
  // and Linux have no menu bar, so the window catches Ctrl itself.
  if (process.platform !== 'darwin') {
    wc.on('before-input-event', (event, input) => {
      const action = zoomActionForKey(input)
      if (!action) return
      event.preventDefault()
      stepSettingsZoom(win, action)
    })
  }
}

/** One press: zoom the settings window a step and remember it. */
export function stepSettingsZoom(win: BrowserWindow | null, action: ZoomAction): number | null {
  if (!win || win.isDestroyed()) return null
  const next = nextZoom(getSettings().windowZoom, action)
  win.webContents.setZoomFactor(next)
  updateSettings({ windowZoom: next })
  return next
}
