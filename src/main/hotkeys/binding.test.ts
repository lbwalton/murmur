// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildKeyMap, matchesEvent, parseBinding } from './binding'

const keyMap = { space: 57, a: 30, f19: 102 }

describe('parseBinding', () => {
  it('parses a bare key', () => {
    expect(parseBinding('Space', keyMap)).toEqual({
      code: 57,
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    })
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

describe('buildKeyMap', () => {
  it('lowercases names and keeps only numeric values', () => {
    expect(buildKeyMap({ Space: 57, A: 30, toString: () => '' })).toEqual({ space: 57, a: 30 })
  })
})
