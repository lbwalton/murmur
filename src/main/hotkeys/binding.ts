// SPDX-License-Identifier: GPL-3.0-only
// Hotkey binding strings ('Ctrl+Space', 'Alt+F19') parsed against an
// injected key map so this module stays pure and unit-testable; the
// wiring layer supplies the real uiohook key codes.

export interface ParsedBinding {
  /** Key code, or null for a modifier-only combo like Ctrl+Alt. */
  code: number | null
  /** Lowercase key name for code bindings, informational. */
  keyName: string | null
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

/** Lowercase key name to platform key code. */
export type KeyMap = Record<string, number>

export interface KeyEventLike {
  keycode: number
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_ALIASES: Record<string, 'ctrl' | 'alt' | 'shift' | 'meta'> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta'
}

/**
 * Parse a binding string. The last part may itself be a modifier, which
 * makes a modifier-only combo (Ctrl+Alt, Cmd+Shift, or a lone Ctrl).
 * Returns null when any part is unknown.
 */
export function parseBinding(binding: string, keyMap: KeyMap): ParsedBinding | null {
  const parts = binding
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null

  const parsed: ParsedBinding = {
    code: null,
    keyName: null,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false
  }
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part]
    if (!modifier) return null
    parsed[modifier] = true
  }

  const last = parts[parts.length - 1]
  const lastModifier = MODIFIER_ALIASES[last]
  if (lastModifier) {
    parsed[lastModifier] = true
    return parsed
  }
  const code = keyMap[last]
  if (code === undefined) return null
  parsed.code = code
  parsed.keyName = last
  return parsed
}

/**
 * A binding is safe to arm globally when it cannot fire during ordinary
 * typing: modifier combos always qualify, keyed bindings need a modifier
 * unless the key is a function key (F1 to F24).
 */
export function isSafeBinding(binding: ParsedBinding): boolean {
  if (binding.code === null) return true
  if (binding.ctrl || binding.alt || binding.shift || binding.meta) return true
  return binding.keyName !== null && /^f([1-9]|1[0-9]|2[0-4])$/.test(binding.keyName)
}

/** Exact match for keyed bindings: the bound key with exactly the bound modifiers. */
export function matchesEvent(binding: ParsedBinding, event: KeyEventLike): boolean {
  return (
    binding.code !== null &&
    event.keycode === binding.code &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    event.metaKey === binding.meta
  )
}

/** Build a lowercase name to code map from the uiohook UiohookKey enum. */
export function buildKeyMap(uiohookKeys: Record<string, unknown>): KeyMap {
  const map: KeyMap = {}
  for (const [name, code] of Object.entries(uiohookKeys)) {
    if (typeof code === 'number') map[name.toLowerCase()] = code
  }
  return map
}
