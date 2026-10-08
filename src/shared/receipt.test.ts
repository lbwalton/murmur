// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  type LastNote,
  RECEIPT_LINE_MAX,
  parseLastNote,
  pillPlace,
  placeName,
  receiptLine,
  receiptTarget,
  receiptTitle,
  receiptWhere,
  revealLabel
} from './receipt'

const inbox = { kind: 'inbox' as const, file: '/v/murmur/inbox/2026-10-02.md', relative: 'murmur/inbox/2026-10-02.md' }
const tasks = { kind: 'tasks' as const, file: '/v/murmur/todo.md', relative: 'murmur/todo.md' }
const ideas = { kind: 'ideas' as const, file: '/v/murmur/ideas.md', relative: 'murmur/ideas.md' }
const note = (over: Partial<LastNote> = {}): LastNote => ({
  at: 1_790_000_000_000,
  line: 'Call the dentist.',
  location: 'folder',
  inbox,
  sorted: [],
  ...over
})

describe('receiptLine', () => {
  it('takes the first line with words, without markdown leads', () => {
    expect(receiptLine('\n\n- [ ] Call the dentist\n- Email Bob')).toBe('Call the dentist')
    expect(receiptLine('## Plans\nmore')).toBe('Plans')
    expect(receiptLine('1. first\n2. second')).toBe('first')
    expect(receiptLine('Groceries:\n- milk')).toBe('Groceries:')
    expect(receiptLine('a   spaced\tline')).toBe('a spaced line')
  })

  it('cuts a long line near 80 characters at a word', () => {
    const long = 'Call the dentist about moving Tuesday to Thursday, and ask about the night guard while you are there.'
    const cut = receiptLine(long)
    expect(cut.length).toBeLessThanOrEqual(RECEIPT_LINE_MAX + 1)
    expect(cut.endsWith('…')).toBe(true)
    expect(long.startsWith(cut.slice(0, -1))).toBe(true)
    expect(cut).toBe('Call the dentist about moving Tuesday to Thursday, and ask about the night guard…')
  })

  it('cuts mid-word only when there is no space near the end', () => {
    const cut = receiptLine('x'.repeat(120))
    expect(cut).toBe(`${'x'.repeat(RECEIPT_LINE_MAX)}…`)
  })

  it('says nothing for an empty note', () => {
    expect(receiptLine('  \n - \n')).toBe('')
  })
})

describe('placeName and pillPlace', () => {
  it('names a dated file with its folder and anything else by its name', () => {
    expect(placeName('murmur/inbox/2026-10-02.md')).toBe('inbox/2026-10-02.md')
    expect(placeName('Daily/2026-10-02.md')).toBe('Daily/2026-10-02.md')
    expect(placeName('murmur/todo.md')).toBe('todo.md')
    expect(placeName('2026-10-02.md')).toBe('2026-10-02.md')
    expect(placeName('Notes\\journal.md')).toBe('journal.md')
  })

  it('gives the pill one short word', () => {
    expect(pillPlace('murmur/inbox/2026-10-02.md', 'folder')).toBe('inbox')
    expect(pillPlace('Notes/journal.md', 'folder')).toBe('journal')
    expect(pillPlace('murmur/inbox/2026-10-02.md', 'fallback')).toBe('murmur')
    expect(pillPlace('Notes/quarterly-planning.md', 'folder')).toBe('quarterly…')
    expect(pillPlace('Notes/quarterly-planning.md', 'folder').length).toBe(10)
  })
})

describe('receiptTitle and receiptTarget', () => {
  it('names the inbox until a sort files somewhere', () => {
    expect(receiptTitle(note())).toBe('Noted to inbox/2026-10-02.md')
    expect(receiptTarget(note())).toBe(inbox)
  })

  it("names murmur's data folder after a redirect", () => {
    expect(receiptTitle(note({ location: 'fallback' }))).toBe("Noted to murmur's data folder")
  })

  it('names the first destination and how many more', () => {
    expect(receiptTitle(note({ sorted: [tasks] }))).toBe('Sorted into todo.md')
    expect(receiptTitle(note({ sorted: [tasks, ideas] }))).toBe('Sorted into todo.md and 1 more')
    expect(receiptTarget(note({ sorted: [tasks, ideas] }))).toBe(tasks)
    expect(receiptTarget(note({ sorted: [ideas] }))).toBe(ideas)
  })

  it('says where on Home in words', () => {
    expect(receiptWhere(note())).toBe('inbox/2026-10-02.md')
    expect(receiptWhere(note({ sorted: [tasks, ideas] }))).toBe('inbox/2026-10-02.md, filed to todo.md and ideas.md')
    expect(receiptWhere(note({ location: 'fallback' }))).toBe("murmur's data folder, inbox/2026-10-02.md")
  })

  it('names the file manager per platform', () => {
    expect(revealLabel('darwin')).toBe('Show in Finder')
    expect(revealLabel('win32')).toBe('Open folder')
  })
})

describe('parseLastNote', () => {
  it('reads back what was written', () => {
    const n = note({ sorted: [tasks, ideas] })
    expect(parseLastNote(JSON.parse(JSON.stringify(n)))).toEqual(n)
  })

  it('refuses anything malformed', () => {
    expect(parseLastNote(null)).toBeNull()
    expect(parseLastNote('x')).toBeNull()
    expect(parseLastNote({ ...note(), at: 'soon' })).toBeNull()
    expect(parseLastNote({ ...note(), location: 'cloud' })).toBeNull()
    expect(parseLastNote({ ...note(), inbox: tasks })).toBeNull()
    expect(parseLastNote({ ...note(), inbox: { ...inbox, file: '' } })).toBeNull()
    expect(parseLastNote({ ...note(), sorted: [inbox] })).toBeNull()
    expect(parseLastNote({ ...note(), sorted: [{ kind: 'tasks', file: 3 }] })).toBeNull()
    expect(parseLastNote({ ...note(), sorted: 'todo.md' })).toBeNull()
  })
})
