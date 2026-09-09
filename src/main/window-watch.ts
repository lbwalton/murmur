// SPDX-License-Identifier: GPL-3.0-only
// Window black boxes: every way a window's content can silently die
// gets a line in the rotating log, so a blank window on a user's
// machine (issue 1) becomes a readable story instead of a guess.
// Nothing here logs page content or transcripts: urls, error codes,
// reasons, and renderer console ERRORS only (uncaught renderer
// exceptions surface as console errors, which is the signal we need).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import { RotatingLog } from './logging'
import { registerSmokeCheck } from './smoke'

let log: RotatingLog | null = null

// The watcher proves itself: by the time smoke checks run, the settings
// window has loaded, so its did-finish-load line must be in the log. A
// wrong event name or broken handler fails this instead of shipping.
registerSmokeCheck('windowWatch', async () => {
  const file = join(app.getPath('userData'), 'logs', 'murmur.log')
  for (let i = 0; i < 30; i++) {
    if (existsSync(file) && readFileSync(file, 'utf8').includes('[window:settings] did-finish-load')) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
})

function logger(): RotatingLog {
  if (!log) log = new RotatingLog(app.getPath('userData'))
  return log
}

export function watchWindow(win: BrowserWindow, name: string): void {
  const wc = win.webContents
  wc.on('did-fail-load', (_e, code, description, url) => {
    logger().write(`[window:${name}] did-fail-load code=${code} desc=${description} url=${url}`)
  })
  wc.on('render-process-gone', (_e, details) => {
    logger().write(`[window:${name}] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })
  wc.on('preload-error', (_e, path, error) => {
    logger().write(`[window:${name}] preload-error path=${path} error=${error.message}`)
  })
  wc.on('unresponsive', () => {
    logger().write(`[window:${name}] unresponsive`)
  })
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3) {
      logger().write(`[window:${name}] renderer-error ${sourceId}:${line} ${message.slice(0, 500)}`)
    }
  })
  wc.on('did-finish-load', () => {
    logger().write(`[window:${name}] did-finish-load`)
  })
  // MURMUR_DEBUG=1 pops devtools so a user can look with us live.
  if (process.env.MURMUR_DEBUG === '1' && name === 'settings') {
    wc.openDevTools({ mode: 'detach' })
  }
}
