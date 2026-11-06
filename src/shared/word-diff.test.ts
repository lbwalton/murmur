// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from './history'
import { heardWords, offersWhatYouSaid } from './word-diff'

const removed = (raw: string, final: string): string[] =>
  heardWords(raw, final)
    .filter((word) => word.removed)
    .map((word) => word.text)

describe('heardWords', () => {
  it('marks the words cleanup took out', () => {
    expect(removed('Send it Tuesday, sorry, Wednesday.', 'Send it Wednesday.')).toEqual(['Tuesday,', 'sorry,'])
  })

  it('keeps every raw word, in order, with its punctuation', () => {
    const raw = 'Send it Tuesday, sorry, Wednesday.'
    expect(heardWords(raw, 'Send it Wednesday.').map((word) => word.text).join(' ')).toBe(raw)
  })

  it('does not count punctuation or capitals as a change', () => {
    expect(removed('send the report today', 'Send the report, today.')).toEqual([])
  })

  it('marks the first of 2 repeated phrases only as far as words differ', () => {
    expect(removed('as a gift, as a present', 'as a present')).toHaveLength(3)
  })

  it('marks everything when nothing survived, and nothing when all did', () => {
    expect(removed('one two', 'three')).toEqual(['one', 'two'])
    expect(removed('one two', 'one two')).toEqual([])
  })

  it('handles an empty final text', () => {
    expect(removed('one two', '')).toEqual(['one', 'two'])
  })

  it('finds a word that moved later without losing what follows', () => {
    expect(removed('please send the green file', 'send green file please')).not.toContain('file')
  })
})

describe('offersWhatYouSaid', () => {
  const event = (rawText: string, finalText: string, kind?: SessionEvent['kind']): SessionEvent => ({
    at: 1,
    durationMs: 1,
    rawText,
    finalText,
    words: 1,
    wpm: 1,
    kind
  })

  it('offers it when a word changed', () => {
    expect(offersWhatYouSaid(event('send it tuesday sorry wednesday', 'Send it Wednesday.'))).toBe(true)
  })

  it('does not offer it when only punctuation changed', () => {
    expect(offersWhatYouSaid(event('send it today', 'Send it today.'))).toBe(false)
  })

  it('does not count list marks as a change', () => {
    expect(offersWhatYouSaid(event('milk eggs bread', '- milk\n- eggs\n- bread'))).toBe(false)
    expect(offersWhatYouSaid(event('milk eggs bread', '1. milk\n2. eggs\n3. bread'))).toBe(false)
  })

  it('never offers it on a transform or an empty row', () => {
    expect(offersWhatYouSaid(event('make it shorter', 'the original', 'transform'))).toBe(false)
    expect(offersWhatYouSaid(event('  ', 'x'))).toBe(false)
  })

  it('offers it on a note', () => {
    expect(offersWhatYouSaid(event('note this um now', 'Note this now.', 'note'))).toBe(true)
  })
})
