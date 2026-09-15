// SPDX-License-Identifier: GPL-3.0-only
// Global hotkey wiring: uiohook events in, dictation start and stop out.
// Rebinding applies live whenever settings change. On macOS uIOhook.start
// needs Accessibility and Input Monitoring permission; a denied start is
// surfaced, never fatal.
import { UiohookKey, uIOhook } from 'uiohook-napi'
import type { Settings } from '../../shared/settings'
import { getSettings, onSettingsChanged } from '../settings'
import { registerSmokeCheck } from '../smoke'
import {
  type ParsedBinding,
  buildKeyMap,
  isSafeBinding,
  matchesEvent,
  parseBinding,
  pasteBindingRefusal
} from './binding'
import { HotkeyDispatcher, type ModifierCodes } from './dispatch'
import { type DictationCallbacks, HoldMachine, ToggleMachine, type TriggerMachine } from './machines'

const keyMap = buildKeyMap(UiohookKey as unknown as Record<string, unknown>)

const MODIFIER_CODES: ModifierCodes = {
  ctrl: [UiohookKey.Ctrl, UiohookKey.CtrlRight],
  alt: [UiohookKey.Alt, UiohookKey.AltRight],
  shift: [UiohookKey.Shift, UiohookKey.ShiftRight],
  meta: [UiohookKey.Meta, UiohookKey.MetaRight]
}

let binding: ParsedBinding | null = null
let machine: TriggerMachine | null = null
let dispatcher: HotkeyDispatcher | null = null
let pasteBinding: ParsedBinding | null = null
// Key auto-repeat fires keydown again while the chord is held; the
// paste must land once per press, so the chord latches until its key
// comes back up.
let pasteChordHeld = false
let hookStarted = false
let suppressed = false

/** Pause the global trigger (used while capturing a new binding). */
export function setHotkeysSuppressed(value: boolean): void {
  suppressed = value
}

/** True when a binding string parses AND is safe to arm globally. */
export function isBindingParseable(bindingString: string): boolean {
  const parsed = parseBinding(bindingString, keyMap)
  return parsed !== null && isSafeBinding(parsed)
}

/**
 * Why a candidate paste-last chord cannot be saved, or null when it
 * can. Checked against the CURRENT dictation binding at capture time;
 * apply() re-checks on every settings change, so a later dictation
 * rebind that creates a collision just disarms the paste chord.
 */
export function pasteBindingProblem(bindingString: string): 'invalid' | 'needs-key' | 'collides' | null {
  const parsed = parseBinding(bindingString, keyMap)
  if (!parsed || !isSafeBinding(parsed)) return 'invalid'
  const dictation = parseBinding(getSettings().hotkey.binding, keyMap)
  return pasteBindingRefusal(parsed, dictation)
}

function apply(settings: Settings, callbacks: DictationCallbacks): void {
  // A live hold must not leak a stuck recording across a rebind.
  if (machine?.isActive()) callbacks.stop()
  const parsed = parseBinding(settings.hotkey.binding, keyMap)
  // Unsafe bindings (a bare letter would fire on every keystroke) are
  // treated as invalid: the checklist surfaces it, dictation stays off.
  binding = parsed && isSafeBinding(parsed) ? parsed : null
  machine =
    settings.hotkey.mode === 'hold' ? new HoldMachine(callbacks) : new ToggleMachine(callbacks)
  dispatcher = binding ? new HotkeyDispatcher(binding, machine, MODIFIER_CODES) : null

  // The paste-last chord arms only when set and valid against the
  // dictation binding that was just applied; anything else disarms it.
  pasteBinding = null
  pasteChordHeld = false
  const pasteRaw = settings.hotkey.pasteLastBinding
  if (pasteRaw !== '') {
    const pasteParsed = parseBinding(pasteRaw, keyMap)
    if (pasteParsed && isSafeBinding(pasteParsed) && pasteBindingRefusal(pasteParsed, parsed) === null) {
      pasteBinding = pasteParsed
    }
  }
}

export interface HotkeysStatus {
  hookStarted: boolean
  bindingValid: boolean
  /** False only when a paste-last chord is saved but disarmed (a later
   *  dictation rebind made it collide, or it stopped parsing); the
   *  settings row must say so instead of showing a dead chord. */
  pasteBindingValid: boolean
}

function pasteBindingValid(): boolean {
  return getSettings().hotkey.pasteLastBinding === '' || pasteBinding !== null
}

export function initHotkeys(callbacks: DictationCallbacks & { pasteLast?: () => void }): HotkeysStatus {
  apply(getSettings(), callbacks)
  onSettingsChanged((settings) => apply(settings, callbacks))

  uIOhook.on('keydown', (event) => {
    if (suppressed) return
    dispatcher?.keydown(event)
    if (pasteBinding && matchesEvent(pasteBinding, event)) {
      if (!pasteChordHeld) {
        pasteChordHeld = true
        callbacks.pasteLast?.()
      }
    }
  })
  uIOhook.on('keyup', (event) => {
    if (suppressed) return
    dispatcher?.keyup(event)
    if (pasteBinding && event.keycode === pasteBinding.code) pasteChordHeld = false
  })

  try {
    uIOhook.start()
    hookStarted = true
  } catch {
    // Permission denied or hook unavailable: the app still runs, the
    // permissions flow (US-024) walks the user through granting access.
    hookStarted = false
  }

  // One boot breadcrumb: with this line a dead hook and a silent mic
  // finally read differently in the diagnostics log.
  void import('../window-watch')
    .then(({ writeAppLog }) => {
      writeAppLog(
        `[hotkeys] hookStarted=${hookStarted} bindingValid=${binding !== null} pasteBindingValid=${pasteBindingValid()}`
      )
    })
    .catch(() => undefined)

  registerSmokeCheck('hotkeys', () => {
    // Wiring: binding parsed, machine built, listeners attached.
    const attached = uIOhook.listenerCount('keydown') > 0 && uIOhook.listenerCount('keyup') > 0
    return binding !== null && machine !== null && attached
  })

  registerSmokeCheck('hotkeysRebind', async () => {
    const { updateSettings } = await import('../settings')
    const before = getSettings().hotkey.binding
    updateSettings({ hotkey: { binding: 'Ctrl+Shift+F19' } })
    const rebound = binding !== null && binding.code === keyMap.f19 && binding.ctrl && binding.shift
    updateSettings({ hotkey: { binding: before } })
    const restored = binding !== null && parseBinding(before, keyMap)?.code === binding.code
    return rebound && restored
  })

  return { hookStarted, bindingValid: binding !== null, pasteBindingValid: pasteBindingValid() }
}

export function stopHotkeys(): void {
  if (hookStarted) {
    uIOhook.stop()
    hookStarted = false
  }
}

/** Live status for the settings surface. */
export function getHotkeysStatus(): HotkeysStatus {
  return { hookStarted, bindingValid: binding !== null, pasteBindingValid: pasteBindingValid() }
}

// ------------------------------------------------------------- capture ---

const NAME_BY_CODE = (() => {
  const map = new Map<number, string>()
  for (const [name, code] of Object.entries(UiohookKey as unknown as Record<string, unknown>)) {
    if (typeof code === 'number' && !map.has(code)) map.set(code, name)
  }
  return map
})()

const MODIFIER_BY_CODE = new Map<number, 'ctrl' | 'alt' | 'shift' | 'meta'>()
for (const name of ['ctrl', 'alt', 'shift', 'meta'] as const) {
  for (const code of MODIFIER_CODES[name]) MODIFIER_BY_CODE.set(code, name)
}

export interface HookCaptureOutcome {
  binding: string | null
  reason?: 'cancelled' | 'needs-modifier'
}

/**
 * Capture a combo straight from the global hook: the exact same event
 * source the runtime trigger uses, so whatever captures here will fire
 * there. Modifiers pressed and released alone become a modifier-only
 * combo; a regular key closes a modified combo immediately; bare typing
 * keys are refused (F-keys exempt). Returns null when the hook is not
 * running (no permission yet); callers fall back to window capture.
 */
export function captureHotkeyViaHook(timeoutMs = 10_000): Promise<HookCaptureOutcome> | null {
  if (!hookStarted) return null
  return new Promise((resolve) => {
    const held = { ctrl: false, alt: false, shift: false, meta: false }
    let sawModifier = false

    const comboString = (keyName: string | null): string => {
      const parts: string[] = []
      if (held.ctrl) parts.push('Ctrl')
      if (held.alt) parts.push('Alt')
      if (held.shift) parts.push('Shift')
      if (held.meta) parts.push('Cmd')
      if (keyName) parts.push(keyName)
      return parts.join('+')
    }

    const finish = (outcome: HookCaptureOutcome): void => {
      uIOhook.off('keydown', onDown)
      uIOhook.off('keyup', onUp)
      clearTimeout(timer)
      resolve(outcome)
    }

    const timer = setTimeout(() => finish({ binding: null, reason: 'cancelled' }), timeoutMs)

    const onDown = (e: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): void => {
      console.log(`[capture:hook] down code=${e.keycode} flags=${Number(e.ctrlKey)}${Number(e.altKey)}${Number(e.shiftKey)}${Number(e.metaKey)}`)
      if (e.keycode === UiohookKey.Escape) {
        finish({ binding: null, reason: 'cancelled' })
        return
      }
      const modifier = MODIFIER_BY_CODE.get(e.keycode)
      if (modifier) {
        held[modifier] = true
        sawModifier = true
        return
      }
      const name = NAME_BY_CODE.get(e.keycode)
      if (!name) return
      const anyModifier = held.ctrl || held.alt || held.shift || held.meta
      if (!anyModifier && !/^F\d+$/.test(name)) {
        finish({ binding: null, reason: 'needs-modifier' })
        return
      }
      finish({ binding: comboString(name) })
    }

    const onUp = (e: { keycode: number }): void => {
      console.log(`[capture:hook] up code=${e.keycode}`)
      const modifier = MODIFIER_BY_CODE.get(e.keycode)
      if (modifier && sawModifier) {
        // Releasing with no regular key pressed: that IS the combo.
        finish({ binding: comboString(null) })
      }
    }

    uIOhook.on('keydown', onDown)
    uIOhook.on('keyup', onUp)
  })
}
