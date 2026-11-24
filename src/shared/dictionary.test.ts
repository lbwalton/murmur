// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { HINT_BUDGET_CHARS, applyDictionary, dictionaryHint, enforceDictionaryCasing } from './dictionary'

const entries = [
  { from: 'shivon', to: 'Siobhan' },
  { from: 'murmur app', to: 'murmur' },
  { from: 'cat', to: 'CAT scan' }
]

describe('applyDictionary', () => {
  it('replaces whole words case-insensitively with exact casing out', () => {
    expect(applyDictionary('tell Shivon the plan', entries)).toBe('tell Siobhan the plan')
    expect(applyDictionary('SHIVON agreed', entries)).toBe('Siobhan agreed')
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
    expect(hint).toContain('"shivon" is written "Siobhan"')
    expect(hint).toContain('ONLY where these words already occur')
  })

  it('sends a list that fits whole, whatever the take says', () => {
    expect(dictionaryHint(entries, 'nothing here matches')).toBe(dictionaryHint(entries))
  })

  it('caps a long list, and sends the pairs this take uses first (US-183)', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ from: `heard${i}`, to: `Written${i}` }))
    const hint = dictionaryHint(many, 'ask Written499 about Written250 today')!
    const lead = 'Preferred spellings, apply ONLY where these words already occur: '
    expect(hint.length).toBeLessThanOrEqual(lead.length + HINT_BUDGET_CHARS + 1)
    expect(hint.length).toBeGreaterThan(HINT_BUDGET_CHARS - 40)
    expect(hint.indexOf('"heard499" is written "Written499"')).toBeGreaterThan(-1)
    expect(hint.indexOf('"heard250" is written "Written250"')).toBeGreaterThan(-1)
    // In use first, then list order.
    expect(hint.indexOf('"heard499"')).toBeLessThan(hint.indexOf('"heard0"'))
    expect(hint).not.toContain('"heard498"')
    expect(hint.startsWith('Preferred spellings')).toBe(true)
  })

  it('sends a list that is exactly the budget whole, and caps 1 character past it', () => {
    const list = [
      { from: 'aaaa', to: 'bbbb' },
      { from: 'cccc', to: 'dddd' }
    ]
    const whole = '"aaaa" is written "bbbb"; "cccc" is written "dddd"'
    expect(dictionaryHint(list, 'nothing', whole.length)).toContain(whole)
    expect(dictionaryHint(list, 'nothing', whole.length - 1)).not.toContain('cccc')
    expect(dictionaryHint(list, 'nothing', whole.length - 1)).toContain('"aaaa" is written "bbbb".')
  })

  it('sends a word that holds a quote as it is spelled', () => {
    expect(dictionaryHint([{ from: 'six inch', to: '6"' }])).toContain('"six inch" is written "6""')
  })

  it('puts a pair this take uses ahead of 1 that only just does not fit', () => {
    const list = [
      { from: 'aaaa', to: 'bbbb' },
      { from: 'cccc', to: 'dddd' }
    ]
    const whole = '"aaaa" is written "bbbb"; "cccc" is written "dddd"'
    const hint = dictionaryHint(list, 'ask dddd today', whole.length - 1)!
    expect(hint).toContain('"cccc" is written "dddd".')
    expect(hint).not.toContain('aaaa')
  })

  it('caps a long list in list order when it is given no take', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ from: `heard${i}`, to: `Written${i}` }))
    const hint = dictionaryHint(many)!
    expect(hint).toContain('"heard0" is written "Written0"')
    expect(hint).not.toContain('"heard499"')
  })

  it('skips a pair too long for the budget and keeps the ones that fit', () => {
    const list = [
      { from: 'x'.repeat(300), to: 'y'.repeat(300) },
      { from: 'shivon', to: 'Siobhan' }
    ]
    expect(dictionaryHint(list, 'hello', 100)).toContain('"shivon" is written "Siobhan"')
    expect(dictionaryHint([list[0]], 'hello', 100)).toBeNull()
  })

  it('stays quick on a full list', () => {
    const many = Array.from({ length: 2_000 }, (_, i) => ({ from: `heard${i}`, to: `Written${i}` }))
    const started = performance.now()
    dictionaryHint(many, 'ask Written1999 about the plan '.repeat(40))
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
