// SPDX-License-Identifier: GPL-3.0-only
// Hotkey capture in the main process via before-input-event: keys are
// intercepted BEFORE menu accelerators, so combos like Cmd+W or Cmd+M
// can never minimize or close the window mid-capture (that was the bug
// the renderer-side capture had). Escape or a timeout cancels.
import type { BrowserWindow } from 'electron'
import { codeToKeyName } from '../../shared/keycap'

const CAPTURE_TIMEOUT_MS = 10_000

/** Resolve with a binding string, or null on cancel or timeout. */
export function captureHotkeyFromWindow(win: BrowserWindow): Promise<string | null> {
  return new Promise((resolve) => {
    const contents = win.webContents

    const finish = (value: string | null): void => {
      contents.removeListener('before-input-event', handler)
      clearTimeout(timer)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS)

    const handler = (event: Electron.Event, input: Electron.Input): void => {
      if (input.type !== 'keyDown') return
      event.preventDefault()
      if (input.key === 'Escape') {
        finish(null)
        return
      }
      const name = codeToKeyName(input.code)
      if (!name) return // modifier alone or an unusable key: keep waiting
      const parts: string[] = []
      if (input.control) parts.push('Ctrl')
      if (input.alt) parts.push('Alt')
      if (input.shift) parts.push('Shift')
      if (input.meta) parts.push('Cmd')
      parts.push(name)
      finish(parts.join('+'))
    }

    contents.on('before-input-event', handler)
  })
}
