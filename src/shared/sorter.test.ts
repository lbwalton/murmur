// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILED_HEADING_TEMPLATE,
  type SortLabel,
  applySplits,
  confirmedSeams,
  cutAtSeams,
  findSeams,
  headingPrefix,
  holdBelow,
  ideaLine,
  numberedList,
  planFiling,
  rekeyVotes,
  relativeLink,
  remainingSentences,
  renderFiledHeading,
  sanitizeTopic,
  seamPrompt,
  settle,
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
    expect(v).toEqual({ ok: true, labels: ['task', 'idea', 'note'], topic: '', seams: {} })
  })

  it('takes a topic only when one was asked for, and never lets a bad one fail the sort', () => {
    const reply = '{"1":"task","topic":"Dentist and travel"}'
    expect(validateSort(1, reply, { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: 'Dentist and travel',
      seams: {}
    })
    // Not asked for: the reserved key is an unexpected sentence number.
    expect(validateSort(1, reply)).toEqual({ ok: false, reason: 'extra sentences' })
    // Asked for and unusable: the words still file, the heading drops it.
    expect(validateSort(1, '{"1":"task","topic":""}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: '',
      seams: {}
    })
    expect(validateSort(1, '{"1":"task"}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: '',
      seams: {}
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

describe('findSeams (US-056)', () => {
  const sides = (s: string) =>
    findSeams(s).map((seam) => [s.slice(0, seam.start).trim(), s.slice(seam.end).trim()])

  it('finds a seam at a comma or semicolon followed by a space', () => {
    expect(sides('getting groceries, getting tacos; going home')).toEqual([
      ['getting groceries', 'getting tacos; going home'],
      ['getting groceries, getting tacos', 'going home']
    ])
  })

  it('finds a seam at the connectors and, then, also between word runs', () => {
    expect(sides('eggs and bacon')).toEqual([['eggs', 'bacon']])
    expect(sides('call Bob then email Ann also ping Sam')).toEqual([
      ['call Bob', 'email Ann also ping Sam'],
      ['call Bob then email Ann', 'ping Sam']
    ])
  })

  it('counts a compound connector as one seam', () => {
    expect(sides('getting tacos, and then going to the playground.')).toEqual([
      ['getting tacos', 'going to the playground.']
    ])
    expect(sides('one and also two')).toEqual([['one', 'two']])
    expect(sides('one, also two')).toEqual([['one', 'two']])
  })

  it('finds nothing inside a list line, a number, or a single word run', () => {
    expect(findSeams('- eggs, bacon, and toast')).toEqual([])
    expect(findSeams('1. eggs and bacon')).toEqual([])
    expect(findSeams('pay 1,000 dollars')).toEqual([])
    expect(findSeams('Tomorrow.')).toEqual([])
    expect(findSeams('and then')).toEqual([])
    expect(findSeams(', so')).toEqual([])
  })

  it('does not treat a connector inside a word as a seam', () => {
    expect(findSeams('the band played')).toEqual([])
    expect(findSeams('sandwiches then')).toEqual([])
  })

  it('never offers a side that is only joining words', () => {
    expect(findSeams('And then we went home')).toEqual([])
    expect(findSeams('wait, then')).toEqual([])
    expect(findSeams('buy milk, and.')).toEqual([])
    expect(sides('And then we went home, and ate')).toEqual([['And then we went home', 'ate']])
  })

  it('never offers a seam inside a quote or a parenthesis', () => {
    expect(sides('buy milk (whole, not skim) and eggs')).toEqual([['buy milk (whole, not skim)', 'eggs']])
    expect(sides('he said "eggs, bacon", and left')).toEqual([['he said "eggs, bacon"', 'left']])
  })
})

describe('cutAtSeams', () => {
  const s = 'Tomorrow we are getting groceries, getting tacos, and going to the playground.'

  it('cuts only at confirmed seams, removing the seam text and nothing else', () => {
    const seams = findSeams(s)
    expect(cutAtSeams(s, seams, [1, 2])).toEqual([
      'Tomorrow we are getting groceries',
      'getting tacos',
      'going to the playground.'
    ])
    expect(cutAtSeams(s, seams, [2])).toEqual([
      'Tomorrow we are getting groceries, getting tacos',
      'going to the playground.'
    ])
  })

  it('keeps every word of the sentence on exactly one line, in order', () => {
    const seams = findSeams(s)
    const words = (t: string) => t.replace(/[.,;]/g, ' ').split(/\s+/).filter(Boolean)
    expect(cutAtSeams(s, seams, [1, 2]).flatMap(words)).toEqual(words(s).filter((w) => w !== 'and'))
  })

  it('leaves a sentence whole with no confirmed seam', () => {
    expect(cutAtSeams(s, findSeams(s), [])).toEqual([s])
  })

  it('refuses a vote naming a seam that does not exist, whole sentence, never a partial cut', () => {
    const seams = findSeams(s)
    expect(cutAtSeams(s, seams, [1, 9])).toEqual([s])
    expect(cutAtSeams(s, seams, [0])).toEqual([s])
    expect(cutAtSeams(s, seams, [1.5])).toEqual([s])
    expect(cutAtSeams(s, seams, [2, 1, 1])).toEqual([
      'Tomorrow we are getting groceries',
      'getting tacos',
      'going to the playground.'
    ])
  })

  it('trims a joining comma that doubled punctuation would leave dangling', () => {
    const t = 'a,, b'
    expect(cutAtSeams(t, findSeams(t), [1])).toEqual(['a', 'b'])
  })
})

describe('confirmedSeams', () => {
  it('accepts a list of seam numbers inside the range, deduped and ordered', () => {
    expect(confirmedSeams([2, 1, 2], 2)).toEqual([1, 2])
    expect(confirmedSeams([], 3)).toEqual([])
  })

  it('rejects a vote naming a seam that does not exist, and anything that is not a list of numbers', () => {
    expect(confirmedSeams([1, 9], 2)).toBeNull()
    expect(confirmedSeams([0], 2)).toBeNull()
    expect(confirmedSeams(['1'], 2)).toBeNull()
    expect(confirmedSeams('1', 2)).toBeNull()
    expect(confirmedSeams(null, 2)).toBeNull()
    expect(confirmedSeams([1.5], 2)).toBeNull()
  })
})

describe('validateSort with seams', () => {
  it('reads confirmed seams under the reserved key when seams were offered', () => {
    const v = validateSort(2, '{"1":"task","2":"note","seams":{"1":[1]}}', { seamCounts: [2, 0] })
    expect(v).toEqual({ ok: true, labels: ['task', 'note'], topic: '', seams: { 1: [1] } })
  })

  it('treats a missing key, a non-object, or a bad vote as no vote, per sentence', () => {
    expect(validateSort(1, '{"1":"task"}', { seamCounts: [2] })).toEqual({
      ok: true, labels: ['task'], topic: '', seams: {}
    })
    expect(validateSort(1, '{"1":"task","seams":"1"}', { seamCounts: [2] })).toEqual({
      ok: true, labels: ['task'], topic: '', seams: {}
    })
    expect(validateSort(2, '{"1":"task","2":"task","seams":{"1":[5],"2":[1],"9":[1]}}', { seamCounts: [2, 1] })).toEqual({
      ok: true, labels: ['task', 'task'], topic: '', seams: { 2: [1] }
    })
  })

  it('still refuses the reserved key when seams were not offered', () => {
    expect(validateSort(1, '{"1":"task","seams":{"1":[1]}}')).toEqual({ ok: false, reason: 'extra sentences' })
  })

  it('carries both reserved keys together', () => {
    expect(
      validateSort(1, '{"1":"task","topic":"Errands","seams":{"1":[1]}}', { topic: true, seamCounts: [2] })
    ).toEqual({ ok: true, labels: ['task'], topic: 'Errands', seams: { 1: [1] } })
  })
})

describe('applySplits', () => {
  it('expands only task and idea sentences with a confirmed vote, labels following their pieces', () => {
    const sentences = ['A, and B.', 'C, then D.', 'E, F.']
    const labels: SortLabel[] = ['task', 'note', 'idea']
    const seams = sentences.map(findSeams)
    const out = applySplits(sentences, labels, seams, { 1: [1], 2: [1], 3: [] })
    expect(out.sentences).toEqual(['A', 'B.', 'C, then D.', 'E, F.'])
    expect(out.labels).toEqual(['task', 'task', 'note', 'idea'])
  })
})

describe('seamPrompt', () => {
  it('numbers each seam under its sentence with both sides shown, and is empty with no seams', () => {
    const sentences = ['Tomorrow.', 'eggs and bacon, then toast']
    const text = seamPrompt(sentences, sentences.map(findSeams))
    expect(text).toBe('2.1: "eggs" | "bacon, then toast"\n2.2: "eggs and bacon" | "toast"')
    expect(seamPrompt(['Tomorrow.'], [[]])).toBe('')
  })
})


describe('held lines (US-058)', () => {
  it('holds only lines below the threshold, and keeps a line exactly at it', () => {
    expect(holdBelow(4, [0.9, 0.2, 0.5, 0.49], 0.5)).toEqual({ kept: [0, 2], held: [1, 3] })
  })

  it('keeps everything when there is no confidence to spend', () => {
    expect(holdBelow(3, undefined, 0.5)).toEqual({ kept: [0, 1, 2], held: [] })
    expect(holdBelow(3, [], 0.5)).toEqual({ kept: [0, 1, 2], held: [] })
  })

  it('a threshold of zero holds nothing', () => {
    expect(holdBelow(2, [0, 0.01], 0)).toEqual({ kept: [0, 1], held: [] })
  })

  it('a partial file followed by a second sort settles every line exactly once', () => {
    // Four sentences; a fresh note sends them all. The first sort holds
    // positions 1 and 3.
    const all = [0, 1, 2, 3]
    const first = holdBelow(4, [0.9, 0.2, 0.8, 0.4], 0.5)
    let settled = settle(new Set(), all, first.kept)
    expect([...settled].sort()).toEqual([0, 2])
    const pending = remainingSentences(4, settled)
    expect(pending).toEqual([1, 3])
    // Sort again sends only those two, numbered from zero again, and
    // keeps the second of them: original position 3 settles, 1 stays.
    const second = holdBelow(pending.length, [0.3, 0.7], 0.5)
    settled = settle(settled, pending, second.kept)
    expect([...settled].sort()).toEqual([0, 2, 3])
    expect(remainingSentences(4, settled)).toEqual([1])
    // A third pass keeps it; nothing is left to send and no position
    // was ever recorded twice.
    settled = settle(settled, remainingSentences(4, settled), [0])
    expect(remainingSentences(4, settled)).toEqual([])
    expect(settled.size).toBe(4)
    // A kept index past the sent list is ignored, never a phantom position.
    expect(settle(new Set(), [5], [0, 1]).size).toBe(1)
  })

  it('re-keys seam votes to the kept positions', () => {
    // Sent 1..3; kept sentences 0 and 2; votes on sent 1 and 3.
    expect(rekeyVotes({ 1: [1], 3: [2] }, [0, 2])).toEqual({ 1: [1], 2: [2] })
    // A vote on a held sentence is dropped with it.
    expect(rekeyVotes({ 2: [1] }, [0, 2])).toEqual({})
  })
})
