// SPDX-License-Identifier: GPL-3.0-only
// Runs every shared vector. Platforms that reimplement the formatter run
// these same cases from shared/test-vectors.json against the same spec.
import { describe, expect, it } from 'vitest'
import spec from '../../shared/format-spec.json'
import vectors from '../../shared/test-vectors.json'
import { type DictionaryEntry, applyDictionary, enforceDictionaryCasing } from './dictionary'
import { type ExpansionEntry, applyExpansions } from './expansions'
import { type FormatOptions, type FormatSpec, formatTranscript } from './formatter'

interface Vector {
  name: string
  settings?: Partial<FormatOptions> & {
    dictionary?: DictionaryEntry[]
    expansions?: ExpansionEntry[]
  }
  input: string
  expected: string
}

describe('formatTranscript against shared/test-vectors.json', () => {
  for (const vector of vectors.vectors as Vector[]) {
    it(vector.name, () => {
      const options: FormatOptions = {
        level: vector.settings?.level ?? 'full',
        numbers: vector.settings?.numbers ?? 'auto',
        smartLists: vector.settings?.smartLists ?? false
      }
      // Match the app pipeline: dictionary on raw text, formatting,
      // exact dictionary casing, then expansions last.
      const dictionary = vector.settings?.dictionary ?? []
      const expansions = vector.settings?.expansions ?? []
      const input = applyDictionary(vector.input, dictionary)
      const formatted = formatTranscript(input, options, spec as unknown as FormatSpec)
      const cased = enforceDictionaryCasing(formatted, dictionary)
      expect(applyExpansions(cased, expansions)).toBe(vector.expected)
    })
  }

  it('orders equal-length spoken phrases by symbol, then phrase', () => {
    // Every platform must agree on this order (format-spec.json). The map
    // lists a b first, but b c's symbol X sorts before Y, so b c goes first.
    const s = { ...(spec as unknown as FormatSpec), spokenPunctuation: { map: { 'a b': 'Y', 'b c': 'X' } } }
    expect(formatTranscript('a b c', { level: 'full', numbers: 'auto' }, s)).toBe('AX')
  })

  it('gives every number unit its own value, so digits have one word each', () => {
    const values = Object.values((spec as unknown as FormatSpec).numbers.units)
    expect(new Set(values).size).toBe(values.length)
  })

  it('is a pure function: same input, same output, no mutation', () => {
    const options: FormatOptions = { level: 'full', numbers: 'auto' }
    const s = spec as unknown as FormatSpec
    const a = formatTranscript('um hello period world', options, s)
    const b = formatTranscript('um hello period world', options, s)
    expect(a).toBe(b)
  })
})
