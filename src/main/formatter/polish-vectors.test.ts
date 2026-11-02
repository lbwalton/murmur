// SPDX-License-Identifier: GPL-3.0-only
// shared/polish-vectors.json is the answer key every platform runs
// (ios/prd.json IOS-007): desktop must give exactly these answers.
// MURMUR_WRITE_VECTORS=1 writes desktop's answer into every validate
// case first, so each expected answer is desktop's own (IOS-030).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dictionaryHint } from '../../shared/dictionary'
import { validatePolish } from './llm'

interface ValidateCase {
  name: string
  input: string
  candidate: string
  smartLists: boolean
  corrections: boolean
  ok: boolean
  text?: string
  reason?: string
}

interface HintCase {
  name: string
  entries: Array<{ from: string; to: string }>
  hint: string | null
}

const file = join(__dirname, '../../../shared/polish-vectors.json')

if (process.env.MURMUR_WRITE_VECTORS) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { validate: ValidateCase[] }
  data.validate = data.validate.map(({ name, input, candidate, smartLists, corrections }) => {
    const verdict = validatePolish(input, candidate, { smartLists, corrections })
    const answer = verdict.ok ? { ok: true, text: verdict.text } : { ok: false, reason: verdict.reason }
    return { name, input, candidate, smartLists, corrections, ...answer }
  })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

const vectors = JSON.parse(readFileSync(file, 'utf8')) as { validate: ValidateCase[]; hints: HintCase[] }

describe('shared/polish-vectors.json on desktop', () => {
  it.each(vectors.validate.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const expected = v.ok ? { ok: true, text: v.text } : { ok: false, reason: v.reason }
    expect(validatePolish(v.input, v.candidate, { smartLists: v.smartLists, corrections: v.corrections })).toEqual(
      expected
    )
  })

  it('names every case once and says whether corrections is on', () => {
    expect(new Set(vectors.validate.map((v) => v.name)).size).toBe(vectors.validate.length)
    expect(vectors.validate.every((v) => typeof v.corrections === 'boolean')).toBe(true)
  })

  it.each(vectors.hints.map((h) => [h.name, h] as const))('hint: %s', (_name, h) => {
    expect(dictionaryHint(h.entries)).toBe(h.hint)
  })
})
