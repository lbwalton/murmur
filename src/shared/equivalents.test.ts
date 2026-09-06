// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import works from '../../shared/equivalents.json'
import { type EquivalentsFile, equivalentLine } from './equivalents'

const SPEC = works as unknown as EquivalentsFile

describe('equivalentLine', () => {
  it('is empty with no words', () => {
    expect(equivalentLine(0, SPEC, 0.5)).toBe('')
  })

  it('shows progress toward the smallest work early on', () => {
    const line = equivalentLine(600, SPEC, 0.5)
    expect(line).toContain('% of the way to a State of the Union address')
  })

  it('compares multiples once past a work', () => {
    const line = equivalentLine(285_000, SPEC, 0)
    expect(line).toMatch(/x a State of the Union address\.$/)
  })

  it('rotates across eligible works with the pick value', () => {
    const a = equivalentLine(500_000, SPEC, 0.01)
    const b = equivalentLine(500_000, SPEC, 0.99)
    expect(a).not.toBe(b)
  })

  it('says about-the-length-of near 1x', () => {
    // At 96k words, eight works are eligible; The Hobbit is index 5.
    const line = equivalentLine(96_000, SPEC, 5.5 / 8)
    expect(line).toContain('about the length of The Hobbit')
  })

  it('uses a percentage for partially-read comparisons', () => {
    const line = equivalentLine(96_000, SPEC, 0.99)
    expect(line).toMatch(/\d+% of Moby-Dick\.$/)
  })

  it('never claims a work the user has not meaningfully approached', () => {
    const line = equivalentLine(2_000, SPEC, 0.99)
    expect(line).not.toContain('War and Peace')
  })
})
