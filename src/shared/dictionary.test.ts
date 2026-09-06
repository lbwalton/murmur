// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { applyDictionary, dictionaryHint, enforceDictionaryCasing } from './dictionary'

const entries = [
  { from: 'labroy', to: 'LaBroi' },
  { from: 'murmur app', to: 'murmur' },
  { from: 'cat', to: 'CAT scan' }
]

describe('applyDictionary', () => {
  it('replaces whole words case-insensitively with exact casing out', () => {
    expect(applyDictionary('tell Labroy the plan', entries)).toBe('tell LaBroi the plan')
    expect(applyDictionary('LABROY agreed', entries)).toBe('LaBroi agreed')
  })

  it('handles multi-word phrases, longest first', () => {
    expect(applyDictionary('open the murmur app settings', entries)).toBe(
      'open the murmur settings'
    )
  })

  it('never touches substrings inside other words', () => {
    expect(applyDictionary('concatenate the files', entries)).toBe('concatenate the files')
    expect(applyDictionary('the cat sat', entries)).toBe('the CAT scan sat')
  })

  it('leaves unrelated text alone entirely', () => {
    const text = 'nothing here matches anything at all'
    expect(applyDictionary(text, entries)).toBe(text)
  })

  it('skips empty or whitespace entries instead of corrupting text', () => {
    const messy = [{ from: '', to: 'X' }, { from: '   ', to: 'Y' }, { from: 'ok', to: '' }]
    expect(applyDictionary('everything is ok', messy)).toBe('everything is ok')
  })

  it('escapes regex characters in entries', () => {
    expect(applyDictionary('call c++ great', [{ from: 'c++', to: 'C++' }])).toBe('call C++ great')
  })
})

describe('type resilience (hand-edited settings files)', () => {
  const junk = [null, 42, 'string', { from: 7, to: 'x' }, { from: 'ok' }, { to: 'x' }] as never[]

  it('applyDictionary skips wrong-typed entries instead of throwing', () => {
    expect(applyDictionary('everything is ok', junk)).toBe('everything is ok')
  })

  it('dictionaryHint skips wrong-typed entries instead of throwing', () => {
    expect(dictionaryHint(junk)).toBeNull()
  })

  it('enforceDictionaryCasing skips wrong-typed entries instead of throwing', () => {
    expect(enforceDictionaryCasing('fine text', junk)).toBe('fine text')
  })
})

describe('enforceDictionaryCasing', () => {
  it('re-lowercases a brand name capitalized by sentence rules', () => {
    const entries = [{ from: 'mermer', to: 'murmur' }]
    expect(enforceDictionaryCasing('Murmur crashed today.', entries)).toBe('murmur crashed today.')
  })

  it('re-asserts casing anywhere in the text, phrases included', () => {
    const entries = [{ from: 'cat', to: 'CAT scan' }]
    expect(enforceDictionaryCasing('the Cat Scan came back clean', entries)).toBe(
      'the CAT scan came back clean'
    )
  })

  it('leaves unrelated words alone', () => {
    const entries = [{ from: 'mermer', to: 'murmur' }]
    expect(enforceDictionaryCasing('The murmuring crowd.', entries)).toBe('The murmuring crowd.')
  })
})

describe('dictionaryHint', () => {
  it('is null for an empty or useless dictionary', () => {
    expect(dictionaryHint([])).toBeNull()
    expect(dictionaryHint([{ from: ' ', to: 'x' }])).toBeNull()
  })

  it('lists the pairs with an only-where-present instruction', () => {
    const hint = dictionaryHint(entries)!
    expect(hint).toContain('"labroy" is written "LaBroi"')
    expect(hint).toContain('ONLY where these words already occur')
  })
})
