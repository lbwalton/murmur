// SPDX-License-Identifier: GPL-3.0-only
// Runs every shared vector. Platforms that reimplement the formatter run
// these same cases from shared/test-vectors.json against the same spec.
import { describe, expect, it } from 'vitest'
import spec from '../../shared/format-spec.json'
import vectors from '../../shared/test-vectors.json'
import { type FormatOptions, type FormatSpec, formatTranscript } from './formatter'

interface Vector {
  name: string
  settings?: Partial<FormatOptions>
  input: string
  expected: string
}

describe('formatTranscript against shared/test-vectors.json', () => {
  for (const vector of vectors.vectors as Vector[]) {
    it(vector.name, () => {
      const options: FormatOptions = {
        level: vector.settings?.level ?? 'full',
        numbers: vector.settings?.numbers ?? 'auto'
      }
      expect(formatTranscript(vector.input, options, spec as unknown as FormatSpec)).toBe(
        vector.expected
      )
    })
  }

  it('is a pure function: same input, same output, no mutation', () => {
    const options: FormatOptions = { level: 'full', numbers: 'auto' }
    const s = spec as unknown as FormatSpec
    const a = formatTranscript('um hello period world', options, s)
    const b = formatTranscript('um hello period world', options, s)
    expect(a).toBe(b)
  })
})
