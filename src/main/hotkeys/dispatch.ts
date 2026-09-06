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

export class HotkeyDispatcher {
  private readonly allModifierCodes: Set<number>
  private readonly boundModifierCodes: Set<number>

  constructor(
    private readonly binding: ParsedBinding,
    private readonly machine: TriggerMachine,
    modifierCodes: ModifierCodes
  ) {
    this.allModifierCodes = new Set(
      [...modifierCodes.ctrl, ...modifierCodes.alt, ...modifierCodes.shift, ...modifierCodes.meta]
    )
    this.boundModifierCodes = new Set([
      ...(binding.ctrl ? modifierCodes.ctrl : []),
      ...(binding.alt ? modifierCodes.alt : []),
      ...(binding.shift ? modifierCodes.shift : []),
      ...(binding.meta ? modifierCodes.meta : [])
    ])
  }

  private flagsMatch(event: KeyEventLike): boolean {
    return (
      event.ctrlKey === this.binding.ctrl &&
      event.altKey === this.binding.alt &&
      event.shiftKey === this.binding.shift &&
      event.metaKey === this.binding.meta
    )
  }

  keydown(event: KeyEventLike): void {
    if (this.binding.code !== null) {
      if (matchesEvent(this.binding, event)) this.machine.keyDown()
      return
    }
    // Modifier-only combo.
    if (!this.allModifierCodes.has(event.keycode)) {
      // A regular key while armed means the user is typing a shortcut.
      if (this.machine.isActive()) this.machine.keyUp()
      return
    }
    if (this.flagsMatch(event)) this.machine.keyDown()
    else if (this.machine.isActive()) this.machine.keyUp()
  }

  keyup(event: KeyEventLike): void {
    if (this.binding.code !== null) {
      // Key code alone: releasing the modifier first must not wedge the
      // machine in an active state.
      if (event.keycode === this.binding.code) this.machine.keyUp()
      return
    }
    if (this.boundModifierCodes.has(event.keycode)) this.machine.keyUp()
  }
}
