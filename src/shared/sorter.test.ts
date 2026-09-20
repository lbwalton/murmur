// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILED_HEADING_TEMPLATE,
  headingPrefix,
  sanitizeTopic,
  ideaLine,
  numberedList,
  renderFiledHeading,
  planFiling,
  relativeLink,
  splitSentences,
  taskLine,
  validateSort
} from './sorter'

describe('splitSentences', () => {
  it('splits prose at sentence ends and keeps the punctuation', () => {
    expect(splitSentences('Call the dentist. Is Thursday open? Move standup!')).toEqual([
      'Call the dentist.',
      'Is Thursday open?',
      'Move standup!'
    ])
  })

  it('treats every line as its own unit and keeps list lines whole', () => {
    expect(splitSentences('Groceries:\n- eggs. big ones\n1. call Bob. then Ann\nDone.')).toEqual([
      'Groceries:',
      '- eggs. big ones',
      '1. call Bob. then Ann',
      'Done.'
    ])
  })

  it('handles closing quotes and brackets after the terminator', () => {
    expect(splitSentences('He said "go." Then we left.')).toEqual(['He said "go."', 'Then we left.'])
  })

  it('drops blank lines and trims', () => {
    expect(splitSentences('  one thing  \n\n\n two things ')).toEqual(['one thing', 'two things'])
    expect(splitSentences('   ')).toEqual([])
  })

  it('does not split after a title or a Latin shorthand', () => {
    expect(splitSentences('Dr. Smith called. Bring e.g. the deck. Then Mrs. Lee, vs. last time, agreed.')).toEqual([
      'Dr. Smith called.',
      'Bring e.g. the deck.',
      'Then Mrs. Lee, vs. last time, agreed.'
    ])
    expect(splitSentences('It ends with etc.')).toEqual(['It ends with etc.'])
  })

  it('keeps a note with no punctuation as one unit', () => {
    expect(splitSentences('remember the thing about the thing')).toEqual(['remember the thing about the thing'])
  })
})

describe('numberedList', () => {
  it('numbers from one, one per line', () => {
    expect(numberedList(['a', 'b'])).toBe('1. a\n2. b')
  })
})

describe('validateSort', () => {
  it('accepts a complete labeling in any key order and casing', () => {
    const v = validateSort(3, '{"2": "Idea", "1": "task", "3": " note "}')
    expect(v).toEqual({ ok: true, labels: ['task', 'idea', 'note'], topic: '' })
  })

  it('takes a topic only when one was asked for, and never lets a bad one fail the sort', () => {
    const reply = '{"1":"task","topic":"Dentist and travel"}'
    expect(validateSort(1, reply, { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: 'Dentist and travel'
    })
    // Not asked for: the reserved key is an unexpected sentence number.
    expect(validateSort(1, reply)).toEqual({ ok: false, reason: 'extra sentences' })
    // Asked for and unusable: the words still file, the heading drops it.
    expect(validateSort(1, '{"1":"task","topic":""}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: ''
    })
    expect(validateSort(1, '{"1":"task"}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: ''
    })
    // A stray key is still a rejection, topics or not.
    expect(validateSort(1, '{"1":"task","mood":"good"}', { topic: true })).toEqual({
      ok: false,
      reason: 'extra sentences'
    })
  })

  it('accepts JSON wrapped in a code fence or prose, taking the object', () => {
    expect(validateSort(1, '```json\n{"1":"task"}\n```').ok).toBe(true)
    expect(validateSort(1, 'Here you go: {"1":"note"} hope that helps').ok).toBe(true)
  })

  it('rejects empty, chatter, and non-JSON', () => {
    expect(validateSort(1, '')).toEqual({ ok: false, reason: 'empty' })
    expect(validateSort(1, 'Sure! I would classify that as a task.')).toEqual({ ok: false, reason: 'not json' })
    expect(validateSort(1, '{"1": task}')).toEqual({ ok: false, reason: 'not json' })
  })

  it('rejects arrays and scalars', () => {
    expect(validateSort(1, '["task"]')).toEqual({ ok: false, reason: 'not an object' })
    expect(validateSort(1, '"task"')).toEqual({ ok: false, reason: 'not an object' })
  })

  it('rejects a missing sentence and an invented one', () => {
    expect(validateSort(3, '{"1":"task","2":"idea"}')).toEqual({ ok: false, reason: 'missing sentences' })
    expect(validateSort(2, '{"1":"task","2":"idea","3":"note"}')).toEqual({ ok: false, reason: 'extra sentences' })
    expect(validateSort(2, '{"1":"task","x":"idea"}')).toEqual({ ok: false, reason: 'extra sentences' })
  })

  it('rejects a label outside the three', () => {
    expect(validateSort(2, '{"1":"task","2":"reminder"}')).toEqual({ ok: false, reason: 'bad label' })
    expect(validateSort(1, '{"1": 1}')).toEqual({ ok: false, reason: 'bad label' })
    expect(validateSort(1, '{"1": "task, idea"}')).toEqual({ ok: false, reason: 'bad label' })
  })
})

describe('relativeLink', () => {
  it('links from the file directory to the inbox file', () => {
    expect(relativeLink('murmur/todo.md', 'murmur/inbox/2026-09-20.md')).toBe('inbox/2026-09-20.md')
    expect(relativeLink('todo.md', 'murmur/inbox/2026-09-20.md')).toBe('murmur/inbox/2026-09-20.md')
    expect(relativeLink('a/b/todo.md', 'a/inbox/x.md')).toBe('../inbox/x.md')
    expect(relativeLink('a/todo.md', 'a/x.md')).toBe('x.md')
    expect(relativeLink('deep/er/todo.md', 'x.md')).toBe('../../x.md')
  })

  it('encodes spaces and hashes so the link survives strict markdown readers', () => {
    expect(relativeLink('murmur/todo.md', 'murmur/log/2026-09-20 10-32.md')).toBe('log/2026-09-20%2010-32.md')
    expect(relativeLink('murmur/todo.md', 'murmur/inbox/note#1.md')).toBe('inbox/note%231.md')
    expect(relativeLink('a/b/todo.md', 'a/in box/x.md')).toBe('../in%20box/x.md')
  })
})

describe('filed lines', () => {
  it('renders a checkbox task and a dash idea with the time link', () => {
    expect(taskLine('Call the dentist.', '10:32', 'inbox/2026-09-20.md')).toBe(
      '- [ ] Call the dentist. ([10:32](inbox/2026-09-20.md))'
    )
    expect(ideaLine('Maybe a wizard step.', '10:32', 'inbox/2026-09-20.md')).toBe(
      '- Maybe a wizard step. ([10:32](inbox/2026-09-20.md))'
    )
  })

  it('strips a list marker the sentence already carries so lines never double up', () => {
    expect(taskLine('- [ ] buy eggs', '10:32', 'i.md')).toBe('- [ ] buy eggs ([10:32](i.md))')
    expect(taskLine('- buy eggs', '10:32', 'i.md')).toBe('- [ ] buy eggs ([10:32](i.md))')
    expect(ideaLine('2. a thought', '10:32', 'i.md')).toBe('- a thought ([10:32](i.md))')
  })
})

describe('sanitizeTopic', () => {
  it('keeps a short plain name', () => {
    expect(sanitizeTopic('Dentist and travel')).toBe('Dentist and travel')
    expect(sanitizeTopic('  podcast   setup  ')).toBe('podcast setup')
    expect(sanitizeTopic('Invoices.')).toBe('Invoices')
  })

  it('strips anything that would break a heading or a link', () => {
    // The markup goes and the bare words stay; leftover words are
    // harmless in a heading, unmatched brackets are not.
    expect(sanitizeTopic('## Travel [plans](x)')).toBe('Travel plans x')
    expect(sanitizeTopic('Travel plans')).toBe('Travel plans')
    expect(sanitizeTopic('budget\nnotes')).toBe('budget notes')
    expect(sanitizeTopic('**bold** talk')).toBe('bold talk')
  })

  it('refuses anything that is not a short plain name', () => {
    expect(sanitizeTopic('')).toBe('')
    expect(sanitizeTopic('   ')).toBe('')
    expect(sanitizeTopic(null)).toBe('')
    expect(sanitizeTopic(42)).toBe('')
    expect(sanitizeTopic('one two three four five six seven')).toBe('')
    expect(sanitizeTopic('x'.repeat(61))).toBe('')
  })
})

describe('filed headings', () => {
  const when = new Date(2026, 8, 20, 10, 32)

  it('renders the day heading and honors an empty template as off', () => {
    expect(renderFiledHeading(DEFAULT_FILED_HEADING_TEMPLATE, when)).toBe('## 2026-09-20')
    expect(renderFiledHeading('### {date} {time}', when)).toBe('### 2026-09-20 10:32')
    expect(renderFiledHeading('', when)).toBe('')
    expect(renderFiledHeading('   ', when)).toBe('')
  })

  it('puts a topic in the heading and collapses the gap when there is none', () => {
    expect(renderFiledHeading(DEFAULT_FILED_HEADING_TEMPLATE, when, 'Dentist and travel')).toBe(
      '## 2026-09-20 Dentist and travel'
    )
    expect(renderFiledHeading('## {topic}', when, 'Dentist and travel')).toBe('## Dentist and travel')
    // A template that is only a topic, with no topic to put in it, is
    // no heading at all rather than a bare marker.
    expect(renderFiledHeading('## {topic}', when)).toBe('##')
  })

  it('writes a heading once per file, whatever else the file holds', () => {
    expect(headingPrefix('## 2026-09-20', '')).toBe('## 2026-09-20\n')
    expect(headingPrefix('## 2026-09-20', '## 2026-09-19\n- [ ] older\n')).toBe('## 2026-09-20\n')
    expect(headingPrefix('## 2026-09-20', '## 2026-09-20\n- [ ] earlier today\n')).toBe('')
    // A heading the user moved to the top still counts as carried.
    expect(headingPrefix('## 2026-09-20', '# My tasks\n\n## 2026-09-20\n\n## 2026-09-19\n')).toBe('')
    expect(headingPrefix('', 'anything')).toBe('')
  })

  it('does not mistake a longer line for the heading', () => {
    expect(headingPrefix('## 2026-09-20', '## 2026-09-20 standup\n')).toBe('## 2026-09-20\n')
  })
})

describe('planFiling', () => {
  it('copies sentences into their buckets in order, wording untouched', () => {
    const plan = planFiling(
      ['Call the dentist.', 'Maybe the wizard asks for the vault.', 'Nice weather today.', 'Email Bob.'],
      ['task', 'idea', 'note', 'task'],
      { time: '10:32', inboxFile: 'murmur/inbox/2026-09-20.md', tasksFile: 'murmur/todo.md', ideasFile: 'murmur/ideas.md' }
    )
    expect(plan.tasks).toEqual([
      '- [ ] Call the dentist. ([10:32](inbox/2026-09-20.md))',
      '- [ ] Email Bob. ([10:32](inbox/2026-09-20.md))'
    ])
    expect(plan.ideas).toEqual(['- Maybe the wizard asks for the vault. ([10:32](inbox/2026-09-20.md))'])
    expect(plan.notes).toEqual(['Nice weather today.'])
  })
})
