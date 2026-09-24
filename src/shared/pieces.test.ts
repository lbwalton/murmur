// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildCompareContext, type RelatedLine } from './compare'
import { findSeams } from './sorter'
import { assignPieceVotes, flattenPieces, piecesToCompare, runsToCompare } from './pieces'

const TASKS = `## 2026-09-20
- [ ] Call the vet. ([10:32](inbox/2026-09-20.md))
- [x] Book the flight. ([10:32](inbox/2026-09-20.md))
`
const items = buildCompareContext(TASKS, '')
const vet = { relation: 'same' as const, item: 1 }

describe('piecesToCompare', () => {
  const sentences = ['Pay the gas bill, and call the vet.', 'Call the vet.', 'Buy stamps, and call the vet.']
  const seams = sentences.map(findSeams)

  it('cuts a related task or idea with confirmed seams and holds the rest whole', () => {
    const related: RelatedLine[] = [
      { local: 0, vote: vet, item: items[0] },
      { local: 1, vote: vet, item: items[0] },
      { local: 2, vote: vet, item: items[0] }
    ]
    const { cut, whole } = piecesToCompare(related, sentences, ['task', 'task', 'idea'], seams, { 1: [1] })
    expect(cut).toEqual([{ local: 0, label: 'task', pieces: ['Pay the gas bill', 'call the vet'], lead: null }])
    // No seam vote for sentence 3, no seam at all in sentence 2.
    expect(whole.map((w) => w.local)).toEqual([1, 2])
  })

  it('cuts a related idea the same way', () => {
    const related: RelatedLine[] = [{ local: 0, vote: vet, item: items[0] }]
    const { cut } = piecesToCompare(related, sentences, ['idea', 'task', 'task'], seams, { 1: [1] })
    expect(cut).toEqual([{ local: 0, label: 'idea', pieces: ['Pay the gas bill', 'call the vet'], lead: null }])
  })

  it('never cuts a note, and a cut that yields one piece stays whole', () => {
    const related: RelatedLine[] = [{ local: 0, vote: vet, item: items[0] }]
    expect(piecesToCompare(related, sentences, ['note', 'task', 'task'], seams, { 1: [1] }).cut).toEqual([])
    expect(piecesToCompare(related, ['Call the vet.'], ['task'], [[]], { 1: [1] }).cut).toEqual([])
  })
})

describe('piecesToCompare with a lead-in (US-062)', () => {
  it('compares the pieces bare and carries the lead-in on the set', () => {
    const sentence = 'I need to buy eggs, milk, and bread.'
    const related: RelatedLine[] = [{ local: 0, vote: vet, item: items[0] }]
    const { cut } = piecesToCompare(related, [sentence], ['task'], [findSeams(sentence)], { 1: [1, 2] }, { 1: 5 })
    expect(cut).toEqual([
      { local: 0, label: 'task', pieces: ['eggs', 'milk', 'bread'], lead: { text: 'I need to buy', group: 'run-1' } }
    ])
  })
})

describe('runsToCompare (US-062)', () => {
  it('cuts the kept runs for the piece look and skips everything else', () => {
    const sentences = ['I need to buy apples, and bread.', 'Call the vet.', 'Maybe a pill, or a tray.', 'Nice day, and warm.']
    const seams = sentences.map(findSeams)
    const sets = runsToCompare([0, 1, 2, 3], sentences, ['task', 'task', 'idea', 'note'], seams, { 1: [1], 3: [1], 4: [1] }, { 1: 5 })
    expect(sets).toEqual([
      { local: 0, label: 'task', pieces: ['apples', 'bread'], lead: { text: 'I need to buy', group: 'run-1' } },
      { local: 2, label: 'idea', pieces: ['Maybe a pill', 'or a tray'], lead: null }
    ])
  })
})

describe('flattenPieces and assignPieceVotes', () => {
  const cut = [
    { local: 0, label: 'task' as const, pieces: ['Pay the gas bill', 'call the vet.'], lead: null },
    { local: 3, label: 'idea' as const, pieces: ['a smaller pill', 'a quieter tray'], lead: { text: 'Maybe try', group: 'run-4' } }
  ]

  it('numbers every piece in sentence order with its sentence label', () => {
    expect(flattenPieces(cut)).toEqual({
      sentences: ['Pay the gas bill', 'call the vet.', 'a smaller pill', 'a quieter tray'],
      labels: ['task', 'task', 'idea', 'idea']
    })
  })

  it('holds only the piece a vote tied to a real item and files the rest', () => {
    const { held, filed } = assignPieceVotes(cut, { 2: vet, 4: { relation: 'same', item: 99 } }, items)
    expect(held).toEqual([{ local: 0, text: 'call the vet.', label: 'task', vote: vet, item: items[0], lead: null }])
    expect(filed).toEqual([
      { local: 0, text: 'Pay the gas bill', label: 'task', lead: null },
      { local: 3, text: 'a smaller pill', label: 'idea', lead: { text: 'Maybe try', group: 'run-4' } },
      { local: 3, text: 'a quieter tray', label: 'idea', lead: { text: 'Maybe try', group: 'run-4' } }
    ])
  })

  it('holds two pieces of one sentence side by side', () => {
    const flight = { relation: 'completes' as const, item: 2 }
    const { held, filed } = assignPieceVotes(cut, { 1: vet, 2: flight }, items)
    expect(held).toEqual([
      { local: 0, text: 'Pay the gas bill', label: 'task', vote: vet, item: items[0], lead: null },
      { local: 0, text: 'call the vet.', label: 'task', vote: flight, item: items[1], lead: null }
    ])
    expect(filed.map((f) => f.local)).toEqual([3, 3])
  })

  it('files every piece when the second look relates nothing', () => {
    const { held, filed } = assignPieceVotes(cut, {}, items)
    expect(held).toEqual([])
    expect(filed).toHaveLength(4)
  })
})
