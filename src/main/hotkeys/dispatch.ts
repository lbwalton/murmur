// SPDX-License-Identifier: GPL-3.0-only
// Routes raw hook events into the trigger machine for both binding
// kinds. Keyed bindings match one key plus exact modifiers. Modifier
// combos arm when exactly the bound modifiers are down, release when
// any of them lifts, and cancel if some other key joins in (so typing a
// shortcut like Ctrl+Alt+C never dictates). Pure: codes are injected.
import { type KeyEventLike, type ParsedBinding, matchesEvent } from './binding'
import type { TriggerMachine } from './machines'

export interface ModifierCodes {
  ctrl: number[]
  alt: number[]
  shift: number[]
  meta: number[]
}

type ModifierName = 'ctrl' | 'alt' | 'shift' | 'meta'

const MODIFIER_NAMES: readonly ModifierName[] = ['ctrl', 'alt', 'shift', 'meta']

export class HotkeyDispatcher {
  private readonly codeToModifier = new Map<number, ModifierName>()
  // Own modifier tracking by key code: the flags a hook attaches to a
  // modifier's OWN press can lag behind (the mask updates after
  // dispatch on some platforms), so trusting them broke chords like
  // Ctrl+Alt. Codes are ground truth; flags only ever add, on keydown,
  // for modifiers whose press we never saw.
  private readonly down: Record<ModifierName, boolean> = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  }

  constructor(
    private readonly binding: ParsedBinding,
    private readonly machine: TriggerMachine,
    modifierCodes: ModifierCodes
  ) {
    for (const name of MODIFIER_NAMES) {
      for (const code of modifierCodes[name]) this.codeToModifier.set(code, name)
    }
  }

  private chordEquals(): boolean {
    return MODIFIER_NAMES.every((name) => this.down[name] === this.binding[name])
  }

  private chordExceeds(): boolean {
    return MODIFIER_NAMES.some((name) => this.down[name] && !this.binding[name])
  }

  keydown(event: KeyEventLike): void {
    if (this.binding.code !== null) {
      if (matchesEvent(this.binding, event)) this.machine.keyDown()
      return
    }
    // Modifier-only combo.
    const modifier = this.codeToModifier.get(event.keycode)
    if (!modifier) {
      // A regular key while armed means the user is typing a shortcut.
      if (this.machine.isActive()) this.machine.keyUp()
      return
    }
    this.down[modifier] = true
    this.down.ctrl ||= event.ctrlKey
    this.down.alt ||= event.altKey
    this.down.shift ||= event.shiftKey
    this.down.meta ||= event.metaKey
    if (this.chordExceeds()) {
      if (this.machine.isActive()) this.machine.keyUp()
      return
    }
    if (this.chordEquals()) this.machine.keyDown()
  }

  keyup(event: KeyEventLike): void {
    if (this.binding.code !== null) {
      // Key code alone: releasing the modifier first must not wedge the
      // machine in an active state.
      if (event.keycode === this.binding.code) this.machine.keyUp()
      return
    }
    const modifier = this.codeToModifier.get(event.keycode)
    if (!modifier) return
    this.down[modifier] = false
    if (this.binding[modifier]) this.machine.keyUp()
  }
}
