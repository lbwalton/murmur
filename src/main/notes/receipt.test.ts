// SPDX-License-Identifier: GPL-3.0-only
// The receipts around a long note's sort (US-180): a note saved while a
// long sort waits out a rate limit gets its own sort and its own
// receipt, the long note's unfinished notice stays beside it, and Sort
// again takes that notice back once the lines left have filed. The
// system notification, settings, network, and log are stood in.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import { forgetLastNote, noteSaved, sortAgainWithReceipt, sortWithReceipt } from './receipt'
import { type SortInput, canSortAgain, forgetSortMemory, getHeldLines, rememberForSort, waitingLines } from './sorter'

const stage = vi.hoisted(() => ({
  dir: '',
  settings: null as unknown,
  shown: [] as Array<{ id: string; title: string; body: string; closed: boolean }>
}))

vi.mock('electron', () => {
  class Notification {
    static isSupported = (): boolean => true
    static remove = (): void => undefined
    record: { id: string; title: string; body: string; closed: boolean }
    constructor(options: { id: string; title: string; body: string }) {
      this.record = { id: options.id, title: options.title, body: options.body, closed: false }
    }
    on(): void {}
    show(): void {
      stage.shown.push(this.record)
    }
    close(): void {
      this.record.closed = true
    }
  }
  return { Notification, app: { getPath: () => stage.dir }, shell: { openPath: async () => '', showItemInFolder: () => undefined } }
})
vi.mock('../ipc', () => ({ ipc: { handle: vi.fn() } }))
vi.mock('../settings', () => ({
  getSettings: () => stage.settings,
  getApiKeyFor: () => null,
  ringClearKey: vi.fn(),
  ringSetKey: vi.fn(),
  updateSettings: vi.fn()
}))
vi.mock('../formatter', () => ({ resolvePolishConnection: () => null }))
vi.mock('../net', () => ({ appFetch: vi.fn() }))
vi.mock('../smoke', () => ({ isSmoke: false, registerSmokeCheck: vi.fn() }))
vi.mock('../window-watch', () => ({ writeAppLog: vi.fn() }))
vi.mock('./decide', () => ({ askDecision: vi.fn() }))

const LONG = Array.from({ length: 30 }, (_, i) => `Call Siobhan about invoice ${i + 1} today.`)

/** A chat model that labels every sentence a task, refusing with 429
 *  on the requests `refuse` names. */
function model(refuse: (n: number) => boolean = () => false): typeof fetch {
  let n = 0
  return (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ content: string }> }
    const numbered = (body.messages[1]?.content.split('\n\n')[0] ?? '').split('\n').filter((l) => /^\d+\. /.test(l))
    if (refuse(n++)) {
      return new Response(JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 5s.' } }), {
        status: 429,
        headers: { 'retry-after': '5' }
      })
    }
    const labels = Object.fromEntries(numbered.map((_, i) => [String(i + 1), 'task']))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(labels) } }] }), { status: 200 })
  }) as typeof fetch
}

function note(text: string, day: number, minute: number): { input: SortInput; file: string } {
  const relative = `murmur/inbox/2026-11-0${day}.md`
  const file = join(stage.dir, 'murmur', 'inbox', `2026-11-0${day}.md`)
  writeFileSync(file, `## 09:${minute}\n\n${text}\n`)
  return { input: { text, base: stage.dir, inboxRelative: relative, when: new Date(2026, 10, day, 9, minute) }, file }
}

const saved = (n: { input: SortInput; file: string }): Parameters<typeof noteSaved>[0] => ({
  ok: true,
  location: 'folder',
  relative: n.input.inboxRelative,
  file: n.file,
  when: n.input.when
})

beforeEach(() => {
  forgetSortMemory()
  stage.dir = mkdtempSync(join(tmpdir(), 'murmur-receipt-'))
  mkdirSync(join(stage.dir, 'murmur', 'inbox'), { recursive: true })
  stage.shown = []
  stage.settings = { ...DEFAULT_SETTINGS, notes: { ...DEFAULT_SETTINGS.notes, sort: true, receipts: true, folder: stage.dir } }
})

afterEach(() => {
  rmSync(stage.dir, { recursive: true, force: true })
})

describe('a note saved while a long sort waits', () => {
  it('gets its own sort and receipt, and the long note keeps its own notice until Sort again', async () => {
    const cfg = { baseUrl: 'https://receipt-a.local/v1', model: 'openai/gpt-oss-120b', apiKey: 'k' }
    const a = note(LONG.join(' '), 4, 30)
    const b = note('Call the vet today. Email Ann the deck.', 5, 31)
    const tokenA = noteSaved(saved(a), a.input.text)
    rememberForSort(a.input)
    let sortB: Promise<unknown> | null = null
    await sortWithReceipt(a.input, tokenA, {
      fetchImpl: model((n) => n === 1 || n === 2),
      connection: cfg,
      partTokens: 1350,
      sleep: async () => {
        // Note B is saved during A's wait.
        const tokenB = noteSaved(saved(b), b.input.text)
        rememberForSort(b.input)
        sortB = sortWithReceipt(b.input, tokenB, { fetchImpl: model(), connection: cfg })
      }
    })
    await sortB
    const receipts = stage.shown.filter((s) => s.id === 'murmur-note-receipt').map((s) => s.title)
    const notices = stage.shown.filter((s) => s.id === 'murmur-sort-unfinished')
    // B's own receipts, and nothing of A's relabels B.
    expect(receipts).toEqual(['Noted to inbox/2026-11-04.md', 'Noted to inbox/2026-11-05.md', 'Sorted into todo.md'])
    // A's own notice, beside B's receipt, with none of A's words.
    expect(notices).toHaveLength(1)
    expect(notices[0].title).toBe('Sorted part of your note')
    expect(notices[0].body).toMatch(/^\d+ lines of your note from 09:30 are still only in the inbox\. The provider's rate limit ran out for now\./)
    expect(notices[0].body).not.toContain('Siobhan')
    expect(notices[0].closed).toBe(false)

    // Sort again files A's lines left and takes A's notice back.
    await sortAgainWithReceipt({ fetchImpl: model(), connection: cfg, partTokens: 1350 })
    expect(notices[0].closed).toBe(true)
    expect(stage.shown.filter((s) => s.id === 'murmur-sort-unfinished')).toHaveLength(1)
  })

  it('Clear all takes the notice back and forgets the notes Sort again kept', async () => {
    const cfg = { baseUrl: 'https://receipt-c.local/v1', model: 'openai/gpt-oss-120b', apiKey: 'k' }
    const a = note(LONG.join(' '), 7, 33)
    const b = note('Call the vet today. Email Ann the deck.', 8, 34)
    rememberForSort(a.input)
    await sortWithReceipt(a.input, noteSaved(saved(a), a.input.text), {
      fetchImpl: model((n) => n >= 1),
      connection: cfg,
      partTokens: 1350,
      sleep: async () => undefined
    })
    rememberForSort(b.input)
    await sortWithReceipt(b.input, noteSaved(saved(b), b.input.text), { fetchImpl: model(), connection: cfg })
    expect(waitingLines().lines).toBeGreaterThan(0)
    const notice = stage.shown.find((s) => s.id === 'murmur-sort-unfinished')
    forgetLastNote()
    expect(notice?.closed).toBe(true)
    expect(canSortAgain()).toBe(false)
    expect(waitingLines()).toEqual({ lines: 0, notes: 0 })
  })

  it('Clear all during a sort sticks: the sort files, but nothing comes back to memory or the screen', async () => {
    const cfg = { baseUrl: 'https://receipt-d.local/v1', model: 'openai/gpt-oss-120b', apiKey: 'k' }
    const todo = join(stage.dir, 'murmur', 'todo.md')
    writeFileSync(todo, '- [ ] Call the vet\n')
    // A repeat of a filed item in a later part, so a held line would come.
    const text = LONG.map((line, i) => (i === 2 ? 'Call the vet today.' : line)).join(' ')
    const a = note(text, 9, 35)
    rememberForSort(a.input)
    let n = 0
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages: Array<{ content: string }> }
      const numbered = (body.messages[1]?.content.split('\n\n')[0] ?? '').split('\n').filter((l) => /^\d+\. /.test(l))
      const call = n++
      // Part 2 waits out a 429 once; the last part is refused twice, so
      // the sort stops with lines left.
      if (call === 1 || call >= 4) {
        return new Response(JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 5s.' } }), {
          status: 429,
          headers: { 'retry-after': '5' }
        })
      }
      const labels: Record<string, unknown> = Object.fromEntries(numbered.map((_, i) => [String(i + 1), 'task']))
      const vet = numbered.findIndex((l) => /vet/.test(l))
      if (vet >= 0) labels.relations = { [String(vet + 1)]: [1, 1] }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(labels) } }] }), { status: 200 })
    }) as typeof fetch
    let waited = 0
    const report = await sortWithReceipt(a.input, noteSaved(saved(a), a.input.text), {
      fetchImpl,
      connection: cfg,
      partTokens: 900,
      sleep: async () => {
        waited += 1
        // Clear all in Settings, History, while the sort waits.
        if (waited === 1) forgetSortMemory()
      }
    })
    expect(waited).toBeGreaterThan(0)
    expect(report.unsorted).toBeGreaterThan(0)
    expect(getHeldLines()).toEqual([])
    expect(waitingLines()).toEqual({ lines: 0, notes: 0 })
    expect(canSortAgain()).toBe(false)
    expect(stage.shown.filter((s) => s.id === 'murmur-sort-unfinished')).toEqual([])
    const lines = readFileSync(todo, 'utf8').split('\n').filter((l) => l.startsWith('- [ ] '))
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines.filter((l) => l.includes('vet'))).toHaveLength(1)
  })

  it('stays quiet with Note receipts off', async () => {
    stage.settings = { ...DEFAULT_SETTINGS, notes: { ...DEFAULT_SETTINGS.notes, sort: true, receipts: false, folder: stage.dir } }
    const cfg = { baseUrl: 'https://receipt-b.local/v1', model: 'openai/gpt-oss-120b', apiKey: 'k' }
    const a = note('Call the vet today. Email Ann the deck.', 6, 32)
    const token = noteSaved(saved(a), a.input.text)
    await sortWithReceipt(a.input, token, { fetchImpl: model(() => true), connection: cfg, sleep: async () => undefined })
    expect(stage.shown).toEqual([])
  })
})
