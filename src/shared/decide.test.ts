// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildDecisionRequest, readDecisionAnswers } from './decide'
import { findSeams } from './sorter'

const sentences = ['Call the dentist.', 'Buy eggs, and buy milk.', 'Nice day.']
const seams = sentences.map(findSeams)

describe('buildDecisionRequest', () => {
  const req = buildDecisionRequest('jev-latest', sentences, seams)

  it('sends the numbered sentences as state and one Choice per sentence over the three labels', () => {
    expect(req.model).toBe('jev-latest')
    expect(req.state).toEqual(['1. Call the dentist.', '2. Buy eggs, and buy milk.', '3. Nice day.'])
    for (const n of [1, 2, 3]) {
      const q = req.questions[`label_${n}`]
      expect(q.type).toBe('choice')
      expect(Object.keys(q.criteria as Record<string, string>)).toEqual(['task', 'idea', 'note'])
      expect((q.instructions as { sentence: number }).sentence).toBe(n)
    }
  })

  it('asks one Noul per seam with both sides as structured fields', () => {
    expect(seams[1]).toHaveLength(1)
    const q = req.questions.seam_2_1
    expect(q.type).toBe('noul')
    expect(q.instructions).toMatchObject({ sentence: 2, left: 'Buy eggs', right: 'buy milk.' })
    expect(q.criteria).toEqual({ true: expect.any(String), false: expect.any(String) })
    expect(req.questions.seam_1_1).toBeUndefined()
    expect(req.questions.seam_3_1).toBeUndefined()
  })

  it('never asks for a topic or any free text', () => {
    for (const q of Object.values(req.questions)) expect(['choice', 'noul']).toContain(q.type)
  })
})

describe('readDecisionAnswers', () => {
  const counts = seams.map((s) => s.length)
  const good = {
    label_1: { type: 'choice', choice: 'task', confidence: 0.97, probabilities: { task: 0.97, idea: 0.02, note: 0.01 } },
    label_2: { type: 'choice', choice: 'task', confidence: 0.9, probabilities: { task: 0.9, idea: 0.05, note: 0.05 } },
    label_3: { type: 'choice', choice: 'note', probabilities: { task: 0.1, idea: 0.1, note: 0.8 } },
    seam_2_1: { type: 'noul', noul: 0.93 }
  }

  it('maps a complete set of answers onto the same verdict the chat path produces', () => {
    expect(readDecisionAnswers(good, 3, counts)).toEqual({
      ok: true,
      labels: ['task', 'task', 'note'],
      topic: '',
      seams: { 2: [1] },
      confidence: [0.97, 0.9, 0.8]
    })
  })

  it('treats a seam vote below the line, or missing, as no cut', () => {
    const low = { ...good, seam_2_1: { type: 'noul', noul: 0.4 } }
    expect(readDecisionAnswers(low, 3, counts)).toMatchObject({ ok: true, seams: {} })
    const { seam_2_1: _dropped, ...none } = good
    expect(readDecisionAnswers(none, 3, counts)).toMatchObject({ ok: true, seams: {} })
  })

  it('rejects the whole note when a sentence has no label, matching all-or-nothing filing', () => {
    const { label_3: _dropped, ...missing } = good
    expect(readDecisionAnswers(missing, 3, counts)).toEqual({ ok: false, reason: 'missing sentences' })
    expect(readDecisionAnswers(null, 3, counts)).toEqual({ ok: false, reason: 'missing sentences' })
    expect(readDecisionAnswers([], 3, counts)).toEqual({ ok: false, reason: 'missing sentences' })
  })

  it('rejects a label outside the answer space or an answer of the wrong type', () => {
    expect(readDecisionAnswers({ ...good, label_1: { type: 'choice', choice: 'reminder' } }, 3, counts)).toEqual({
      ok: false,
      reason: 'bad label'
    })
    expect(readDecisionAnswers({ ...good, label_1: { type: 'noul', noul: 0.9 } }, 3, counts)).toEqual({
      ok: false,
      reason: 'bad label'
    })
  })

  it('splits the chat path fixture identically from Noul votes', () => {
    const s = 'Tomorrow we are getting groceries, getting tacos, and going to the playground.'
    const seamsOf = [findSeams(s)]
    const verdict = readDecisionAnswers(
      {
        label_1: { type: 'choice', choice: 'task', confidence: 0.95 },
        seam_1_1: { type: 'noul', noul: 0.9 },
        seam_1_2: { type: 'noul', noul: 0.9 }
      },
      1,
      seamsOf.map((x) => x.length)
    )
    expect(verdict).toMatchObject({ ok: true, seams: { 1: [1, 2] } })
  })

  it('carries a confidence of one when the answer gives none', () => {
    const bare = { label_1: { type: 'choice', choice: 'idea' } }
    expect(readDecisionAnswers(bare, 1, [0])).toEqual({
      ok: true,
      labels: ['idea'],
      topic: '',
      seams: {},
      confidence: [1]
    })
  })
})
