// SPDX-License-Identifier: GPL-3.0-only
// Maps browser KeyboardEvent.code values to the key names the global
// hook layer understands. Pure and shared so capture and parsing agree.

// Codes whose names are identical on both sides.
const PASSTHROUGH = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'CapsLock',
  'PageUp',
  'PageDown',
  'End',
  'Home',
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
  'Insert',
  'Delete',
  'Semicolon',
  'Equal',
  'Comma',
  'Minus',
  'Period',
  'Slash',
  'Backquote',
  'BracketLeft',
  'Backslash',
  'BracketRight',
  'Quote',
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'NumpadMultiply',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadDecimal',
  'NumpadDivide',
  'NumpadEnter'
])

/**
 * Browser code to hook-layer key name, or null for keys that cannot be
 * a hotkey (modifiers alone, Escape, media keys, unknown hardware).
 */
export function codeToKeyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (PASSTHROUGH.has(code)) return code
  return null
}
