// SPDX-License-Identifier: GPL-3.0-only
// The cleanup pass's words and numbers come from shared/polish.json
// (ios/prd.json IOS-007): with other values swapped in, desktop follows.
import { describe, expect, it, vi } from 'vitest'
import { CORRECTIONS_PROMPT, POLISH_SYSTEM_PROMPT, SMART_LISTS_PROMPT, polishTranscript, validatePolish } from './llm'

vi.mock('../../../shared/polish.json', () => ({
  default: {
    systemPrompt: ['Line one.', 'Line two.'],
    smartListsPrompt: ['Lists line.'],
    correctionsPrompt: ['Corrections line.', 'Second line.'],
    correctionCues: ['kiwi', 'make it', 'sorry'],
    correctionCut: { slack: 1, perCue: 1 },
    pausedCorrectionCues: ['plum'],
    correctionPause: ';',
    sentenceEnd: '|',
    metaOpeners: ['banana'],
    refusals: ['kumquat'],
    hintSentinel: 'zebra',
    length: { ratioFromWords: 4, floor: 0.9, listFloor: 0.5, ceiling: 1.1, shortDelta: 1 },
    answer: { slack: 2, addedShare: 0.5, droppedShare: 0.5 },
    questionMarks: '%',
    numberWords: ['fig'],
    temperature: 0.7,
    timeoutMs: 5000
  }
}))

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' }

describe('cleanup rules from shared/polish.json', () => {
  it('builds the prompts from the shared lines', () => {
    expect(POLISH_SYSTEM_PROMPT).toBe('Line one. Line two.')
    expect(SMART_LISTS_PROMPT).toBe('Lists line.')
    expect(CORRECTIONS_PROMPT).toBe('Corrections line. Second line.')
  })

  it('earns the deeper cut only for a shared correction cue', () => {
    // Six words to four: under the 0.9 floor, over the 0.5 one.
    expect(validatePolish('one two kiwi three four five', 'one two four five', { corrections: true })).toEqual({
      ok: true,
      text: 'one two four five'
    })
    expect(validatePolish('one two make it three four', 'one two three four', { corrections: true })).toEqual({
      ok: true,
      text: 'one two three four'
    })
    // Desktop's own cue no longer counts once the shared list drops it.
    expect(validatePolish('one two wait three four five', 'one two four five', { corrections: true })).toEqual({
      ok: false,
      reason: 'length ratio'
    })
  })

  it('counts a shared paused cue only between shared pause marks', () => {
    // Six words to four, as above.
    expect(validatePolish('one two; plum; three four five', 'one two four five', { corrections: true })).toEqual({
      ok: true,
      text: 'one two four five'
    })
    // A comma is not a pause mark in this file, before the cue or after
    // it, and desktop's own No, no longer counts once the shared list
    // drops it.
    for (const input of ['one two; plum, three four five', 'one two, plum; three four five', 'one two; no, three four five']) {
      expect(validatePolish(input, 'one two four five', { corrections: true })).toEqual({
        ok: false,
        reason: 'length ratio'
      })
    }
  })

  it('never counts a shared paused cue after a word that opens a shared sentence', () => {
    // Seven words to five; a word after a | opens a sentence here, and a
    // period does not.
    expect(validatePolish('zero one| two; plum; three four', 'zero one| two; four', { corrections: true })).toEqual({
      ok: false,
      reason: 'length ratio'
    })
    expect(validatePolish('zero one. two; plum; three four', 'zero one. two; four', { corrections: true })).toEqual({
      ok: true,
      text: 'zero one. two; four'
    })
  })

  it('caps a correction cut by the shared slack and per cue', () => {
    // Eight words to four drops one cue: a cut of four, past 1 + 1,
    // though desktop's own 4 + 8 would allow it.
    expect(
      validatePolish('one two sorry three four five six seven', 'one two six seven', { corrections: true })
    ).toEqual({ ok: false, reason: 'length ratio' })
  })

  it('uses the shared openers and refusals', () => {
    expect(validatePolish('one two three', 'Banana one two three')).toEqual({ ok: false, reason: 'meta chatter' })
    expect(validatePolish('one two three', 'One kumquat three')).toEqual({ ok: false, reason: 'refusal' })
    // Desktop's own opener no longer counts once the shared list drops it.
    expect(validatePolish('one two three', 'Here is three')).toMatchObject({ ok: true })
  })

  it('uses the shared length limits', () => {
    expect(validatePolish('one two three', 'one two three four five')).toEqual({ ok: false, reason: 'length delta' })
    expect(validatePolish('one two three four five', 'one two three four')).toEqual({ ok: false, reason: 'length ratio' })
  })

  it('catches an answer by the shared slack, shares, question marks, and number words', () => {
    // Half the words new and half dropped: within the shared 0.5 shares,
    // though desktop's own 0.4 would turn it away.
    expect(
      validatePolish('one two three four five six seven eight nine ten', 'one two three four five a b c d e')
    ).toMatchObject({ ok: true })
    expect(validatePolish('a b c d e f g h i j', 'k l m n o p q r s t')).toEqual({ ok: false, reason: 'answered' })
    // Two new words in a short take: within the shared slack of 2, though
    // desktop's own 1 would turn it away.
    expect(validatePolish('a b c', 'a d e')).toMatchObject({ ok: true })
    // An answer after a shared question mark is an answer; after a
    // question mark this file does not list, it is one new word.
    expect(validatePolish('one two three%', 'one two three% four')).toEqual({ ok: false, reason: 'answered' })
    expect(validatePolish('one two three?', 'one two three? four')).toMatchObject({ ok: true })
    // Digits for a shared number word are not counted; desktop's own
    // number word no longer counts once the shared list drops it.
    expect(validatePolish('fig a fig b fig', '7 a 7 b 7')).toMatchObject({ ok: true })
    expect(validatePolish('two a two b two', '2 a 2 b 2')).toEqual({ ok: false, reason: 'answered' })
  })

  it('sends the shared temperature and checks the shared sentinel', async () => {
    let temperature: unknown
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      temperature = (JSON.parse(String(init?.body)) as { temperature: unknown }).temperature
      return new Response(JSON.stringify({ choices: [{ message: { content: 'zebra one two' } }] }), { status: 200 })
    }) as typeof fetch
    expect(await polishTranscript('zoo one two', cfg, { fetchImpl, hints: ['zebra hint'] })).toBeNull()
    expect(temperature).toBe(0.7)
  })
})
