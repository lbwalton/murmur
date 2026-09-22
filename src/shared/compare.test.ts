// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { buildCompareContext, contextPrompt, heldReasonFor, pickRelated, readRelationVotes } from './compare'

const TASKS = `## 2026-09-20
- [ ] Call the dentist about Thursday. ([10:32](inbox/2026-09-20.md))
- [x] Book the flight. ([10:32](inbox/2026-09-20.md))
- [ ] Renew the domain.
`
const IDEAS = `## 2026-09-20
- The wizard could ask for the vault. ([10:32](inbox/2026-09-20.md))
`

describe('buildCompareContext', () => {
  it('numbers both files in order, tasks first, with state and links stripped', () => {
    expect(buildCompareContext(TASKS, IDEAS)).toEqual([
      { number: 1, file: 'tasks', nth: 0, text: 'Call the dentist about Thursday.', done: false, checkbox: true },
      { number: 2, file: 'tasks', nth: 1, text: 'Book the flight.', done: true, checkbox: true },
      { number: 3, file: 'tasks', nth: 2, text: 'Renew the domain.', done: false, checkbox: true },
      { number: 4, file: 'ideas', nth: 0, text: 'The wizard could ask for the vault.', done: false, checkbox: false }
    ])
  })

  it('keeps only the most recent items per file, numbered as the model sees them', () => {
    const many = Array.from({ length: 70 }, (_, i) => `- [ ] task ${i}`).join('\n')
    const context = buildCompareContext(many, '', 60)
    expect(context).toHaveLength(60)
    expect(context[0]).toMatchObject({ number: 1, nth: 10, text: 'task 10' })
    expect(context[59]).toMatchObject({ number: 60, nth: 69, text: 'task 69' })
  })

  it('yields nothing for empty files', () => {
    expect(buildCompareContext('', '')).toEqual([])
    expect(contextPrompt([])).toBe('')
  })

  it('renders the prompt with the cap stated and the state shown', () => {
    expect(contextPrompt(buildCompareContext(TASKS, ''), 60)).toBe(
      'Items already filed (the most recent 60 of each file):\n1. [ ] Call the dentist about Thursday.\n2. [x] Book the flight.\n3. [ ] Renew the domain.'
    )
  })
})

describe('readRelationVotes', () => {
  it('accepts a same or completes pair naming a real sentence and item', () => {
    expect(readRelationVotes({ '1': [1, 3], '4': [2, 1] }, 4, 3)).toEqual({
      1: { relation: 'same', item: 3 },
      4: { relation: 'completes', item: 1 }
    })
  })

  it('treats anything else as new for that sentence only', () => {
    expect(readRelationVotes({ '1': [1, 9], '2': [1, 1] }, 2, 3)).toEqual({ 2: { relation: 'same', item: 1 } })
    expect(readRelationVotes({ '1': [3, 1] }, 2, 3)).toEqual({})
    expect(readRelationVotes({ '1': 'same 1' }, 2, 3)).toEqual({})
    expect(readRelationVotes({ '1': [1] }, 2, 3)).toEqual({})
    expect(readRelationVotes({ '1': ['1', '1'] }, 2, 3)).toEqual({})
    expect(readRelationVotes({ '9': [1, 1] }, 2, 3)).toEqual({})
    expect(readRelationVotes({ '1': [1, 1.5] }, 2, 3)).toEqual({})
    expect(readRelationVotes('nope', 2, 3)).toEqual({})
    expect(readRelationVotes(null, 2, 3)).toEqual({})
  })

  it('reads nothing when there were no items to compare against', () => {
    expect(readRelationVotes({ '1': [1, 1] }, 2, 0)).toEqual({})
  })
})

describe('pickRelated', () => {
  const items = buildCompareContext(TASKS, IDEAS)

  it('holds a task or idea the vote tied to an item, and never a note', () => {
    const labels = ['task', 'note', 'idea', 'task']
    const relations = { 1: { relation: 'same' as const, item: 1 }, 2: { relation: 'same' as const, item: 1 }, 3: { relation: 'completes' as const, item: 4 } }
    const { related, kept } = pickRelated([0, 1, 2, 3], labels, relations, items)
    expect(related.map((r) => [r.local, r.vote.relation, r.item.number])).toEqual([
      [0, 'same', 1],
      [2, 'completes', 4]
    ])
    expect(kept).toEqual([1, 3])
  })

  it('keeps a line whose vote names an item outside the context', () => {
    const { related, kept } = pickRelated([0], ['task'], { 1: { relation: 'same', item: 99 } }, items)
    expect(related).toEqual([])
    expect(kept).toEqual([0])
  })
})

describe('heldReasonFor', () => {
  const open = { number: 1, file: 'tasks' as const, nth: 0, text: 'x', done: false, checkbox: true }
  const done = { ...open, done: true }

  it('names the reason from the vote, and a finished item wins whatever the vote said', () => {
    expect(heldReasonFor({ relation: 'same', item: 1 }, open)).toBe('same')
    expect(heldReasonFor({ relation: 'completes', item: 1 }, open)).toBe('completes')
    expect(heldReasonFor({ relation: 'same', item: 1 }, done)).toBe('done-before')
    expect(heldReasonFor({ relation: 'completes', item: 1 }, done)).toBe('done-before')
  })
})
