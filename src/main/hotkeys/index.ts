// SPDX-License-Identifier: GPL-3.0-only
// Global hotkey wiring: uiohook events in, dictation start and stop out.
// Rebinding applies live whenever settings change. On macOS uIOhook.start
// needs Accessibility and Input Monitoring permission; a denied start is
// surfaced, never fatal.
import { UiohookKey, uIOhook } from 'uiohook-napi'
import type { Settings } from '../../shared/settings'
import { getSettings, onSettingsChanged } from '../settings'
import { registerSmokeCheck } from '../smoke'
import { type ParsedBinding, buildKeyMap, isSafeBinding, parseBinding } from './binding'
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
}

export interface HotkeysStatus {
  hookStarted: boolean
  bindingValid: boolean
}

export function initHotkeys(callbacks: DictationCallbacks): HotkeysStatus {
  apply(getSettings(), callbacks)
  onSettingsChanged((settings) => apply(settings, callbacks))

  uIOhook.on('keydown', (event) => {
    if (suppressed) return
    dispatcher?.keydown(event)
  })
  uIOhook.on('keyup', (event) => {
    if (suppressed) return
    dispatcher?.keyup(event)
  })

  try {
    uIOhook.start()
    hookStarted = true
  } catch {
    // Permission denied or hook unavailable: the app still runs, the
    // permissions flow (US-024) walks the user through granting access.
    hookStarted = false
  }

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

  return { hookStarted, bindingValid: binding !== null }
}

export function stopHotkeys(): void {
  if (hookStarted) {
    uIOhook.stop()
    hookStarted = false
  }
}

/** Live status for the settings surface. */
export function getHotkeysStatus(): HotkeysStatus {
  return { hookStarted, bindingValid: binding !== null }
}
