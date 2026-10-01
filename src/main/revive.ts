// SPDX-License-Identifier: GPL-3.0-only
// A window whose renderer dies comes back on its own (US-071). Any
// death does it: macOS killing helpers under memory pressure, a GPU
// reset, a crash, or a stray kill command. The window itself survives
// in the main process, so reloading its page is enough; each window
// gets what it needs back from main when the page loads, as on first
// launch. One rule for every window, schedule in revive-rules.ts.
import type { BrowserWindow } from 'electron'
import { FRESH_REVIVE, nextRevive } from './revive-rules'
import { writeAppLog } from './window-watch'

/** Reload win's page after its renderer dies. onGone runs at the death,
 *  before the wait, for state the window's owner must drop at once. */
export function reviveOnDeath(win: BrowserWindow, name: string, onGone?: () => void): void {
  let state = FRESH_REVIVE
  win.webContents.on('render-process-gone', () => {
    onGone?.()
    const next = nextRevive(state, Date.now())
    state = next.state
    writeAppLog(`[window:${name}] reviving in ${next.delayMs}ms`)
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload()
    }, next.delayMs)
  })
}
