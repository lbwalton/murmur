// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  alreadyPast,
  dueReminders,
  markFired,
  openItems,
  parseListItems,
  parseTodo,
  reminderBody,
  resettleFired,
  tickLine
} from './todo'

const FILE = `# My tasks

## 2026-09-20 dentist and travel
- [ ] Call the dentist about Thursday. ([10:32](inbox/2026-09-20.md))
- [x] Book the flight. ([10:32](inbox/2026-09-20.md))

## 2026-09-19
* [ ] Renew the domain.
+ [ ] Water the plants.
- [X] Pay the invoice.
just a line
- not a checkbox
`

describe('parseTodo', () => {
  it('reads every bullet style with its state and heading, link stripped', () => {
    expect(parseTodo(FILE)).toEqual([
      { text: 'Call the dentist about Thursday.', done: false, group: '2026-09-20 dentist and travel' },
      { text: 'Book the flight.', done: true, group: '2026-09-20 dentist and travel' },
      { text: 'Renew the domain.', done: false, group: '2026-09-19' },
      { text: 'Water the plants.', done: false, group: '2026-09-19' },
      { text: 'Pay the invoice.', done: true, group: '2026-09-19' }
    ])
  })

  it('reads a file written on Windows', () => {
    const crlf = '## 2026-09-20\r\n- [ ] Call Bob.\r\n- [x] Done thing.\r\n'
    expect(parseTodo(crlf)).toEqual([
      { text: 'Call Bob.', done: false, group: '2026-09-20' },
      { text: 'Done thing.', done: true, group: '2026-09-20' }
    ])
  })

  it('counts a tick in either case as done, and nothing else as a task', () => {
    expect(openItems(parseTodo(FILE)).map((i) => i.text)).toEqual([
      'Call the dentist about Thursday.',
      'Renew the domain.',
      'Water the plants.'
    ])
    expect(parseTodo('')).toEqual([])
    expect(parseTodo('- [ ]no space after the box')).toEqual([])
  })

  it('ignores a checkbox inside a code fence and an empty box', () => {
    const fenced = '- [ ] real task\n```\n- [ ] sample in a code block\n```\n- [ ]   \n~~~\n- [ ] another sample\n~~~\n'
    expect(parseTodo(fenced).map((i) => i.text)).toEqual(['real task'])
  })

  it('keeps an item that carries no link', () => {
    expect(parseTodo('- [ ] plain item')).toEqual([{ text: 'plain item', done: false, group: '' }])
  })
})

describe('reminderBody', () => {
  it('leads with the count and fits what it can', () => {
    expect(reminderBody(parseTodo(FILE))).toBe(
      '3 open tasks: Call the dentist about Thursday.; Renew the domain.; Water the plants.'
    )
  })

  it('says nothing when nothing is open, so nothing fires', () => {
    expect(reminderBody(parseTodo('- [x] done\n'))).toBe('')
    expect(reminderBody([])).toBe('')
  })

  it('uses the singular for one task', () => {
    expect(reminderBody(parseTodo('- [ ] one thing\n'))).toBe('1 open task: one thing')
  })

  it('previews as much of a long task as fits instead of dropping it', () => {
    const body = reminderBody(parseTodo(`- [ ] ${'x'.repeat(300)}\n`))
    expect(body.startsWith('1 open task: xxx')).toBe(true)
    expect(body.endsWith('…')).toBe(true)
    expect(body.length).toBeLessThanOrEqual(180)
  })

  it('never exceeds the budget with many items', () => {
    const many = Array.from({ length: 20 }, (_, i) => `- [ ] task number ${i}`).join('\n')
    expect(reminderBody(parseTodo(many)).length).toBeLessThanOrEqual(180)
  })
})

describe('dueReminders', () => {
  const at = (h: number, m: number): number => new Date(2026, 8, 20, h, m).getTime()
  const today = '2026-09-20'
  const times = ['08:30', '13:00', '17:30']

  it('reports each time once a day, keyed by its slot', () => {
    expect(dueReminders(at(8, 0), times, {})).toEqual([])
    expect(dueReminders(at(8, 30), times, {})).toEqual([{ index: 0, time: '08:30' }])
    expect(dueReminders(at(13, 1), times, { '0': today })).toEqual([{ index: 1, time: '13:00' }])
    expect(dueReminders(at(13, 1), times, { '0': today, '1': today })).toEqual([])
  })

  it('hands back everything missed at once so the caller can settle them together', () => {
    expect(dueReminders(at(19, 0), times, {}).map((d) => d.time)).toEqual(['08:30', '13:00', '17:30'])
  })

  it('does not re-fire a slot whose time the user edited today', () => {
    // Slot 0 already fired as 08:30; renaming it to 09:00 must stay quiet.
    expect(dueReminders(at(15, 0), ['09:00', '13:00'], { '0': today, '1': today })).toEqual([])
  })

  it('ignores empty and malformed times', () => {
    expect(dueReminders(at(23, 0), ['', '  ', 'nope', '25:00'], {})).toEqual([])
    expect(dueReminders(at(23, 0), ['', '09:00'], {})).toEqual([{ index: 1, time: '09:00' }])
  })

  it('starts a new day fresh', () => {
    expect(dueReminders(at(8, 45), ['08:30'], { '0': '2026-09-19' })).toEqual([{ index: 0, time: '08:30' }])
  })
})

describe('markFired and alreadyPast', () => {
  const now = new Date(2026, 8, 20, 13, 5).getTime()

  it('records the slots given and forgets days that have passed', () => {
    expect(markFired(now, [0], { '1': '2026-09-19' })).toEqual({ '0': '2026-09-20' })
    expect(markFired(now, [0, 1], {})).toEqual({ '0': '2026-09-20', '1': '2026-09-20' })
  })

  it('names the times already past, so switching on mid-day stays quiet', () => {
    expect(alreadyPast(now, ['08:30', '13:00', '17:30'])).toEqual([0, 1])
    expect(alreadyPast(new Date(2026, 8, 20, 7, 0).getTime(), ['08:30', '13:00'])).toEqual([])
  })
})

describe('resettleFired', () => {
  const at = (h: number, m: number): number => new Date(2026, 8, 20, h, m).getTime()
  const today = '2026-09-20'

  it('suppresses times already past and frees times still ahead', () => {
    expect(resettleFired(at(13, 5), ['08:30', '13:00', '17:30'])).toEqual({ '0': today, '1': today })
  })

  it('lets a slot that already ran today fire again at a time set ahead', () => {
    // 23:16, slot 0 ran this morning, now edited to 23:20.
    const settled = resettleFired(at(23, 16), ['23:20', '13:00'])
    expect(settled).toEqual({ '1': today })
    expect(dueReminders(at(23, 20), ['23:20', '13:00'], settled)).toEqual([{ index: 0, time: '23:20' }])
  })

  it('keeps an edit to a time already past from firing on the spot', () => {
    const settled = resettleFired(at(15, 0), ['09:00'])
    expect(dueReminders(at(15, 1), ['09:00'], settled)).toEqual([])
  })

  it('ignores cleared and malformed slots', () => {
    expect(resettleFired(at(23, 0), ['', 'nope', '08:00'])).toEqual({ '2': today })
  })
})


describe('parseListItems', () => {
  it('reads checkboxes and plain bullets alike, keeping which is which', () => {
    const ideas = '## 2026-09-20\n- A thought. ([10:32](inbox/x.md))\n- [ ] a box\n* another\n'
    expect(parseListItems(ideas)).toEqual([
      { text: 'A thought.', done: false, group: '2026-09-20', checkbox: false },
      { text: 'a box', done: false, group: '2026-09-20', checkbox: true },
      { text: 'another', done: false, group: '2026-09-20', checkbox: false }
    ])
    expect(parseListItems('```\n- fenced\n```\n- real')).toEqual([{ text: 'real', done: false, group: '', checkbox: false }])
    // A bare empty box is a placeholder, never an item reading "[ ]".
    expect(parseListItems('- [ ]\n- [ ] \n- [x]')).toEqual([])
  })
})

describe('tickLine', () => {
  const file = '# Tasks\r\n\r\n## 2026-09-20\r\n- [ ] Call Bob. ([10:32](inbox/x.md))\r\n- [x] Done thing.\r\n- [ ] Renew the domain.\r\n\r\n'

  it('changes exactly one box and nothing else, line endings included', () => {
    const result = tickLine(file, 2)
    expect(result.ok).toBe(true)
    const text = result.ok ? result.text : ''
    expect(text).toBe(file.replace('- [ ] Renew the domain.', '- [x] Renew the domain.'))
    expect(text.length).toBe(file.length)
    // Only one byte differs.
    let diffs = 0
    for (let i = 0; i < file.length; i++) if (file[i] !== text[i]) diffs += 1
    expect(diffs).toBe(1)
  })

  it('counts boxes the way parseTodo does, so the nth matches the list the user saw', () => {
    expect(parseTodo(file)[2].text).toBe('Renew the domain.')
    const result = tickLine(file, 0)
    expect(result.ok && result.text.includes('- [x] Call Bob.')).toBe(true)
  })

  it('refuses a box that is already ticked or that does not exist', () => {
    expect(tickLine(file, 1)).toEqual({ ok: false, reason: 'already done' })
    expect(tickLine(file, 9)).toEqual({ ok: false, reason: 'not found' })
    expect(tickLine('', 0)).toEqual({ ok: false, reason: 'not found' })
  })

  it('skips fenced and empty boxes when counting', () => {
    const tricky = '```\n- [ ] sample\n```\n- [ ]   \n- [ ] first real\n'
    const result = tickLine(tricky, 0)
    expect(result.ok && result.text).toBe('```\n- [ ] sample\n```\n- [ ]   \n- [x] first real\n')
  })
})

describe('nested runs under a lead line (US-062)', () => {
  const file = [
    '## 2026-09-23',
    '- [ ] Call Sam. ([08:59](inbox/2026-09-23.md))',
    '- I need to buy:',
    '  - [ ] apples ([08:59](inbox/2026-09-23.md))',
    '  - [x] rice ([08:59](inbox/2026-09-23.md))',
    '- A plain idea ending in a colon:',
    '- Maybe try:',
    '  - a smoothie bar ([08:59](inbox/2026-09-23.md))'
  ].join('\n')

  it('reads the nested items and never the lead line', () => {
    expect(parseListItems(file).map((i) => i.text)).toEqual([
      'Call Sam.',
      'apples',
      'rice',
      'A plain idea ending in a colon:',
      'a smoothie bar'
    ])
  })

  it('reminders count nested checkboxes and nothing else', () => {
    expect(openItems(parseTodo(file)).map((i) => i.text)).toEqual(['Call Sam.', 'apples'])
  })

  it('tick counts a nested box like any other', () => {
    const ticked = tickLine(file, 1)
    expect(ticked.ok && ticked.text.includes('  - [x] apples')).toBe(true)
  })
})
