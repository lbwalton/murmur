// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILED_HEADING_TEMPLATE,
  type SortLabel,
  applyKeep,
  applySplits,
  confirmedSeams,
  cutAtSeams,
  cutRun,
  findSeams,
  headingPrefix,
  holdBelow,
  ideaLine,
  isItem,
  keepPrompt,
  keepWords,
  leadLine,
  leadPrompt,
  leadWords,
  numberedList,
  planFiling,
  readKeepSpans,
  rekeyVotes,
  relativeLink,
  remainingSentences,
  renderFiledHeading,
  sanitizeTopic,
  seamPrompt,
  seamSides,
  settle,
  splitLeadIn,
  splitSentences,
  splitUnits,
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
    expect(splitSentences('Shopping today.\n- eggs. big ones\n1. call Bob. then Ann\nDone.')).toEqual([
      'Shopping today.',
      '- eggs. big ones',
      '1. call Bob. then Ann',
      'Done.'
    ])
  })

  it('never sends a list heading as its own unit (live-found 2026-09-23)', () => {
    // Smart lists turns "I need to buy eggs, milk, and bread" into a
    // colon intro over list lines; the decision model filed the intro
    // as a task. The heading stays in the inbox, the items sort.
    expect(
      splitSentences('Call the dentist. Maybe the wizard asks first. I need to buy:\n- eggs\n- milk\n- bread')
    ).toEqual(['Call the dentist.', 'Maybe the wizard asks first.', '- eggs', '- milk', '- bread'])
    expect(splitSentences('Groceries:\n\n1. eggs\n2. milk')).toEqual(['1. eggs', '2. milk'])
    expect(splitSentences('Today:\n- [ ] call Bob')).toEqual(['- [ ] call Bob'])
  })

  it('keeps a colon line that heads no list', () => {
    expect(splitSentences('Here is the thing: call Bob.')).toEqual(['Here is the thing: call Bob.'])
    expect(splitSentences('Remember this:\nCall Bob.')).toEqual(['Remember this:', 'Call Bob.'])
    expect(splitSentences('I need to buy:')).toEqual(['I need to buy:'])
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
    expect(v).toEqual({ ok: true, labels: ['task', 'idea', 'note'], topic: '', seams: {}, relations: {} })
  })

  it('takes a topic only when one was asked for, and never lets a bad one fail the sort', () => {
    const reply = '{"1":"task","topic":"Dentist and travel"}'
    expect(validateSort(1, reply, { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: 'Dentist and travel',
      seams: {},
      relations: {}
    })
    // Not asked for: the reserved key is an unexpected sentence number.
    expect(validateSort(1, reply)).toEqual({ ok: false, reason: 'extra sentences' })
    // Asked for and unusable: the words still file, the heading drops it.
    expect(validateSort(1, '{"1":"task","topic":""}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: '',
      seams: {},
      relations: {}
    })
    expect(validateSort(1, '{"1":"task"}', { topic: true })).toEqual({
      ok: true,
      labels: ['task'],
      topic: '',
      seams: {},
      relations: {}
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

  it('never offers a side that is only spoken fillers (US-114)', () => {
    expect(findSeams('Oh, and an idea: a Times Square takeover for BrambleCat.')).toEqual([])
    expect(findSeams('Um, so, buy milk')).toEqual([])
    expect(findSeams('buy milk, okay.')).toEqual([])
    expect(findSeams('Well, anyway, call Bob')).toEqual([])
    expect(sides('So, call Bob and email Ann')).toEqual([['So, call Bob', 'email Ann']])
  })

  it('keeps a side where a filler sits with real words, or only starts a word', () => {
    expect(sides('dig the well, and fix the pump')).toEqual([['dig the well', 'fix the pump']])
    expect(sides('drive to Ohio, then buy a sofa')).toEqual([['drive to Ohio', 'buy a sofa']])
    expect(sides('okra, and wellness tea')).toEqual([['okra', 'wellness tea']])
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
    expect(v).toEqual({ ok: true, labels: ['task', 'note'], topic: '', seams: { 1: [1] }, relations: {} })
  })

  it('treats a missing key, a non-object, or a bad vote as no vote, per sentence', () => {
    expect(validateSort(1, '{"1":"task"}', { seamCounts: [2] })).toEqual({
      ok: true, labels: ['task'], topic: '', seams: {}, relations: {}
    })
    expect(validateSort(1, '{"1":"task","seams":"1"}', { seamCounts: [2] })).toEqual({
      ok: true, labels: ['task'], topic: '', seams: {}, relations: {}
    })
    expect(validateSort(2, '{"1":"task","2":"task","seams":{"1":[5],"2":[1],"9":[1]}}', { seamCounts: [2, 1] })).toEqual({
      ok: true, labels: ['task', 'task'], topic: '', seams: { 2: [1] }, relations: {}
    })
  })

  it('still refuses the reserved key when seams were not offered', () => {
    expect(validateSort(1, '{"1":"task","seams":{"1":[1]}}')).toEqual({ ok: false, reason: 'extra sentences' })
  })

  it('reads relation votes under the reserved key only when items were offered', () => {
    const reply = '{"1":"task","2":"task","relations":{"1":[1,2],"2":[2,9]}}'
    expect(validateSort(2, reply, { items: 3 })).toEqual({
      ok: true,
      labels: ['task', 'task'],
      topic: '',
      seams: {},
      relations: { 1: { relation: 'same', item: 2 } }
    })
    // Not offered: the reserved key is an unexpected sentence number.
    expect(validateSort(2, reply)).toEqual({ ok: false, reason: 'extra sentences' })
    // Offered and absent: exactly as before.
    expect(validateSort(1, '{"1":"task"}', { items: 3 })).toMatchObject({ ok: true, relations: {} })
  })

  it('carries both reserved keys together', () => {
    expect(
      validateSort(1, '{"1":"task","topic":"Errands","seams":{"1":[1]}}', { topic: true, seamCounts: [2] })
    ).toEqual({ ok: true, labels: ['task'], topic: 'Errands', seams: { 1: [1] }, relations: {} })
  })
})

describe('applySplits', () => {
  it('expands only task and idea sentences with a confirmed vote, labels following their pieces', () => {
    const sentences = ['A, and B.', 'C, then D.', 'E, F.']
    const labels: SortLabel[] = ['task', 'note', 'idea']
    const seams = sentences.map(findSeams)
    const out = applySplits(sentences, labels, seams, { 1: [1], 2: [1], 3: [] })
    // A cut run's final period is trimmed so its items match (US-062);
    // a sentence left whole keeps every character.
    expect(out.sentences).toEqual(['A', 'B', 'C, then D.', 'E, F.'])
    expect(out.labels).toEqual(['task', 'task', 'note', 'idea'])
    expect(out.leads).toEqual([null, null, null, null])
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

describe('lead-ins (US-062)', () => {
  const sentence = 'I need to buy apples, rice, and coffee.'
  const seams = findSeams(sentence)

  it('a list heading becomes the lead-in of the list lines under it', () => {
    const { sentences, leads } = splitUnits('Call Sam. I need to buy:\n- eggs\n- milk\nDone for today.')
    expect(sentences).toEqual(['Call Sam.', '- eggs', '- milk', 'Done for today.'])
    expect(leads.map((l) => l?.text ?? null)).toEqual([null, 'I need to buy:', 'I need to buy:', null])
    expect(leads[1]?.group).toBe(leads[2]?.group)
  })

  it('two headings in one note are two groups', () => {
    const { leads } = splitUnits('Buy:\n- eggs\nBuy:\n- milk')
    expect(leads[0]?.group).not.toBe(leads[1]?.group)
  })

  it('offers every word before the last seam, bare of commas', () => {
    expect(leadWords(sentence, seams)).toEqual(['I', 'need', 'to', 'buy', 'apples', 'rice'])
    expect(leadWords('Call the vet.', findSeams('Call the vet.'))).toEqual([])
    expect(leadWords('Eggs, milk.', findSeams('Eggs, milk.'))).toEqual([])
  })

  it('splits a piece where the first item begins and never loses a word', () => {
    expect(splitLeadIn('I need to buy apples', 5)).toEqual({ lead: 'I need to buy', item: 'apples' })
    expect(splitLeadIn('For the party: chips', 4)).toEqual({ lead: 'For the party', item: 'chips' })
    expect(splitLeadIn('I need to buy apples', 1)).toBeNull()
    expect(splitLeadIn('I need to buy apples', 6)).toBeNull()
    expect(splitLeadIn('I need to buy apples', 2.5)).toBeNull()
  })

  it('cuts a run into a lead-in and matching items, trimming only the final period', () => {
    expect(cutRun(sentence, seams, [1, 2], 5)).toEqual({ lead: 'I need to buy', pieces: ['apples', 'rice', 'coffee'] })
    // Every word lands once: in the lead-in or in an item.
    const run = cutRun(sentence, seams, [1, 2], 5)
    expect([run.lead, ...run.pieces].join(' ')).toBe('I need to buy apples rice coffee')
    expect(cutRun(sentence, seams, [1, 2])).toEqual({ lead: null, pieces: ['I need to buy apples', 'rice', 'coffee'] })
    expect(cutRun('Buy eggs, and wait...', findSeams('Buy eggs, and wait...'), [1]).pieces).toEqual(['Buy eggs', 'wait...'])
    expect(cutRun('Is it eggs, or milk?', findSeams('Is it eggs, or milk?'), [1]).pieces.at(-1)).toBe('or milk?')
    // An abbreviation's period is part of the word, never trimmed.
    const etc = 'Buy milk, eggs, bread, etc.'
    expect(cutRun(etc, findSeams(etc), [1, 2, 3]).pieces.at(-1)).toBe('etc.')
    const doctor = 'Call the vet, and see Dr.'
    expect(cutRun(doctor, findSeams(doctor), [1]).pieces.at(-1)).toBe('see Dr.')
  })

  it('reaches a first item past an unconfirmed clause comma (live-found 2026-09-23)', () => {
    // "For the party" alone was all the old question offered, so the
    // model could not point at chips and cut inside the lead-in.
    const party = 'For the party, I need to buy chips, salsa, and plates.'
    const partySeams = findSeams(party)
    expect(leadWords(party, partySeams)).toEqual(['For', 'the', 'party', 'I', 'need', 'to', 'buy', 'chips', 'salsa'])
    // Seam 1 (the clause comma) stays whole; seams 2 and 3 cut the run.
    expect(cutRun(party, partySeams, [2, 3], 8)).toEqual({
      lead: 'For the party, I need to buy',
      pieces: ['chips', 'salsa', 'plates']
    })
    // A start past the first piece's words means no lead-in.
    expect(cutRun(party, partySeams, [2, 3], 9).lead).toBeNull()
  })

  it('takes no lead-in from a sentence left whole or a start beyond the words offered', () => {
    expect(cutRun(sentence, seams, [], 5)).toEqual({ lead: null, pieces: [sentence] })
    expect(cutRun(sentence, seams, [9], 5)).toEqual({ lead: null, pieces: [sentence] })
    expect(cutRun(sentence, seams, [1, 2], 7).lead).toBeNull()
    // Pointing past the first piece (rice sits in piece two) is no lead-in.
    expect(cutRun(sentence, seams, [1, 2], 6).lead).toBeNull()
  })

  it('closes a lead line with exactly one colon', () => {
    expect(leadLine('I need to buy')).toBe('I need to buy:')
    expect(leadLine('I need to buy:')).toBe('I need to buy:')
    expect(leadLine('Groceries, ')).toBe('Groceries:')
  })

  it('applySplits carries the lead-in on every piece of the run', () => {
    const out = applySplits([sentence], ['task'], [seams], { 1: [1, 2] }, { 1: 5 }, 'n')
    expect(out.sentences).toEqual(['apples', 'rice', 'coffee'])
    expect(out.leads.every((l) => l?.text === 'I need to buy' && l.group === 'n-1')).toBe(true)
    const none = applySplits([sentence], ['note'], [seams], { 1: [1, 2] }, { 1: 5 })
    expect(none.sentences).toEqual([sentence])
    expect(none.leads).toEqual([null])
  })

  it('files the lead line once with the run nested under it, in each file it reaches', () => {
    const lead = { text: 'I need to buy', group: 'g1' }
    const plan = planFiling(
      ['Call Sam.', 'apples', 'rice', 'coffee', 'a smoothie bar'],
      ['task', 'task', 'task', 'task', 'idea'],
      { time: '08:59', inboxFile: 'murmur/inbox/2026-09-23.md', tasksFile: 'murmur/todo.md', ideasFile: 'murmur/ideas.md' },
      [null, lead, lead, lead, lead]
    )
    expect(plan.tasks).toEqual([
      '- [ ] Call Sam. ([08:59](inbox/2026-09-23.md))',
      '- I need to buy:\n  - [ ] apples ([08:59](inbox/2026-09-23.md))',
      '  - [ ] rice ([08:59](inbox/2026-09-23.md))',
      '  - [ ] coffee ([08:59](inbox/2026-09-23.md))'
    ])
    expect(plan.ideas).toEqual(['- I need to buy:\n  - a smoothie bar ([08:59](inbox/2026-09-23.md))'])
  })

  it('a second run with the same words gets its own lead line', () => {
    const plan = planFiling(
      ['eggs', 'milk'],
      ['task', 'task'],
      { time: '09:00', inboxFile: 'i.md', tasksFile: 't.md', ideasFile: 'd.md' },
      [
        { text: 'Buy', group: 'a' },
        { text: 'Buy', group: 'b' }
      ]
    )
    expect(plan.tasks[1].startsWith('- Buy:\n')).toBe(true)
  })

  it('the chat reply may carry starts; bad values mean no lead-in for that sentence only', () => {
    const leadCounts = [0, 6, 3]
    const v = validateSort(3, '{"1":"note","2":"task","3":"task","starts":{"2":5,"3":9}}', { leadCounts })
    expect(v).toMatchObject({ ok: true, starts: { 2: 5 } })
    const odd = validateSort(3, '{"1":"note","2":"task","3":"task","starts":"five"}', { leadCounts })
    expect(odd).toMatchObject({ ok: true, starts: {} })
    // Without lead words offered, starts is not a reserved key.
    expect(validateSort(1, '{"1":"task","starts":{}}')).toMatchObject({ ok: false, reason: 'extra sentences' })
  })

  it('numbers the lead words for the chat model', () => {
    expect(leadPrompt(['Call Sam.', sentence], [[], seams])).toBe('2: 1 I | 2 need | 3 to | 4 buy | 5 apples | 6 rice')
  })
})

describe('cutAtSeams with fillers between cuts (US-114)', () => {
  it('lets fillers alone between two cuts ride with the next piece', () => {
    const s = 'buy milk, oh well, call Bob'
    expect(cutAtSeams(s, findSeams(s), [1, 2])).toEqual(['buy milk', 'oh well, call Bob'])
  })

  it('returns a sentence with no cut whole, fillers or not', () => {
    expect(cutAtSeams('Okay.', [], [])).toEqual(['Okay.'])
  })

  it('stays fast on a long run of repeated fillers', () => {
    const s = `${'okay, '.repeat(200)}call Bob, and email Ann.`
    const started = Date.now()
    expect(findSeams(s).length).toBeGreaterThan(0)
    expect(findSeams(`${'yeah,  '.repeat(200)}call Bob`)).toEqual([])
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('treats uhm, uhh, and mhm as fillers but not ER, a real word', () => {
    expect(findSeams('Uhm, uhh, mhm, call Bob')).toEqual([])
    const s = 'Stops today: bank, ER, and pharmacy'
    expect(cutAtSeams(s, findSeams(s), [1, 2])).toEqual(['Stops today: bank', 'ER', 'pharmacy'])
  })

  it('leaves pieces with real words where they were cut', () => {
    const s = 'buy milk, walk the dog, call Bob'
    expect(cutAtSeams(s, findSeams(s), [1, 2])).toEqual(['buy milk', 'walk the dog', 'call Bob'])
  })
})

describe('keep: file only the item (US-115)', () => {
  it('offers every word of a prose sentence, none of a list line or a short one', () => {
    expect(keepWords('Oh, and an idea: a rooftop party.')).toEqual(['Oh,', 'and', 'an', 'idea:', 'a', 'rooftop', 'party.'])
    expect(keepWords('- [ ] buy eggs and milk')).toEqual([])
    expect(keepWords('Call Bob.')).toEqual([])
    expect(keepWords(Array.from({ length: 61 }, () => 'word').join(' '))).toEqual([])
  })

  it('numbers the words under their sentence', () => {
    expect(keepPrompt(['Call Bob.', 'Oh, an idea: tacos.'])).toBe('2: 1 Oh, | 2 an | 3 idea: | 4 tacos.')
  })

  it('reads spans inside the words offered and drops the rest', () => {
    expect(readKeepSpans({ '1': [5, 7], '2': [1, 3] }, [7, 4])).toEqual({ 1: [5, 7], 2: [1, 3] })
    // A span that keeps every word is no trim.
    expect(readKeepSpans({ '1': [1, 7] }, [7])).toEqual({})
    // Out of range, backwards, not numbers, or not a pair: that sentence files whole.
    expect(readKeepSpans({ '1': [0, 3], '2': [4, 2], '3': ['1', '2'], '4': [2], '5': [2, 9] }, [7, 7, 7, 7, 7])).toEqual({})
    expect(readKeepSpans({ '9': [1, 2] }, [7])).toEqual({})
    expect(readKeepSpans([1, 2], [7])).toEqual({})
  })

  it('trims a sentence to the kept words, exactly as spoken', () => {
    const s = 'Oh, and an idea: a Times Square takeover for BrambleCat.'
    expect(applyKeep(s, findSeams(s), undefined, undefined, [5, 10])).toEqual({
      sentence: 'a Times Square takeover for BrambleCat.',
      seams: [],
      confirmed: [],
      start: undefined
    })
  })

  it('drops the joining punctuation and the period when the kept words stop short', () => {
    expect(applyKeep('Call the vet, I think.', [], undefined, undefined, [1, 3]).sentence).toBe('Call the vet')
    expect(applyKeep('Buy stamps, etc. you know.', [], undefined, undefined, [1, 3]).sentence).toBe('Buy stamps, etc.')
  })

  it('carries seams, votes, and the lead-in start over to the kept words', () => {
    const s = 'Honestly, tomorrow I need to buy apples, rice, and coffee.'
    const seams = findSeams(s)
    expect(seams).toHaveLength(3)
    const kept = applyKeep(s, seams, [2, 3], 7, [2, 10])
    expect(kept.sentence).toBe('tomorrow I need to buy apples, rice, and coffee.')
    expect(kept.confirmed).toEqual([1, 2])
    expect(kept.start).toBe(6)
    expect(cutRun(kept.sentence, kept.seams, kept.confirmed, kept.start)).toEqual({
      lead: 'tomorrow I need to buy',
      pieces: ['apples', 'rice', 'coffee']
    })
  })

  it('forgets a lead-in that began among the dropped words', () => {
    const s = 'I need to buy apples, rice, and coffee, I think.'
    const kept = applyKeep(s, findSeams(s), [1, 2], 5, [5, 8])
    expect(kept.sentence).toBe('apples, rice, and coffee')
    expect(kept.start).toBeUndefined()
    expect(kept.confirmed).toEqual([1, 2])
  })

  it('never files a span of fillers alone', () => {
    const s = 'Oh, and an idea: a rooftop launch party.'
    expect(applyKeep(s, [], undefined, undefined, [1, 1]).sentence).toBe(s)
    expect(applyKeep(s, [], undefined, undefined, [1, 2]).sentence).toBe(s)
  })

  it('changes nothing for a span outside the words or one that keeps them all', () => {
    const s = 'Oh, call the vet.'
    expect(applyKeep(s, [], undefined, undefined, [0, 4]).sentence).toBe(s)
    expect(applyKeep(s, [], undefined, undefined, [1, 4]).sentence).toBe(s)
    expect(applyKeep(s, [], undefined, undefined, [3, 9]).sentence).toBe(s)
  })

  it('validateSort reads keep only when it was offered', () => {
    const offered = validateSort(1, '{"1":"idea","keep":{"1":[5,10]}}', { keepCounts: [10] })
    expect(offered.ok && offered.keep).toEqual({ 1: [5, 10] })
    // Not offered, the key is an unknown sentence, as for every reserved key.
    expect(validateSort(1, '{"1":"idea","keep":{"1":[5,10]}}')).toEqual({ ok: false, reason: 'extra sentences' })
  })
})

describe('fragments stay with their item (US-181, issue #23)', () => {
  const link = { time: '10:32', inboxFile: 'murmur/inbox/2026-11-04.md', tasksFile: 'murmur/todo.md', ideasFile: 'murmur/ideas.md' }
  const at = '([10:32](inbox/2026-11-04.md))'
  // What a sort files when the model labels every sentence a task and
  // says yes to every cut it is shown: the worst case on a chat
  // connection, where the votes are not trusted.
  const fileAllYes = (text: string, starts: Record<number, number> = {}) => {
    const { sentences, leads } = splitUnits(text)
    const seams = sentences.map(findSeams)
    const votes = Object.fromEntries(
      seams.map((s, i) => [i + 1, s.map((_, j) => j + 1)] as const).filter(([, v]) => v.length > 0)
    )
    const labels = sentences.map((): SortLabel => 'task')
    const split = applySplits(sentences, labels, seams, votes, starts, 'run')
    return planFiling(split.sentences, split.labels, link, split.leads.map((l, i) => l ?? leads[i] ?? null))
  }

  it('files the garage sentence as a lead-in over 1 task, not 3 fragments', () => {
    // Before: "For the garage project" / "remind me that after our
    // current paint tests" / "we will try the sealant to see if it helps".
    const garage = 'For the garage project, remind me that after our current paint tests, we will try the sealant to see if it helps.'
    // The cut after "tests" leaves a clause that "that after" opened and
    // never finished, so it is not even offered.
    expect(findSeams(garage).map((seam) => seamSides(garage, seam).left)).toEqual(['For the garage project'])
    const filed = [
      `- For the garage project:\n  - [ ] remind me that after our current paint tests, we will try the sealant to see if it helps ${at}`
    ]
    expect(fileAllYes(garage).tasks).toEqual(filed)
    // With the topic cut alone, a start inside the topic has nothing
    // else to begin: the topic still leads (review gate 2026-11-21).
    const seams = findSeams(garage)
    const rest = 'remind me that after our current paint tests, we will try the sealant to see if it helps'
    for (const start of [2, 3, 4]) expect(cutRun(garage, seams, [1], start)).toEqual({ lead: 'For the garage project', pieces: [rest] })
  })

  it('keeps "Otherwise," with its clause, and files a lone "Otherwise." nowhere', () => {
    // Before: "otherwise" and "they will have to do it on their own" as 2 tasks.
    expect(fileAllYes('Next week we need the quotes. Otherwise, they will have to do it on their own.').tasks).toEqual([
      `- [ ] Next week we need the quotes. ${at}`,
      `- [ ] Otherwise, they will have to do it on their own. ${at}`
    ])
    // Said in 1 breath, the consequence never leaves its sentence.
    expect(fileAllYes('Next week we need the quotes, otherwise they will have to do it on their own.').tasks).toEqual([
      `- [ ] Next week we need the quotes, otherwise they will have to do it on their own. ${at}`
    ])
    const lone = fileAllYes('Next week we need the quotes. Otherwise.')
    expect(lone.tasks).toEqual([`- [ ] Next week we need the quotes. ${at}`])
    expect(lone.notes).toEqual(['Otherwise.'])
  })

  it('never files a lone "Oh." spoken as its own sentence; it stays in the inbox', () => {
    // Before: "- [ ] Oh." in todo.md.
    const plan = fileAllYes('Oh. Call the vet.')
    expect(plan.tasks).toEqual([`- [ ] Call the vet. ${at}`])
    expect(plan.notes).toEqual(['Oh.'])
    for (const lone of ['Oh\u2026', 'Oh \u2014', 'Right.', 'Basically.', 'So, anyway.', '- Oh', '...']) {
      expect(planFiling([lone], ['idea'], link).ideas).toEqual([])
    }
  })

  it('never files "Oh:" as a lead-in; the filler rides with the first item', () => {
    // Before: "- Oh:" over "buy milk" and "call Bob".
    const s = 'Oh, buy milk, and call Bob.'
    expect(leadWords(s, findSeams(s))).toEqual(['Oh', 'buy', 'milk'])
    expect(fileAllYes(s, { 1: 2 }).tasks).toEqual([`- [ ] Oh, buy milk ${at}`, `- [ ] call Bob ${at}`])
    expect(cutRun(s, findSeams(s), [1], 2)).toEqual({ lead: null, pieces: ['Oh, buy milk', 'call Bob'] })
    // A list heading of fillers alone files its lines flat.
    expect(planFiling(['eggs'], ['task'], link, [{ text: 'So:', group: 'heading-0' }]).tasks).toEqual([`- [ ] eggs ${at}`])
  })

  it('treats otherwise, basically, and right as fillers only when a side is nothing else', () => {
    expect(findSeams('Right, call Bob')).toEqual([])
    expect(findSeams('Basically, we need quotes')).toEqual([])
    expect(findSeams('Okay\u2026 right \u2014 so, call Bob')).toEqual([])
    const s = 'write the right address, and call Bob'
    expect(cutAtSeams(s, findSeams(s), [1])).toEqual(['write the right address', 'call Bob'])
    expect(isItem('turn right')).toBe(true)
    expect(isItem('or otherwise')).toBe(true)
    expect(isItem('Right.')).toBe(false)
  })

  it('files a task in any script', () => {
    const plan = planFiling(['Позвонить Бобу.', '牛乳を買う。'], ['task', 'idea'], link)
    expect(plan.tasks).toHaveLength(1)
    expect(plan.ideas).toHaveLength(1)
  })

  it('never cuts a clause opened and not finished away from the rest', () => {
    const whole = (x: string, start?: number) => {
      const seams = findSeams(x)
      const run = cutRun(x, seams, seams.map((_, j) => j + 1), start)
      return [...(run.lead ? [`${run.lead}:`] : []), ...run.pieces]
    }
    // Not even offered: a that clause short of its verb, or a right side
    // that only hangs off the left after a bare comma.
    expect(findSeams('remind me that, after the tests, we try the sealant').map((seam) => seamSides('remind me that, after the tests, we try the sealant', seam).left)).toEqual([
      'remind me that, after the tests'
    ])
    expect(findSeams('Call Bob, because he asked.')).toEqual([])
    expect(findSeams('Move the couch, so that the rug fits.')).toEqual([])
    // Offered, but a yes after a fronted clause is not honored.
    expect(whole('If it rains, cancel the picnic.')).toEqual(['If it rains, cancel the picnic.'])
    expect(whole('remind me that, after the tests, we try the sealant')).toEqual(['remind me that, after the tests, we try the sealant'])
    expect(whole('After lunch, call Bob, and email Ann.')).toEqual(['After lunch, call Bob', 'email Ann'])
    expect(whole('When you get home, call me, and feed the cat.')).toEqual(['When you get home, call me', 'feed the cat'])
    expect(whole('Call Bob, and if he answers, ask about Friday.')).toEqual(['Call Bob', 'if he answers, ask about Friday'])
    const sam = 'Tell Sam that when the paint dries, we seal it, and order more brushes.'
    expect(findSeams(sam).map((seam) => seamSides(sam, seam).left)).toEqual(['Tell Sam that when the paint dries, we seal it'])
  })

  it('keeps a run that opens with a time or a condition and holds its own verb, as main did (review gate 2026-11-21)', () => {
    const filed = (x: string, start?: number) => {
      const seams = findSeams(x)
      const run = cutRun(x, seams, seams.map((_, j) => j + 1), start)
      return [...(run.lead ? [`${run.lead}:`] : []), ...run.pieces]
    }
    expect(filed('Before the party buy chips, salsa, and plates.', 5)).toEqual(['Before the party buy:', 'chips', 'salsa', 'plates'])
    expect(filed('Before the party buy chips, salsa, and plates.')).toEqual(['Before the party buy chips', 'salsa', 'plates'])
    expect(filed('After work buy milk, eggs, and bread.', 4)).toEqual(['After work buy:', 'milk', 'eggs', 'bread'])
    expect(filed('After work buy milk, eggs, and bread.')).toEqual(['After work buy milk', 'eggs', 'bread'])
    expect(filed('While you are out get stamps, envelopes, and tape.', 6)).toEqual(['While you are out get:', 'stamps', 'envelopes', 'tape'])
    expect(filed('While you are out get stamps, envelopes, and tape.')).toEqual(['While you are out get stamps', 'envelopes', 'tape'])
    expect(filed('If you can pick up milk, eggs, and bread.', 6)).toEqual(['If you can pick up:', 'milk', 'eggs', 'bread'])
    expect(filed('If you can pick up milk, eggs, and bread.')).toEqual(['If you can pick up milk', 'eggs', 'bread'])
    expect(filed('If you can pick up milk, eggs, and bread.', 7)).toEqual(['If you can pick up milk', 'eggs', 'bread'])
  })

  it('keeps a reason set off by commas with its task, and the next task its own (review gate 2026-11-21)', () => {
    const filed = (x: string) => {
      const seams = findSeams(x)
      return cutRun(x, seams, seams.map((_, j) => j + 1)).pieces
    }
    expect(filed('Call Bob, since he asked, and email Ann.')).toEqual(['Call Bob, since he asked', 'email Ann'])
    expect(filed('Book the flight, because the prices go up, and pack.')).toEqual(['Book the flight, because the prices go up', 'pack'])
    expect(filed('Mow the lawn, unless it rains, and rake leaves.')).toEqual(['Mow the lawn, unless it rains', 'rake leaves'])
    // A condition that opens the next step still governs it.
    expect(filed('Call Bob, if he answers, ask about Friday, and email Ann.')).toEqual(['Call Bob, if he answers, ask about Friday', 'email Ann'])
  })

  it('carries a clause through a bare and to its comma (review gate 2026-11-21)', () => {
    const filed = (x: string) => {
      const seams = findSeams(x)
      const run = cutRun(x, seams, seams.map((_, j) => j + 1))
      return [...(run.lead ? [`${run.lead}:`] : []), ...run.pieces]
    }
    expect(filed('If you see Ann and Bob, say hi.')).toEqual(['If you see Ann and Bob, say hi.'])
    expect(filed('If it rains and the wind blows, cancel the picnic.')).toEqual(['If it rains and the wind blows, cancel the picnic.'])
    expect(filed('For the garage project, remind me that after the paint tests and the primer, we will try the sealant.')).toEqual([
      'For the garage project:',
      'remind me that after the paint tests and the primer, we will try the sealant'
    ])
  })

  it('trims fillers a comma left hanging at the end of a piece', () => {
    const s = 'Buy milk, so, call Bob.'
    expect(cutAtSeams(s, findSeams(s), [1])).toEqual(['Buy milk', 'call Bob.'])
    // A filler alone between cuts still rides with the next piece (US-114);
    // one hanging at a piece's end goes.
    const okay = 'Call Bob, okay, and email Ann, right.'
    expect(cutAtSeams(okay, findSeams(okay), findSeams(okay).map((_, j) => j + 1))).toEqual(['Call Bob', 'okay, and email Ann'])
    // No comma, no trim: the well is part of the item, and a sentence left whole keeps every word.
    const well = 'dig the well, and fix the pump'
    expect(cutAtSeams(well, findSeams(well), [1])).toEqual(['dig the well', 'fix the pump'])
    expect(cutAtSeams('Call Bob, okay.', [], [])).toEqual(['Call Bob, okay.'])
  })

  it('still offers cuts between finished steps, whatever words they hold', () => {
    const sides = (s: string) => findSeams(s).map((seam) => seamSides(s, seam))
    expect(sides('call Bob when you get home, and email Ann')).toEqual([{ left: 'call Bob when you get home', right: 'email Ann' }])
    expect(sides('Buy that, and call Bob.')).toEqual([{ left: 'Buy that', right: 'call Bob.' }])
    expect(sides('Call Bob once, and email Ann.')).toHaveLength(1)
    expect(sides('Wait a while, then call Bob.')).toHaveLength(1)
    expect(sides('Move the couch so that the rug fits, and vacuum.')).toHaveLength(1)
    expect(sides('Call Bob because he asked, and email Ann.')).toHaveLength(1)
  })

  it('takes a topic lead as the lead-in, and only a short one cut at a bare comma', () => {
    const party = 'For the party, I need to buy chips, salsa, and plates.'
    const seams = findSeams(party)
    expect(cutRun(party, seams, [1, 2, 3], 8)).toEqual({ lead: 'For the party, I need to buy', pieces: ['chips', 'salsa', 'plates'] })
    expect(cutRun(party, seams, [1, 2, 3])).toEqual({ lead: 'For the party', pieces: ['I need to buy chips', 'salsa', 'plates'] })
    const site = 'About the website, update the pricing page.'
    expect(cutRun(site, findSeams(site), [1])).toEqual({ lead: 'About the website', pieces: ['update the pricing page'] })
    const so = 'So, for the party, buy chips, and plates.'
    expect(cutRun(so, findSeams(so), [1, 2])).toEqual({ lead: 'So, for the party', pieces: ['buy chips', 'plates'] })
    // Not topic leads: no opener, a connector cut, or too many words.
    const plain = 'Buy milk, call Bob.'
    expect(cutRun(plain, findSeams(plain), [1])).toEqual({ lead: null, pieces: ['Buy milk', 'call Bob'] })
    const joined = 'For the party and the picnic, buy chips'
    expect(cutRun(joined, findSeams(joined), [1]).lead).toBeNull()
    const long = 'For the people who came to the party, send a note, and post photos.'
    expect(cutRun(long, findSeams(long), [1, 2]).lead).toBeNull()
    // A topic cut the model did not confirm leaves the sentence whole.
    const garage = 'For the garage project, buy sealant.'
    expect(cutRun(garage, findSeams(garage), [])).toEqual({ lead: null, pieces: [garage] })
  })

  it('cuts ordinary runs that open with for or on exactly as before', () => {
    const all = (x: string, start?: number) => {
      const seams = findSeams(x)
      return cutRun(x, seams, seams.map((_, j) => j + 1), start)
    }
    // A verb or a subject after the opener means no topic, with a start or without.
    expect(all('For dinner get chicken, rice, and beans.', 4)).toEqual({ lead: 'For dinner get', pieces: ['chicken', 'rice', 'beans'] })
    expect(all('For dinner get chicken, rice, and beans.')).toEqual({ lead: null, pieces: ['For dinner get chicken', 'rice', 'beans'] })
    expect(all('On Monday call Bob, email Ann, and book the flight.', 3)).toEqual({
      lead: 'On Monday',
      pieces: ['call Bob', 'email Ann', 'book the flight']
    })
    expect(all('On Monday call Bob, email Ann, and book the flight.').lead).toBeNull()
    expect(all('For the party I need chips, salsa, and plates.', 6)).toEqual({ lead: 'For the party I need', pieces: ['chips', 'salsa', 'plates'] })
    expect(all('For the party I need chips, salsa, and plates.').lead).toBeNull()
    // A start inside a topic-shaped lead says the first item begins there.
    expect(all('For the kids snacks, juice, and fruit.', 4)).toEqual({ lead: 'For the kids', pieces: ['snacks', 'juice', 'fruit'] })
    expect(all('I need to buy apples, rice, and coffee.', 5)).toEqual({ lead: 'I need to buy', pieces: ['apples', 'rice', 'coffee'] })
    expect(all('We need toner, paper, and ink.', 3)).toEqual({ lead: 'We need', pieces: ['toner', 'paper', 'ink'] })
  })

  it('cuts a long spoken list into every item: there is no cap', () => {
    const eleven = 'Buy eggs, milk, bread, butter, cheese, apples, rice, coffee, tea, salt, and jam.'
    const seams = findSeams(eleven)
    expect(cutRun(eleven, seams, seams.map((_, j) => j + 1)).pieces).toEqual([
      'Buy eggs', 'milk', 'bread', 'butter', 'cheese', 'apples', 'rice', 'coffee', 'tea', 'salt', 'jam'
    ])
  })

  it('stays fast on long runs of clause words and fillers', () => {
    const started = Date.now()
    findSeams(`remind me ${'that after '.repeat(500)}the tests, we try, and ${'me that '.repeat(500)}x`)
    findSeams(`${'if when because '.repeat(400)}, call Bob, ${'so '.repeat(400)}`)
    findSeams(`${'tell Sam that '.repeat(500)}, call Bob`)
    const topic = `${'so, '.repeat(400)}for the party, buy chips, and plates.`
    cutRun(topic, findSeams(topic), [1, 2])
    expect(isItem(`${'okay \u2026 '.repeat(400)}`)).toBe(false)
    const filler = `buy milk${', so'.repeat(400)}, and call Bob`
    cutAtSeams(filler, findSeams(filler), findSeams(filler).map((_, j) => j + 1))
    // Linear code does all of this in a few milliseconds; a backtracking
    // pattern takes seconds to minutes, so the margin is wide on purpose.
    expect(Date.now() - started).toBeLessThan(3000)
  })
})
