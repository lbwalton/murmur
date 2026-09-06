// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { parseBinding } from './binding'
import { HotkeyDispatcher, type ModifierCodes } from './dispatch'
import { HoldMachine } from './machines'

const keyMap = { space: 57, a: 30, f19: 102 }
const MODS: ModifierCodes = { ctrl: [29, 97], alt: [56, 100], shift: [42, 54], meta: [3675, 3676] }

function recorder() {
  const events: string[] = []
  return {
    events,
    cb: { start: () => events.push('start'), stop: () => events.push('stop') }
  }
}

const ev = (keycode: number, mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {}) => ({
  keycode,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false
})

describe('HotkeyDispatcher keyed bindings', () => {
  it('starts and stops on the bound key with exact modifiers', () => {
    const { events, cb } = recorder()
    const binding = parseBinding('Ctrl+Space', keyMap)!
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(57, { ctrl: true }))
    d.keyup(ev(57, { ctrl: true }))
    expect(events).toEqual(['start', 'stop'])
  })

  it('releasing the modifier before the key still stops cleanly', () => {
    const { events, cb } = recorder()
    const binding = parseBinding('Ctrl+Space', keyMap)!
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(57, { ctrl: true }))
    d.keyup(ev(29)) // ctrl up first: not the bound key, no effect
    d.keyup(ev(57)) // space up without ctrl flag must still stop
    expect(events).toEqual(['start', 'stop'])
  })

  it('ignores the key with wrong modifiers', () => {
    const { events, cb } = recorder()
    const binding = parseBinding('Ctrl+Space', keyMap)!
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(57, { alt: true }))
    expect(events).toEqual([])
  })
})

describe('HotkeyDispatcher modifier-only combos', () => {
  const binding = parseBinding('Ctrl+Alt', keyMap)!

  it('arms when the chord completes and releases when a bound modifier lifts', () => {
    const { events, cb } = recorder()
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(29, { ctrl: true })) // ctrl only: not yet
    expect(events).toEqual([])
    d.keydown(ev(56, { ctrl: true, alt: true })) // chord complete
    expect(events).toEqual(['start'])
    d.keyup(ev(56, { ctrl: true })) // alt lifts
    expect(events).toEqual(['start', 'stop'])
  })

  it('cancels when a regular key joins the chord (a shortcut, not dictation)', () => {
    const { events, cb } = recorder()
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(29, { ctrl: true }))
    d.keydown(ev(56, { ctrl: true, alt: true }))
    d.keydown(ev(30, { ctrl: true, alt: true })) // the C in Ctrl+Alt+C
    expect(events).toEqual(['start', 'stop'])
  })

  it('cancels when an extra modifier joins', () => {
    const { events, cb } = recorder()
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(56, { ctrl: true, alt: true }))
    d.keydown(ev(42, { ctrl: true, alt: true, shift: true }))
    expect(events).toEqual(['start', 'stop'])
  })

  it('right-side modifier keys count for the same combo', () => {
    const { events, cb } = recorder()
    const d = new HotkeyDispatcher(binding, new HoldMachine(cb), MODS)
    d.keydown(ev(100, { ctrl: true, alt: true })) // AltRight completes it
    d.keyup(ev(97, { alt: true })) // CtrlRight lifts
    expect(events).toEqual(['start', 'stop'])
  })
})
