// SPDX-License-Identifier: GPL-3.0-only
// Desktop's pure note rules over a set of inputs must give the answers in
// shared/notes-vectors.json, which MurmurCore runs too, so the iPhone splits,
// files, ticks, and receipts notes as desktop does (ios/prd.json IOS-023).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { appendSeparator, DEFAULT_NOTE_ENTRY_TEMPLATE, renderNoteEntry, resolveNotePath } from './notes'
import { pillPlace, placeName, receiptLine } from './receipt'
import { cutRun, findSeams, leadWords, seamSides, splitUnits, validateSort } from './sorter'
import { parseListItems, parseTodo, reminderBody, tickLine } from './todo'

const texts = [
  'Call the dentist. Email Bob.',
  'Call the dentist.  Email Bob!   Water the plants?',
  'He said "go now." Then he left.',
  'See (the attached.) Then reply.',
  'Call Dr. Smith. Meet Mr. and Mrs. Lee at St. Mark’s. Bring snacks, etc. and drinks.',
  'Compare apples vs. oranges. Use e.g. a knife. That is, i.e. sharp.',
  'For the trip:\n- passport\n- [ ] charger\n1. tickets\nBook the hotel.',
  'Shopping list:\n\n- milk\nNot a heading: really.\n- eggs',
  'Line one\nLine two.\n\n   \nLine three',
  'Wow!! Really?! Yes.',
  'Ends with a quote: “done.” Next one.',
  'Price is 3.50 dollars. Done.',
  'Café crème. 🍎 apples. Zoë.',
  ''
]

const sentences = [
  'Buy milk, eggs, and bread.',
  'Buy milk and eggs and then bread, and also cheese; then call mom.',
  'I need to buy apples, rice, and coffee.',
  'For the party, I need chips, salsa, and lemons.',
  'Tell Sam "bring chips, salsa, and cups" today.',
  'Get (red, blue) paint, and brushes.',
  'And then, and also.',
  'Pay 1,000 dollars, then rest.',
  '- [ ] milk, eggs, and bread',
  'Buy café crème, 🍎 apples, and pears.',
  'Call Mom AND Dad, Then Rest.',
  'One, two',
  'Pack the tent, stove, etc.',
  'Wait... and then go, and then stop...'
]

const cuts: Array<{ sentence: string; confirmed: number[]; start?: number }> = [
  { sentence: 'Buy milk, eggs, and bread.', confirmed: [1, 2] },
  { sentence: 'Buy milk, eggs, and bread.', confirmed: [2] },
  { sentence: 'Buy milk, eggs, and bread.', confirmed: [3] },
  { sentence: 'Buy milk, eggs, and bread.', confirmed: [2, 1, 2] },
  { sentence: 'I need to buy apples, rice, and coffee.', confirmed: [1, 2], start: 5 },
  { sentence: 'I need to buy apples, rice, and coffee.', confirmed: [1, 2], start: 1 },
  { sentence: 'I need to buy apples, rice, and coffee.', confirmed: [1, 2], start: 7 },
  { sentence: 'I need to buy apples, rice, and coffee.', confirmed: [1, 2], start: 6 },
  { sentence: 'For the party, I need chips, salsa, and lemons.', confirmed: [2, 3], start: 5 },
  { sentence: 'Pack the tent, stove, etc.', confirmed: [1, 2] },
  { sentence: 'Wait... and then go, and then stop...', confirmed: [1, 2] },
  { sentence: 'Buy café crème, 🍎 apples, and pears.', confirmed: [1, 2], start: 2 },
  { sentence: 'Buy milk and bread.', confirmed: [] }
]

const replies: Array<{ count: number; candidate: string; opts: { seamCounts?: number[]; items?: number; leadCounts?: number[] } }> = [
  { count: 2, candidate: '{"1":"task","2":"note"}', opts: {} },
  { count: 2, candidate: 'Here you go:\n```json\n{"1": "Idea", "2": " NOTE "}\n```\nHope that helps!', opts: {} },
  { count: 2, candidate: '{"1":"task","2":"note","1":"idea"}', opts: {} },
  { count: 2, candidate: '{"1":"task"} and {"2":"note"}', opts: {} },
  { count: 1, candidate: '{"1":"task","topic":"Errands"}', opts: {} },
  { count: 1, candidate: '{"1":"task","01":"task"}', opts: {} },
  { count: 1, candidate: '{"1":5}', opts: {} },
  { count: 1, candidate: '{"1":null}', opts: {} },
  { count: 1, candidate: 'null', opts: {} },
  { count: 1, candidate: '"task"', opts: {} },
  { count: 1, candidate: '{}', opts: {} },
  { count: 0, candidate: '{}', opts: {} },
  { count: 2, candidate: '{"1":"task","2":"task","seams":{"1":[2,1,2],"2":[1]}}', opts: { seamCounts: [2, 0] } },
  { count: 2, candidate: '{"1":"task","2":"task","seams":{"1":[1.5],"2":[1]," 1":[1]}}', opts: { seamCounts: [2, 1] } },
  { count: 1, candidate: '{"1":"task","seams":{"1":[3]}}', opts: { seamCounts: [2] } },
  { count: 1, candidate: '{"1":"task","seams":{"1.0":[1],"0x1":[2]}}', opts: { seamCounts: [2] } },
  { count: 1, candidate: '{"1":"task","seams":[1]}', opts: { seamCounts: [2] } },
  { count: 1, candidate: '{"1":"task","seams":{"1":[]}}', opts: { seamCounts: [2] } },
  { count: 1, candidate: '{"1":"task","seams":{"1":["1"]}}', opts: { seamCounts: [2] } },
  { count: 1, candidate: '{"1":"task","seams":{"1":[1]}}', opts: {} },
  { count: 2, candidate: '{"1":"task","2":"idea","starts":{"1":"5","2":3}}', opts: { leadCounts: [6, 4] } },
  { count: 2, candidate: '{"1":"task","2":"idea","starts":{"1":1,"2":5}}', opts: { leadCounts: [6, 4] } },
  { count: 1, candidate: '{"1":"task","starts":{"1":" 4 "}}', opts: { leadCounts: [6] } },
  { count: 1, candidate: '{"1":"task","starts":{"1":"4.0"}}', opts: { leadCounts: [6] } },
  { count: 1, candidate: '{"1":"task","starts":{"1":4.5}}', opts: { leadCounts: [6] } },
  { count: 1, candidate: '{"1":"task","starts":{"1":2}}', opts: { leadCounts: [0] } },
  { count: 2, candidate: '{"1":"task","2":"note","relations":{"1":[1,2],"2":[2,1]}}', opts: { items: 2 } },
  { count: 2, candidate: '{"1":"task","2":"note","relations":{"1":[3,1],"2":[1,3]}}', opts: { items: 2 } },
  { count: 2, candidate: '{"1":"task","2":"note","relations":{"1":["1",1],"2":[1,1.5]}}', opts: { items: 2 } },
  { count: 2, candidate: '{"1":"task","2":"note","relations":{"1":[1,1,1],"3":[1,1]," 2":[2,2]}}', opts: { items: 2 } },
  { count: 1, candidate: '{"1":"task","relations":{"1":[1,1]}}', opts: {} },
  { count: 1, candidate: '{"1":"task","relations":[[1,1]]}', opts: { items: 1 } }
]

const files = [
  '- [ ] Call the dentist. ([10:32](inbox/2026-09-18.md))\n- [x] Email Bob. ([10:32](inbox/2026-09-18.md))\n',
  '## Monday\n- [ ] one\n* [X] two\n+ [ ] three\n## Tuesday\n  - [ ]   four  \n- [ ]\n- [ ] ',
  '```\n- [ ] not a task\n```\n- [ ] a task\n~~~\n- [x] fenced\n~~~\n',
  '- [ ] windows\r\n- [x] done\r\n\r\n- plain bullet\r\n',
  '- I need to buy:\n  - [ ] apples ([10:32](inbox/2026-09-18.md))\n  - [ ] rice\n- Lead with nothing under:\n- Maybe a garden. ([09:00](inbox/2026-09-17.md))\n- Ends with colon:\n\n    - deeper after a blank\n',
  '- [ ] [x] odd\n- [] not a box\n- [ ]tight\n-[ ] no space\n1. numbered\n- [ ] link only ([10:32](x.md))\n',
  ''
]

const ticks: Array<{ text: string; nth: number }> = [
  { text: '- [ ] one\n- [ ] two\n', nth: 1 },
  { text: '- [ ] one\r\n- [x] two\r\n- [ ] three', nth: 1 },
  { text: '- [ ] one\r\n- [x] two\r\n- [ ] three', nth: 2 },
  { text: '```\n- [ ] fenced\n```\n- [ ]\n- [ ] real ([10:32](inbox/x.md))\n', nth: 0 },
  { text: '- [ ] one\n', nth: 3 },
  { text: '  * [ ] indented', nth: 0 }
]

const reminders: Array<{ text: string; maxChars?: number }> = [
  { text: '- [ ] Call the dentist.\n- [x] Email Bob.\n- [ ] Water the plants.\n' },
  { text: '- [x] all done\n' },
  { text: '- [ ] one\n' },
  { text: `- [ ] ${'a long task that keeps going '.repeat(10)}\n` },
  { text: `- [ ] ${'x'.repeat(30)}\n- [ ] ${'y'.repeat(30)}\n- [ ] z\n`, maxChars: 60 },
  { text: '- [ ] abcdefghijklmnop\n', maxChars: 20 },
  { text: '- [ ] abcdefghijklmnop\n', maxChars: 12 }
]

const receiptTexts = [
  'Call the dentist.',
  '\n\n  - [ ] Buy milk\nmore',
  '## Heading here\nbody',
  '> quoted   line   with   spaces',
  '1) numbered first',
  `${'word '.repeat(30)}end`,
  `${'a'.repeat(100)}`,
  `${'Sentence with words, '.repeat(4)}and more after the cut point here.`,
  '   \n\t\n',
  'Short: done.'
]

const places: Array<{ relative: string; location: 'folder' | 'fallback' }> = [
  { relative: 'murmur/inbox/2026-10-02.md', location: 'folder' },
  { relative: 'murmur/todo.md', location: 'folder' },
  { relative: 'murmur/ideas.md', location: 'fallback' },
  { relative: '2026-10-02.md', location: 'folder' },
  { relative: 'notes/a-very-long-file-name.txt', location: 'folder' },
  { relative: 'journal\\2026_10_02.md', location: 'folder' }
]

const entries = ['Call the dentist.', 'Line one\nLine two\n\n\n', '{time} said aloud', '']

// Path templates as someone might type them in Settings, Notes, File layout.
const paths = [
  'murmur/inbox/{date}.md',
  'murmur/notes/{date}.md',
  '{year}/{month}/{day}.md',
  'murmur/{datetime}.txt',
  'murmur/{time}.md',
  'murmur/{unknown}.md',
  'journal\\{date}.md',
  '  murmur//inbox/{date}.MD  ',
  'Café/{date}.md',
  '',
  '   ',
  '/etc/{date}.md',
  '~/notes/{date}.md',
  'C:/notes/{date}.md',
  '../escape/{date}.md',
  'murmur/./x.md',
  'murmur/what?.md',
  'murmur/trailing./x.md',
  'murmur/space /x.md',
  'murmur/tab\there.md',
  'murmur/con.md',
  'murmur/LPT1',
  'murmur/inbox/{date}',
  'murmur/inbox/{date}.markdown',
  'murmur/.md',
  // A combining mark after a slash: JavaScript splits on code units, so
  // the slash is still a slash.
  '../\u0301notes/{date}.md',
  '/\u0301x.md',
  '~\u0301/x.md',
  'journal\\\u0301{date}.md',
  // NEL: inside a name for JavaScript's dot.
  'a\u0085b.md',
  'con.\u0085/x.md'
]

test("desktop's note rules give shared/notes-vectors.json's answers", () => {
  const when = new Date(2026, 8, 18, 10, 32)
  const data = {
    version: 1,
    comment:
      "Desktop's pure note rules (src/shared/sorter.ts, todo.ts, receipt.ts, notes.ts) over these inputs, for every platform to give the same answers (ios/prd.json IOS-023). Seams are given as their two sides and the lead words they offer. Entries render at 10:32 on 2026-09-18 with the default entry template, and paths resolve at the same moment.",
    split: texts.map((text) => ({ text, ...splitUnits(text) })),
    seams: sentences.map((sentence) => {
      const seams = findSeams(sentence)
      return { sentence, sides: seams.map((seam) => seamSides(sentence, seam)), leadWords: leadWords(sentence, seams) }
    }),
    cuts: cuts.map((c) => ({ ...c, ...cutRun(c.sentence, findSeams(c.sentence), c.confirmed, c.start) })),
    replies: replies.map((r) => ({ ...r, verdict: validateSort(r.count, r.candidate, r.opts) })),
    files: files.map((text) => ({ text, todo: parseTodo(text), list: parseListItems(text) })),
    ticks: ticks.map((t) => ({ ...t, result: tickLine(t.text, t.nth) })),
    reminders: reminders.map((r) => ({ ...r, body: reminderBody(parseTodo(r.text), r.maxChars) })),
    receipts: receiptTexts.map((text) => ({ text, line: receiptLine(text) })),
    places: places.map((p) => ({ ...p, placeName: placeName(p.relative), pillPlace: pillPlace(p.relative, p.location) })),
    entries: entries.map((text) => ({ text, entry: renderNoteEntry(DEFAULT_NOTE_ENTRY_TEMPLATE, text, when) })),
    separators: [null, '', 'x', 'x\n'].map((tail) => ({ tail, separator: appendSeparator(tail) })),
    paths: paths.map((template) => {
      const result = resolveNotePath(template, when)
      return result.ok ? { template, relative: result.relative } : { template, problem: result.reason }
    })
  }
  const file = join(__dirname, '../../shared/notes-vectors.json')
  // MURMUR_WRITE_VECTORS=1 writes desktop's answers before comparing.
  if (process.env.MURMUR_WRITE_VECTORS) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  expect(data).toEqual(JSON.parse(readFileSync(file, 'utf8')))
})
