// SPDX-License-Identifier: GPL-3.0-only
// Hotkey capture in the main process via before-input-event: keys are
// intercepted BEFORE menu accelerators, so combos like Cmd+W or Cmd+M
// can never minimize or close the window mid-capture. Two gestures
// capture: press a key with modifiers (Ctrl+Shift+M), or press and
// RELEASE modifiers alone (Ctrl+Alt) for a modifier-only combo. Bare
// typing keys are refused because they would fire mid-sentence; bare
// F-keys are fine. Escape or a timeout cancels.
import type { BrowserWindow } from 'electron'
import { codeToKeyName } from '../../shared/keycap'

const CAPTURE_TIMEOUT_MS = 10_000

export interface CaptureOutcome {
  binding: string | null
  reason?: 'cancelled' | 'needs-modifier'
}

interface ModifierFlags {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

function flagsOf(input: Electron.Input): ModifierFlags {
  return {
    ctrl: Boolean(input.control),
    alt: Boolean(input.alt),
    shift: Boolean(input.shift),
    meta: Boolean(input.meta)
  }
}

function comboString(flags: ModifierFlags, keyName: string | null): string {
  const parts: string[] = []
  if (flags.ctrl) parts.push('Ctrl')
  if (flags.alt) parts.push('Alt')
  if (flags.shift) parts.push('Shift')
  if (flags.meta) parts.push('Cmd')
  if (keyName) parts.push(keyName)
  return parts.join('+')
}

function isModifierCode(code: string): boolean {
  return /^(Control|Alt|Shift|Meta)(Left|Right)?$/.test(code)
}

export function captureHotkeyFromWindow(win: BrowserWindow): Promise<CaptureOutcome> {
  return new Promise((resolve) => {
    const contents = win.webContents
    // Union of modifiers seen while the gesture is held: releasing
    // Ctrl+Alt reports the combo even though the up events arrive with
    // the flags already dropping.
    const held: ModifierFlags = { ctrl: false, alt: false, shift: false, meta: false }
    let sawModifier = false

    const finish = (outcome: CaptureOutcome): void => {
      contents.removeListener('before-input-event', handler)
      clearTimeout(timer)
      resolve(outcome)
    }

    const timer = setTimeout(() => finish({ binding: null, reason: 'cancelled' }), CAPTURE_TIMEOUT_MS)

    const handler = (event: Electron.Event, input: Electron.Input): void => {
      event.preventDefault()

      if (input.type === 'keyDown' || input.type === 'rawKeyDown') {
        if (input.key === 'Escape') {
          finish({ binding: null, reason: 'cancelled' })
          return
        }
        const flags = flagsOf(input)
        held.ctrl ||= flags.ctrl
        held.alt ||= flags.alt
        held.shift ||= flags.shift
        held.meta ||= flags.meta
        if (isModifierCode(input.code)) {
          sawModifier = true
          return
        }
        const name = codeToKeyName(input.code)
        if (!name) return // media keys and other unusables: keep waiting
        const anyModifier = flags.ctrl || flags.alt || flags.shift || flags.meta
        if (!anyModifier && !/^F\d+$/.test(name)) {
          finish({ binding: null, reason: 'needs-modifier' })
          return
        }
        finish({ binding: comboString(flags, name) })
        return
      }

      if (input.type === 'keyUp' && isModifierCode(input.code) && sawModifier) {
        // Modifiers pressed and released with no regular key: that IS
        // the combo (hold-to-talk on Ctrl+Alt, Wispr style).
        finish({ binding: comboString(held, null) })
      }
    }

    contents.on('before-input-event', handler)
  })
}
