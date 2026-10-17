// SPDX-License-Identifier: GPL-3.0-only
// shared/polish-vectors.json is the answer key every platform runs
// (ios/prd.json IOS-007): desktop must give exactly these answers.
import { describe, expect, it } from 'vitest'
import vectors from '../../../shared/polish-vectors.json'
import { dictionaryHint } from '../../shared/dictionary'
import { validatePolish } from './llm'

describe('shared/polish-vectors.json on desktop', () => {
  it.each(vectors.validate.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const expected = v.ok ? { ok: true, text: v.text } : { ok: false, reason: v.reason }
    expect(validatePolish(v.input, v.candidate, { smartLists: v.smartLists })).toEqual(expected)
  })

  it.each(vectors.hints.map((h) => [h.name, h] as const))('hint: %s', (_name, h) => {
    expect(dictionaryHint(h.entries)).toBe(h.hint)
  })
})
