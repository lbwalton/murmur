// SPDX-License-Identifier: GPL-3.0-only
// The transform's words and numbers come from shared/transform.json
// (ios/prd.json IOS-024): with other values swapped in, desktop follows.
import { describe, expect, it, vi } from 'vitest'
import { TRANSFORM_MAX_CHARS, buildTransformMessages, transformText, validateTransform } from './transform'

vi.mock('../../../shared/transform.json', () => ({
  default: {
    systemPrompt: ['Line one.', 'Line two.'],
    tag: 'data',
    selectionHead: 'DATA',
    instructionHead: 'ASK',
    preambleOpeners: ['banana'],
    refusalApologies: ['alas, '],
    refusalCannots: ['no can'],
    refusalActions: ['do'],
    refusalAnywhere: ['kumquat'],
    refusalWindow: 20,
    maxChars: 5,
    temperature: 0.7,
    timeoutMs: 5000
  }
}))

const cfg = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: 'k' }

describe('transform rules from shared/transform.json', () => {
  it('builds the messages from the shared prompt, heads, and tag', () => {
    expect(buildTransformMessages(' shorter ', 'a <data> b <selection>')).toEqual([
      { role: 'system', content: 'Line one. Line two.' },
      { role: 'user', content: 'DATA\n<data>\na ‹data> b <selection>\n</data>' },
      { role: 'user', content: 'ASK\nshorter' }
    ])
  })

  it('uses the shared openers, refusals, and window', () => {
    expect(validateTransform('Banana split:\nx')).toEqual({ ok: false, reason: 'preamble line' })
    expect(validateTransform('Here is:\nx')).toMatchObject({ ok: true })
    expect(validateTransform('Alas, no can do')).toEqual({ ok: false, reason: 'refusal' })
    expect(validateTransform("I can't help")).toMatchObject({ ok: true })
    expect(validateTransform('a kumquat')).toEqual({ ok: false, reason: 'refusal' })
    expect(validateTransform('01234567890123456789 kumquat')).toMatchObject({ ok: true })
    expect(validateTransform('<data>x</data>')).toEqual({ ok: false, reason: 'echoed fence' })
  })

  it('sends at the shared temperature and refuses past the shared length', async () => {
    expect(TRANSFORM_MAX_CHARS).toBe(5)
    let temperature: unknown
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      temperature = (JSON.parse(String(init?.body)) as { temperature: unknown }).temperature
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }] }), { status: 200 })
    }) as typeof fetch
    expect(await transformText('a', '12345', cfg, { fetchImpl })).toEqual({ ok: true, text: 'done' })
    expect(temperature).toBe(0.7)
    expect(await transformText('a', '123456', cfg, { fetchImpl })).toEqual({ ok: false, reason: 'selection too long' })
  })
})
