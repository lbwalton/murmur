// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { type TakeQuality, qualityLine, qualityReport, summarizeQuality, wordCount } from './quality'

const take: TakeQuality = {
  level: 'full',
  smartLists: true,
  corrections: false,
  model: 'openai/gpt-oss-120b',
  outcome: 'cleaned',
  wordsIn: 12,
  wordsOut: 9,
  cuesIn: 1,
  cuesOut: 0
}

describe('qualityLine', () => {
  it('says how the take went, in numbers', () => {
    expect(qualityLine(take)).toBe(
      '[quality] level=full lists=on corrections=off model=openai/gpt-oss-120b outcome=cleaned wordsIn=12 wordsOut=9 cuesIn=1 cuesOut=0 hint=0'
    )
  })

  it('flags a cue word that survived as a hint', () => {
    expect(qualityLine({ ...take, cuesOut: 1 })).toContain('hint=1')
  })

  it('cannot carry a sentence, whatever reaches its fields', () => {
    const marked = 'SECRET WORDS I said out loud, sk-MARKED, dictionary-entry'
    const line = qualityLine({ ...take, level: marked, model: marked, outcome: marked })
    expect(line).not.toMatch(/ WORDS | said /)
    expect(line).toMatch(/^\[quality\] (?:\w+=\S+ ?)+$/)
  })

  it('keeps a fallback reason readable as 1 field', () => {
    expect(qualityLine({ ...take, outcome: 'validate: length ratio' })).toContain('outcome=validate:_length_ratio ')
  })
})

describe('wordCount', () => {
  it('counts words, not spaces', () => {
    expect(wordCount('  one  two\nthree ')).toBe(3)
    expect(wordCount('')).toBe(0)
  })
})

describe('summarizeQuality', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  const line = (at: string, change: Partial<TakeQuality> = {}): string => `${at} ${qualityLine({ ...take, ...change })}`
  const log = [
    line('2026-11-05T10:00:00.000Z'),
    line('2026-11-05T10:01:00.000Z', { cuesOut: 1 }),
    line('2026-11-05T10:02:00.000Z', { outcome: 'validate: length ratio' }),
    line('2026-11-05T10:03:00.000Z', { outcome: 'skipped' }),
    line('2026-09-01T10:00:00.000Z', { outcome: 'timeout' }),
    '2026-11-05T10:04:00.000Z [dictation] delivered outcome=typed',
    'not a line at all'
  ].join('\n')

  it('counts takes, fallback reasons, and hints from the last 30 days', () => {
    expect(summarizeQuality(log, now)).toEqual({ takes: 4, fallbacks: { 'validate:_length_ratio': 1 }, hints: 1 })
  })

  it('reads as a short block with rates', () => {
    const report = qualityReport(summarizeQuality(log, now)).join('\n')
    expect(report).toContain('takes: 4')
    expect(report).toContain('fell back: 1 (25%)')
    expect(report).toContain('validate:_length_ratio: 1')
    expect(report).toContain('cue word hints: 1 (25%)')
  })

  it('is calm about an empty log', () => {
    expect(qualityReport(summarizeQuality('', now)).join('\n')).toContain('fell back: 0 (0%)')
  })
})
