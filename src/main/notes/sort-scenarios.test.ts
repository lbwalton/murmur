// SPDX-License-Identifier: GPL-3.0-only
// Desktop's own sortNote over a set of notes with canned model replies must
// send the requests, leave the files, report, and hold the lines that
// shared/sort-scenarios.json records. MurmurCore runs the same file, so the
// iPhone sorts a note as desktop does (ios/prd.json IOS-023).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: {
    notes: {
      sort: true,
      topicHeadings: false,
      filedHeadingTemplate: '## {date} {topic}',
      tasksTemplate: 'murmur/todo.md',
      ideasTemplate: 'murmur/ideas.md',
      folder: '',
      connection: { enabled: false, protocol: 'chat', baseUrl: '', llmModel: '', threshold: 0.5 }
    }
  }
}))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('../settings', () => ({
  getSettings: () => state.settings,
  getApiKeyFor: () => null,
  ringClearKey: () => undefined,
  ringSetKey: () => undefined,
  updateSettings: () => undefined
}))
vi.mock('../smoke', () => ({ isSmoke: false, registerSmokeCheck: () => undefined }))
vi.mock('../window-watch', () => ({ writeAppLog: () => undefined }))
vi.mock('../formatter', () => ({ resolvePolishConnection: () => null }))
vi.mock('./decide', () => ({ askDecision: async () => ({ ok: false, reason: 'off' }) }))

import { getHeldLines, rememberForSort, sortLastNote, sortNote } from './sorter'

type Reply = { content: string } | { status: number }

interface Scenario {
  name: string
  text: string
  todo?: string
  ideas?: string
  replies: Reply[]
  /** Replies for a Sort again after the first sort. */
  again?: Reply[]
}

const json = (value: unknown): Reply => ({ content: JSON.stringify(value) })

const scenarios: Scenario[] = [
  {
    name: 'files tasks and ideas from a fenced reply',
    text: 'Call the dentist. Maybe the wizard asks for the vault. Nice weather today. Email Bob.',
    replies: [{ content: '```json\n{"1":"task","2":"idea","3":"note","4":"task"}\n```' }]
  },
  { name: 'a reply missing sentences files nothing', text: 'Call the dentist. Maybe the wizard asks for the vault. Nice weather today. Email Bob.', replies: [{ content: 'Sure! {"1":"task","2":"idea"}' }] },
  { name: 'a failed request files nothing', text: 'Call the dentist. Email Bob.', replies: [{ status: 500 }] },
  { name: 'a reply that is not json files nothing', text: 'Call the dentist.', replies: [{ content: 'I cannot help with that.' }] },
  { name: 'an empty reply files nothing', text: 'Call the dentist.', replies: [{ content: '   ' }] },
  { name: 'a bad label files nothing', text: 'Call the dentist. Email Bob.', replies: [json({ 1: 'todo', 2: 'task' })] },
  { name: 'an extra sentence files nothing', text: 'Call the dentist.', replies: [json({ 1: 'task', 2: 'idea' })] },
  { name: 'a list for an answer files nothing', text: 'Call the dentist.', replies: [{ content: '["task"]' }] },
  { name: 'labels in any case and spacing', text: 'Call the dentist. Maybe paint the fence.', replies: [json({ 1: ' Task ', 2: 'IDEA' })] },
  { name: 'only notes files nothing but files', text: 'Nice weather today. The train was late.', replies: [json({ 1: 'note', 2: 'note' })] },
  { name: 'nothing to sort', text: '  \n  ', replies: [] },
  {
    name: 'a run cut at its seams',
    text: 'Buy milk, eggs, and bread. Call mom.',
    replies: [json({ 1: 'task', 2: 'task', seams: { 1: [1, 2] } })]
  },
  {
    name: 'a lead-in nests its run',
    text: 'I need to buy apples, rice, and coffee.',
    replies: [json({ 1: 'task', seams: { 1: [1, 2] }, starts: { 1: 5 } })]
  },
  {
    name: 'a vote for a seam that does not exist leaves the sentence whole',
    text: 'Buy milk and bread.',
    replies: [json({ 1: 'task', seams: { 1: [1, 4] } })]
  },
  {
    name: 'a list under a heading nests under it',
    text: 'For the trip:\n- passport\n- charger\nBook the hotel.',
    replies: [json({ 1: 'task', 2: 'task', 3: 'task' })]
  },
  {
    name: 'titles and shorthand stay in their sentence',
    text: 'Call Dr. Smith about the knee. Pack the tent, stove, etc. for the trip!',
    replies: [json({ 1: 'task', 2: 'task' })]
  },
  {
    name: 'a repeat of a filed task is held',
    text: 'Call the dentist. Water the plants.',
    todo: '## 2026-09-17\n- [ ] Call the dentist. ([09:00](inbox/2026-09-17.md))\n',
    replies: [json({ 1: 'task', 2: 'task', relations: { 1: [1, 1] } })]
  },
  {
    name: 'a report of a finished task is held',
    text: 'I emailed Bob. Buy stamps.',
    todo: '## 2026-09-17\n- [ ] Call the dentist. ([09:00](inbox/2026-09-17.md))\n- [ ] Email Bob. ([09:00](inbox/2026-09-17.md))\n',
    replies: [json({ 1: 'note', 2: 'task', relations: { 1: [2, 2] } })]
  },
  {
    name: 'a note voted the same files normally',
    text: 'The dentist is on Main Street.',
    todo: '- [ ] Call the dentist.\n',
    replies: [json({ 1: 'note', relations: { 1: [1, 1] } })]
  },
  {
    name: 'a repeat of a finished task is held as done before',
    text: 'Pay rent.',
    todo: '- [x] Pay rent. ([09:00](inbox/2026-09-17.md))\r\n- [ ] Call the dentist.\r\n',
    replies: [json({ 1: 'task', relations: { 1: [1, 1] } })]
  },
  {
    name: 'a repeated idea is held',
    text: 'Maybe start a garden.',
    ideas: '## 2026-09-17\n- Maybe start a garden. ([09:00](inbox/2026-09-17.md))\n',
    replies: [json({ 1: 'idea', relations: { 1: [1, 1] } })]
  },
  {
    name: 'a cut sentence tied to a filed item is looked at piece by piece',
    text: 'Buy apples and bread.',
    todo: '- [ ] Buy apples.\n',
    replies: [
      json({ 1: 'task', seams: { 1: [1] }, relations: { 1: [1, 1] } }),
      json({ 1: 'task', 2: 'task', relations: { 1: [1, 1] } })
    ]
  },
  {
    name: 'a failed piece look holds the whole line with its pieces',
    text: 'Buy apples and bread.',
    todo: '- [ ] Buy apples.\n',
    replies: [json({ 1: 'task', seams: { 1: [1] }, relations: { 1: [1, 1] } }), { status: 500 }]
  },
  {
    name: 'a kept run is compared piece by piece',
    text: 'I need to buy apples, rice, and coffee.',
    todo: '## 2026-09-17\n- [ ] apples ([09:00](inbox/2026-09-17.md))\n',
    replies: [
      json({ 1: 'task', seams: { 1: [1, 2] }, starts: { 1: 5 } }),
      json({ 1: 'task', 2: 'task', 3: 'task', relations: { 1: [1, 1] } })
    ]
  },
  {
    name: 'a kept run files as cut when the piece look fails',
    text: 'I need to buy apples, rice, and coffee.',
    todo: '- [ ] apples\n',
    replies: [json({ 1: 'task', seams: { 1: [1, 2] }, starts: { 1: 5 } }), { content: 'nope' }]
  },
  {
    name: 'a relation vote naming no real item counts for nothing',
    text: 'Call the dentist.',
    todo: '- [ ] Call the dentist.\n',
    replies: [json({ 1: 'task', relations: { 1: [1, 9], 2: [1, 1] } })]
  },
  {
    name: "the day's heading is written once",
    text: 'Maybe paint the fence blue.',
    ideas: '## 2026-09-18\n- Maybe start a garden. ([09:00](inbox/2026-09-18.md))',
    replies: [json({ 1: 'idea' })]
  },
  {
    name: 'a new day gets its own heading after a blank line',
    text: 'Fix the bike. Maybe ride to work.',
    todo: '## 2026-09-17\n- [ ] Call the dentist. ([09:00](inbox/2026-09-17.md))\n',
    ideas: '# Ideas\n\n',
    replies: [json({ 1: 'task', 2: 'idea' })]
  },
  {
    name: 'Sort again sends only what a rejected sort left',
    text: 'Call the dentist. Email Bob.',
    replies: [json({ 1: 'task' })],
    again: [json({ 1: 'task', 2: 'task' })]
  },
  {
    name: 'Sort again after a held line sends nothing',
    text: 'Call the dentist. Water the plants.',
    todo: '- [ ] Call the dentist.\n',
    replies: [json({ 1: 'task', 2: 'task', relations: { 1: [1, 1] } })],
    again: [json({ 1: 'task' })]
  },
  {
    name: 'accents and emoji cut where they were spoken',
    text: 'Buy café crème, 🍎 apples, and pears. Ask Zoë about the 🎉 party.',
    replies: [json({ 1: 'task', 2: 'task', seams: { 1: [1, 2] } })]
  },
  {
    name: 'a clause comma before the run is offered as lead words',
    text: 'For the party, I need chips, salsa, and lemons.',
    replies: [json({ 1: 'task', seams: { 1: [2, 3] }, starts: { 1: 5 } })]
  },
  {
    name: 'quotes and parentheses are never cut inside',
    text: 'Tell Sam "bring chips, salsa, and cups" today. Get (red, blue) paint, and brushes.',
    replies: [json({ 1: 'task', 2: 'task', seams: { 2: [1] } })]
  },
  {
    name: 'a markdown list keeps its markers off the copied lines',
    text: '- [ ] call the plumber\n1. renew the passport\n- maybe a new couch',
    replies: [json({ 1: 'task', 2: 'task', 3: 'idea' })]
  },
  {
    name: 'a link back to the inbox is encoded',
    text: 'Order the #2 pencils (yellow) & erasers.',
    replies: [json({ 1: 'task' })]
  },
  // US-114 and US-115 (IOS-033): file only the item, never a lone filler.
  {
    name: 'the BrambleCat line files only the item',
    text: 'Book the venue for Friday. Email Dana the budget. Oh, and an idea: a Times Square takeover for BrambleCat.',
    replies: [json({ 1: 'task', 2: 'task', 3: 'idea', keep: { 3: [5, 10] } })]
  },
  {
    name: 'a long filler run is never a cut, and the kept words cut',
    text: `${'Okay, '.repeat(10)}buy milk, and eggs.`,
    replies: [json({ 1: 'task', seams: { 1: [1] }, keep: { 1: [11, 14] } })]
  },
  {
    name: 'ER stays an item',
    text: 'Call the pharmacy, ER, and urgent care.',
    replies: [json({ 1: 'task', seams: { 1: [1, 2] } })]
  },
  {
    name: 'a trimmed run keeps its lead-in',
    text: 'Honestly, tomorrow I need to buy apples, rice, and coffee.',
    replies: [json({ 1: 'task', seams: { 1: [2, 3] }, starts: { 1: 7 }, keep: { 1: [2, 10] } })]
  },
  {
    name: 'a bad keep span files the sentence whole',
    text: 'Oh, call the vet.',
    replies: [json({ 1: 'task', keep: { 1: [0, 9] } })]
  },
  {
    name: "a note's keep span and a span of fillers alone change nothing",
    text: 'Honestly the weather was lovely today. Oh, and an idea: a podcast tour.',
    replies: [json({ 1: 'note', 2: 'idea', keep: { 1: [2, 4], 2: [1, 2] } })]
  },
  {
    name: 'a trimmed line tied to a filed item is held with its kept words',
    text: 'Oh, and an idea: a rooftop launch party.',
    ideas: '## 2026-09-17\n- a rooftop launch party. ([09:00](inbox/2026-09-17.md))\n',
    replies: [json({ 1: 'idea', keep: { 1: [5, 8] }, relations: { 1: [1, 1] } })]
  }
]

test("desktop's sorter sends shared/sort-scenarios.json's requests and leaves its files", async () => {
  const cfg = { baseUrl: 'https://mock.local/v1', model: 'scenario-sorter', apiKey: 'k' }
  const out: unknown[] = []
  for (const scenario of scenarios) {
    const base = mkdtempSync(join(tmpdir(), 'murmur-scenario-'))
    const todoFile = join(base, 'murmur', 'todo.md')
    const ideasFile = join(base, 'murmur', 'ideas.md')
    mkdirSync(join(base, 'murmur', 'inbox'), { recursive: true })
    if (scenario.todo !== undefined) writeFileSync(todoFile, scenario.todo)
    if (scenario.ideas !== undefined) writeFileSync(ideasFile, scenario.ideas)
    const calls: Array<{ system: string; user: string; reply: Reply }> = []
    const queue = [...scenario.replies, ...(scenario.again ?? [])]
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { messages: Array<{ content: string }>; temperature: number; model: string }
      const reply = queue.shift() ?? { status: 599 }
      calls.push({ system: body.messages[0].content, user: body.messages[1].content, reply })
      if ('status' in reply) return new Response('{}', { status: reply.status })
      return new Response(JSON.stringify({ choices: [{ message: { content: reply.content } }] }), { status: 200 })
    }) as unknown as typeof fetch
    const input = { text: scenario.text, base, inboxRelative: 'murmur/inbox/2026-09-18.md', when: new Date(2026, 8, 18, 10, 32) }
    rememberForSort(input)
    const first = await sortNote(input, { fetchImpl, connection: cfg })
    const again = scenario.again ? await sortLastNote({ fetchImpl, connection: cfg }) : null
    const read = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null)
    const report = (r: typeof first | null) =>
      r && {
        outcome: r.outcome,
        tasks: r.tasks,
        ideas: r.ideas,
        notes: r.notes,
        held: r.held,
        ...(r.reason ? { reason: r.reason } : {}),
        places: (r.places ?? []).map((p) => ({ kind: p.kind, relative: p.relative }))
      }
    out.push({
      name: scenario.name,
      text: scenario.text,
      todoBefore: scenario.todo ?? null,
      ideasBefore: scenario.ideas ?? null,
      calls,
      report: report(first),
      again: report(again),
      todo: read(todoFile),
      ideas: read(ideasFile),
      held: getHeldLines().map((h) => ({
        position: h.position,
        text: h.text,
        label: h.label,
        reason: h.reason,
        ...(h.pieces ? { pieces: h.pieces } : {}),
        ...(h.lead ? { lead: h.lead } : {}),
        ...(h.match ? { match: h.match } : {})
      }))
    })
    rmSync(base, { recursive: true, force: true })
  }
  const data = {
    version: 1,
    comment:
      "Desktop's own sortNote (src/main/notes/sorter.ts) over these notes with these canned chat replies, at 10:32 on 2026-09-18 into murmur/inbox/2026-09-18.md, topic headings off: every request it sent (system and user prompt, with the reply it got: content, or an HTTP status), its report, the tasks and ideas files it left (null when it never wrote one), and the lines it held. again is the report of a Sort again after the first sort. Every platform's sorter must send the same requests and leave the same files (ios/prd.json IOS-023).",
    when: { date: '2026-09-18', time: '10:32' },
    inbox: 'murmur/inbox/2026-09-18.md',
    scenarios: out
  }
  const file = join(__dirname, '../../../shared/sort-scenarios.json')
  // MURMUR_WRITE_VECTORS=1 writes desktop's answers before comparing.
  if (process.env.MURMUR_WRITE_VECTORS) writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  expect(data).toEqual(JSON.parse(readFileSync(file, 'utf8')))
})
