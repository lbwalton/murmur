// SPDX-License-Identifier: GPL-3.0-only
// The cleanup pass's words and numbers come from shared/polish.json
// (ios/prd.json IOS-007): with other values swapped in, desktop follows.
import { describe, expect, it, vi } from 'vitest'
import { POLISH_SYSTEM_PROMPT, SMART_LISTS_PROMPT, polishTranscript, validatePolish } from './llm'

vi.mock('../../../shared/polish.json', () => ({
  default: {
    systemPrompt: ['Line one.', 'Line two.'],
    smartListsPrompt: ['Lists line.'],
    metaOpeners: ['banana'],
    refusals: ['kumquat'],
    hintSentinel: 'zebra',
    length: { ratioFromWords: 4, floor: 0.9, listFloor: 0.8, ceiling: 1.1, shortDelta: 1 },
    temperature: 0.7,
    timeoutMs: 5000
  }
}))

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' }

describe('cleanup rules from shared/polish.json', () => {
  it('builds the prompts from the shared lines', () => {
    expect(POLISH_SYSTEM_PROMPT).toBe('Line one. Line two.')
    expect(SMART_LISTS_PROMPT).toBe('Lists line.')
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
