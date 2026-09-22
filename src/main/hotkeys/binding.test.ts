// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildKeyMap, chordRefusal, isSafeBinding, matchesEvent, parseBinding, sameBinding } from './binding'

const keyMap = { space: 57, a: 30, f19: 102 }

describe('parseBinding', () => {
  it('parses a bare key', () => {
    expect(parseBinding('Space', keyMap)).toEqual({
      code: 57,
      keyName: 'space',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    })
  })

  it('parses modifier-only combos', () => {
    expect(parseBinding('Ctrl+Alt', keyMap)).toMatchObject({
      code: null,
      ctrl: true,
      alt: true,
      shift: false,
      meta: false
    })
    expect(parseBinding('Cmd', keyMap)).toMatchObject({ code: null, meta: true })
  })

  it('parses modifiers with aliases, any casing, stray spaces', () => {
    expect(parseBinding('Ctrl+Space', keyMap)?.ctrl).toBe(true)
    expect(parseBinding('Control + space', keyMap)?.ctrl).toBe(true)
    expect(parseBinding('Option+A', keyMap)).toMatchObject({ alt: true, code: 30 })
    expect(parseBinding('Cmd+Shift+F19', keyMap)).toMatchObject({
      meta: true,
      shift: true,
      code: 102
    })
  })

  it('rejects unknown keys, unknown modifiers, empty strings', () => {
    expect(parseBinding('Hyper+Space', keyMap)).toBeNull()
    expect(parseBinding('Ctrl+Banana', keyMap)).toBeNull()
    expect(parseBinding('', keyMap)).toBeNull()
    expect(parseBinding('+', keyMap)).toBeNull()
  })
})

describe('matchesEvent', () => {
  const binding = parseBinding('Ctrl+Space', keyMap)
  if (!binding) throw new Error('setup failed')

  const event = (over: Partial<Parameters<typeof matchesEvent>[1]> = {}) => ({
    keycode: 57,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...over
  })

  it('matches the exact combo', () => {
    expect(matchesEvent(binding, event())).toBe(true)
  })

  it('rejects wrong key or extra or missing modifiers', () => {
    expect(matchesEvent(binding, event({ keycode: 30 }))).toBe(false)
    expect(matchesEvent(binding, event({ ctrlKey: false }))).toBe(false)
    expect(matchesEvent(binding, event({ shiftKey: true }))).toBe(false)
  })
})

describe('isSafeBinding', () => {
  it('accepts modifier combos and modified keys', () => {
    expect(isSafeBinding(parseBinding('Ctrl+Alt', keyMap)!)).toBe(true)
    expect(isSafeBinding(parseBinding('Alt+Space', keyMap)!)).toBe(true)
    expect(isSafeBinding(parseBinding('Cmd+A', keyMap)!)).toBe(true)
  })

  it('accepts bare function keys', () => {
    expect(isSafeBinding(parseBinding('F19', keyMap)!)).toBe(true)
  })

  it('rejects bare typing keys that would fire mid-sentence', () => {
    expect(isSafeBinding(parseBinding('A', keyMap)!)).toBe(false)
    expect(isSafeBinding(parseBinding('Space', keyMap)!)).toBe(false)
  })
})

describe('buildKeyMap', () => {
  it('lowercases names and keeps only numeric values', () => {
    expect(buildKeyMap({ Space: 57, A: 30, toString: () => '' })).toEqual({ space: 57, a: 30 })
  })
})

describe('chordRefusal', () => {
  const km = { v: 47, f12: 88 }
  const parse = (s: string) => parseBinding(s, km)!

  it('refuses a chord without a regular key', () => {
    expect(chordRefusal(parse('Ctrl+Shift'), null)).toBe('needs-key')
  })

  it('refuses a chord whose modifiers contain a modifier-only dictation binding', () => {
    expect(chordRefusal(parse('Ctrl+Alt+V'), parse('Ctrl+Alt'))).toBe('collides')
    expect(chordRefusal(parse('Ctrl+Alt+Shift+V'), parse('Ctrl+Alt'))).toBe('collides')
  })

  it('allows a chord that avoids the dictation modifiers', () => {
    expect(chordRefusal(parse('Ctrl+F12'), parse('Ctrl+Alt'))).toBeNull()
    expect(chordRefusal(parse('Shift+V'), parse('Ctrl+Alt'))).toBeNull()
  })

  it('never collides with a different keyed dictation binding or a missing one', () => {
    const spaceMap = { space: 57, v: 47 }
    expect(
      chordRefusal(parseBinding('Alt+V', spaceMap)!, parseBinding('Alt+Space', spaceMap))
    ).toBeNull()
    expect(chordRefusal(parse('Ctrl+V'), null)).toBeNull()
  })

  it('refuses the dictation binding itself and any chord already taken', () => {
    expect(chordRefusal(parse('Ctrl+F12'), parse('Ctrl+F12'))).toBe('collides')
    expect(chordRefusal(parse('Ctrl+F12'), parse('Ctrl+Alt'), [parse('Ctrl+F12')])).toBe('collides')
    expect(chordRefusal(parse('Ctrl+F12'), parse('Ctrl+Alt'), [parse('Shift+F12')])).toBeNull()
    expect(chordRefusal(parse('ctrl+f12'), null, [parse('Ctrl+F12')])).toBe('collides')
  })
})

describe('sameBinding', () => {
  it('compares key and every modifier', () => {
    const km = { f12: 88 }
    const parse = (s: string) => parseBinding(s, km)!
    expect(sameBinding(parse('Ctrl+F12'), parse('Ctrl+F12'))).toBe(true)
    expect(sameBinding(parse('Ctrl+F12'), parse('Ctrl+Shift+F12'))).toBe(false)
    expect(sameBinding(parse('Ctrl+Alt'), parse('Ctrl+Alt'))).toBe(true)
    expect(sameBinding(parse('Ctrl+Alt'), parse('Ctrl'))).toBe(false)
  })
})
