// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { codeToKeyName } from './keycap'

describe('codeToKeyName', () => {
  it('maps letters and digits', () => {
    expect(codeToKeyName('KeyM')).toBe('M')
    expect(codeToKeyName('Digit7')).toBe('7')
  })

  it('maps function keys through F24', () => {
    expect(codeToKeyName('F1')).toBe('F1')
    expect(codeToKeyName('F19')).toBe('F19')
    expect(codeToKeyName('F24')).toBe('F24')
    expect(codeToKeyName('F25')).toBeNull()
  })

  it('maps named and punctuation keys', () => {
    expect(codeToKeyName('Space')).toBe('Space')
    expect(codeToKeyName('Comma')).toBe('Comma')
    expect(codeToKeyName('Backquote')).toBe('Backquote')
    expect(codeToKeyName('ArrowUp')).toBe('ArrowUp')
    expect(codeToKeyName('NumpadEnter')).toBe('NumpadEnter')
  })

  it('rejects modifiers, Escape, and unknown hardware', () => {
    expect(codeToKeyName('MetaLeft')).toBeNull()
    expect(codeToKeyName('ControlRight')).toBeNull()
    expect(codeToKeyName('AltLeft')).toBeNull()
    expect(codeToKeyName('ShiftLeft')).toBeNull()
    expect(codeToKeyName('Escape')).toBeNull()
    expect(codeToKeyName('MediaPlayPause')).toBeNull()
    expect(codeToKeyName('Fn')).toBeNull()
  })
})
