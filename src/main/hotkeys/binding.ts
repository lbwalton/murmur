// SPDX-License-Identifier: GPL-3.0-only
// Hotkey binding strings ('Ctrl+Space', 'Alt+F19') parsed against an
// injected key map so this module stays pure and unit-testable; the
// wiring layer supplies the real uiohook key codes.

export interface ParsedBinding {
  code: number
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

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedBinding, 'code'>> = {
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

/** Parse a binding string. Returns null when it names no known key. */
export function parseBinding(binding: string, keyMap: KeyMap): ParsedBinding | null {
  const parts = binding
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null

  const parsed: ParsedBinding = { code: -1, ctrl: false, alt: false, shift: false, meta: false }
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part]
    if (!modifier) return null
    parsed[modifier] = true
  }

  const keyName = parts[parts.length - 1]
  const code = keyMap[keyName]
  if (code === undefined) return null
  parsed.code = code
  return parsed
}

/** Exact match: the bound key with exactly the bound modifiers. */
export function matchesEvent(binding: ParsedBinding, event: KeyEventLike): boolean {
  return (
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
