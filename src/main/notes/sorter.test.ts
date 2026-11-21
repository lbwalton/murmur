// SPDX-License-Identifier: GPL-3.0-only
// A long note sorts in parts (US-180), against a fake model that
// refuses a request above a size with 413 and rate-limits with 429, the
// way Groq's free tier does: parts, halving, 1 more try after a wait,
// and Sort again sending only the lines no answer covered. Real files
// in a temp folder; the settings, network, and log stood in.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import { type SortInput, canSortAgain, rememberForSort, sortLastNote, sortNote } from './sorter'

const stage = vi.hoisted(() => ({ dir: '', settings: null as unknown, logs: [] as string[] }))

vi.mock('electron', () => ({ app: { getPath: () => stage.dir } }))
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
vi.mock('../window-watch', () => ({ writeAppLog: (line: string) => stage.logs.push(line) }))
vi.mock('./decide', () => ({ askDecision: vi.fn() }))

interface Call {
  /** The numbered sentences the request carried, without numbers. */
  sentences: string[]
  user: string
  size: number
}

const ORG = 'org_01testorganization'

/** A chat model that labels every sentence a task, and answers each
 *  request with whatever `refuse` says for it first. */
function fakeModel(refuse: (call: Call, n: number) => Response | null = () => null): {
  fetchImpl: typeof fetch
  calls: Call[]
} {
  const calls: Call[] = []
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? '')
    const parsed = JSON.parse(body) as { messages: Array<{ role: string; content: string }> }
    const user = parsed.messages.find((m) => m.role === 'user')?.content ?? ''
    const sentences = (user.split('\n\n')[0] ?? '')
      .split('\n')
      .map((line) => /^\d+\. (.*)$/.exec(line)?.[1])
      .filter((s): s is string => s !== undefined)
    const call = { sentences, user, size: body.length }
    calls.push(call)
    const refused = refuse(call, calls.length - 1)
    if (refused) return refused
    const labels = Object.fromEntries(sentences.map((_, i) => [String(i + 1), 'task']))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(labels) } }] }), {
      status: 200,
      headers: { 'x-ratelimit-limit-tokens': '8000' }
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const tooLarge = (call: Call): Response =>
  new Response(
    JSON.stringify({
      error: {
        message: `Request too large for model \`openai/gpt-oss-120b\` in organization \`${ORG}\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Requested ${Math.round(call.size / 3)}, please reduce your message size and try again.`,
        type: 'tokens',
        code: 'rate_limit_exceeded'
      }
    }),
    { status: 413, headers: { 'retry-after': '166' } }
  )

const limited = (retryAfter = '7'): Response =>
  new Response(
    JSON.stringify({
      error: {
        message: `Rate limit reached for model \`openai/gpt-oss-120b\` in organization \`${ORG}\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Used 6000, Requested 4000. Please try again in 15s.`,
        type: 'tokens',
        code: 'rate_limit_exceeded'
      }
    }),
    { status: 429, headers: { 'retry-after': retryAfter } }
  )

// A part's budget that holds about 5 of these sentences beside the
// prompts' own framing.
const PART = 1350
// 30 short sentences, none with a comma, so no piece look follows.
const SENTENCES = Array.from({ length: 30 }, (_, i) => `Call Siobhan about invoice ${i + 1} today.`)
let urlCount = 0

function setup(text = SENTENCES.join(' ')): {
  input: SortInput
  todo: string
  cfg: { baseUrl: string; model: string; apiKey: string }
} {
  urlCount += 1
  const input: SortInput = {
    text,
    base: stage.dir,
    inboxRelative: 'murmur/inbox/2026-11-04.md',
    when: new Date(2026, 10, 4, 9, 30)
  }
  return {
    input,
    todo: join(stage.dir, 'murmur', 'todo.md'),
    // A fresh base URL per test, so a limit 1 test learned is not the next's.
    cfg: { baseUrl: `https://fake-${urlCount}.local/v1`, model: 'openai/gpt-oss-120b', apiKey: 'gsk_fake_1234567890abcdefghijkl' }
  }
}

const filedLines = (file: string): string[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- [ ] '))
    .map((line) => line.replace(/^- \[ \] /, '').replace(/ \(\[.*$/, ''))

beforeEach(() => {
  stage.dir = mkdtempSync(join(tmpdir(), 'murmur-sort-'))
  stage.logs = []
  stage.settings = { ...DEFAULT_SETTINGS, notes: { ...DEFAULT_SETTINGS.notes, sort: true, folder: stage.dir } }
})

afterEach(() => {
  rmSync(stage.dir, { recursive: true, force: true })
})

describe('a long note sorts in parts', () => {
  it('sends the note in parts that each file, every line once and in order', async () => {
    const { input, todo, cfg } = setup()
    const model = fakeModel()
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: PART })
    expect(model.calls.length).toBeGreaterThan(1)
    expect(Math.max(...model.calls.map((c) => c.sentences.length))).toBeGreaterThan(2)
    expect(model.calls.flatMap((c) => c.sentences)).toEqual(SENTENCES)
    expect(report).toMatchObject({ outcome: 'filed', tasks: 30, parts: model.calls.length })
    expect(report.unsorted).toBeUndefined()
    expect(filedLines(todo)).toEqual(SENTENCES)
    // 1 heading for the whole note.
    expect(readFileSync(todo, 'utf8').match(/^## /gm)).toHaveLength(1)
    expect(stage.logs.some((l) => l.includes('[sort] filed tasks=') && l.includes(' part=2'))).toBe(true)
  })

  it('sends a short note in 1 request, as before', async () => {
    const { input, cfg } = setup('Call the vet. Email Ann.')
    const model = fakeModel()
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg })
    expect(model.calls).toHaveLength(1)
    expect(report.parts).toBeUndefined()
    expect(stage.logs.some((l) => l.startsWith('[sort] done'))).toBe(false)
  })

  it('splits a part the provider calls too large in half, down to a size it takes', async () => {
    const { input, todo, cfg } = setup()
    // The estimate thinks the whole note fits; the provider does not.
    const model = fakeModel((call) => (call.size > 2600 ? tooLarge(call) : null))
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: 100_000 })
    const sizes = model.calls.map((c) => c.sentences.length)
    expect(sizes[0]).toBe(30)
    model.calls.forEach((call, i) => {
      if (call.size > 2600) expect(sizes[i + 1]).toBeLessThanOrEqual(Math.ceil(sizes[i] / 2))
    })
    expect(report).toMatchObject({ outcome: 'filed', tasks: 30 })
    expect(report.unsorted).toBeUndefined()
    expect(filedLines(todo)).toEqual(SENTENCES)
    const tooLargeLog = stage.logs.find((l) => l.includes('[sort] failed reason=http 413')) ?? ''
    // The provider's reason is logged, its organization id is not.
    expect(tooLargeLog).toContain('Limit 8000')
    expect(tooLargeLog).not.toContain(ORG)
    expect(stage.logs.some((l) => l.includes('[sort] part too large reason=http 413 sentences=30; sending it in halves'))).toBe(true)
  })

  it('leaves a line too large even alone in the inbox and files the rest', async () => {
    const huge = `Write the long ${'very '.repeat(1400)}detailed plan today.`
    const sentences = ['Call the vet today.', huge, 'Email Ann the deck.']
    const { input, todo, cfg } = setup(sentences.join(' '))
    rememberForSort(input)
    const model = fakeModel((call) => (call.size > 6000 ? tooLarge(call) : null))
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: 100_000 })
    expect(report).toMatchObject({ outcome: 'filed', tasks: 2, unsorted: 1, reason: 'http 413' })
    expect(filedLines(todo)).toEqual(['Call the vet today.', 'Email Ann the deck.'])
    expect(canSortAgain()).toBe(true)
    // Sort again sends that 1 line alone.
    const before = model.calls.length
    const again = await sortLastNote({ fetchImpl: model.fetchImpl, connection: cfg, partTokens: 100_000 })
    expect(model.calls.slice(before).map((c) => c.sentences)).toEqual([[huge]])
    expect(again).toMatchObject({ outcome: 'failed', reason: 'http 413', unsorted: 1 })
    expect(filedLines(todo)).toEqual(['Call the vet today.', 'Email Ann the deck.'])
  })
})

describe('a rate limit', () => {
  it('waits what the 429 asked, tries once more, and files', async () => {
    const { input, todo, cfg } = setup()
    const model = fakeModel((_call, n) => (n === 1 ? limited('7') : null))
    const sleeps: number[] = []
    const report = await sortNote(input, {
      fetchImpl: model.fetchImpl,
      connection: cfg,
      partTokens: PART,
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })
    expect(sleeps).toEqual([7500])
    // The refused part went again with the same sentences.
    expect(model.calls[2].sentences).toEqual(model.calls[1].sentences)
    expect(report).toMatchObject({ outcome: 'filed', tasks: 30 })
    expect(filedLines(todo)).toEqual(SENTENCES)
    const line = stage.logs.find((l) => l.includes('[sort] rate limited')) ?? ''
    expect(line).toContain('reason=http 429 for=labels wait=7.0s')
    expect(line).toContain('trying once more')
    expect(line).toContain('Please try again in 15s')
  })

  it('stops after a second 429, and Sort again sends only the lines left', async () => {
    const { input, todo, cfg } = setup()
    rememberForSort(input)
    const model = fakeModel((_call, n) => (n === 1 || n === 2 ? limited('3') : null))
    const sleep = async (): Promise<void> => undefined
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: PART, sleep })
    const firstPart = model.calls[0].sentences
    expect(firstPart.length).toBeGreaterThan(2)
    const left = SENTENCES.slice(firstPart.length)
    expect(report).toMatchObject({ outcome: 'filed', tasks: firstPart.length, unsorted: left.length, reason: 'http 429' })
    expect(filedLines(todo)).toEqual(firstPart)
    expect(canSortAgain()).toBe(true)
    expect(stage.logs.some((l) => l.includes(`[sort] stopped reason=http 429 left=`))).toBe(true)

    const before = model.calls.length
    const again = await sortLastNote({ fetchImpl: model.fetchImpl, connection: cfg, partTokens: PART, sleep })
    expect(model.calls.slice(before).flatMap((c) => c.sentences)).toEqual(left)
    expect(again).toMatchObject({ outcome: 'filed', tasks: left.length })
    expect(again?.unsorted).toBeUndefined()
    // Every line once: nothing that landed was sent or filed twice.
    expect(filedLines(todo)).toEqual(SENTENCES)
    expect(canSortAgain()).toBe(false)
  })

  it('does not wait on a 429 that asks for more than a minute', async () => {
    const { input, cfg } = setup('Call the vet. Email Ann.')
    const model = fakeModel(() => limited('3600'))
    const sleeps: number[] = []
    const report = await sortNote(input, {
      fetchImpl: model.fetchImpl,
      connection: cfg,
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })
    expect(sleeps).toEqual([])
    expect(model.calls).toHaveLength(1)
    expect(report).toMatchObject({ outcome: 'failed', reason: 'http 429', unsorted: 2 })
    expect(stage.logs.some((l) => l.includes('not waiting, it asks for more than a minute'))).toBe(true)
  })

  it('stops waiting once the sort has waited its share', async () => {
    const { input, cfg } = setup()
    // Every first try of a part is refused, asking for 50 seconds.
    const seen = new Set<string>()
    const model = fakeModel((call) => {
      const key = call.sentences.join('|')
      if (seen.has(key)) return null
      seen.add(key)
      return limited('50')
    })
    const sleeps: number[] = []
    const report = await sortNote(input, {
      fetchImpl: model.fetchImpl,
      connection: cfg,
      partTokens: PART,
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })
    expect(sleeps).toEqual([50_500, 50_500])
    expect(report.outcome).toBe('filed')
    expect(report.unsorted).toBeGreaterThan(0)
    expect(stage.logs.some((l) => l.includes('not waiting, this sort has waited its share'))).toBe(true)
  })
})

describe('the repeat check in a long note', () => {
  it('carries the same smaller list of filed items in every part', async () => {
    const { input, todo, cfg } = setup()
    mkdirSync(join(stage.dir, 'murmur'), { recursive: true })
    writeFileSync(
      todo,
      `${Array.from({ length: 60 }, (_, i) => `- [ ] Order the parts for project number ${i} and confirm by email`).join('\n')}\n`
    )
    const model = fakeModel()
    const report = await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: 2000 })
    const headers = model.calls.map((c) => /Items already filed \(the most recent (\d+) of each file\)/.exec(c.user)?.[1])
    expect(report.outcome).toBe('filed')
    expect(model.calls.length).toBeGreaterThan(1)
    expect(Math.max(...model.calls.map((c) => c.sentences.length))).toBeGreaterThan(2)
    expect(new Set(headers).size).toBe(1)
    expect(Number(headers[0])).toBeLessThan(60)
  })

  it('says so when a run files without its piece look', async () => {
    const { input, todo, cfg } = setup('I need to buy apples, rice, and coffee.')
    mkdirSync(join(stage.dir, 'murmur'), { recursive: true })
    writeFileSync(todo, '- [ ] Call the vet\n')
    let n = 0
    const fetchImpl = (async () => {
      n += 1
      if (n === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"task","seams":{"1":[1,2]}}' } }] }), {
          status: 200
        })
      }
      return limited('2')
    }) as typeof fetch
    const report = await sortNote(input, { fetchImpl, connection: cfg, sleep: async () => undefined })
    expect(n).toBe(3)
    expect(report).toMatchObject({ outcome: 'filed', tasks: 3, unchecked: 1 })
    expect(
      stage.logs.some((l) =>
        l.includes('[sort] piece compare failed reason=http 429 model=openai/gpt-oss-120b; filing the runs as cut unchecked=1')
      )
    ).toBe(true)
    expect(stage.logs.some((l) => l.includes('rate limited reason=http 429 for=pieces'))).toBe(true)
  })
})

describe('the log', () => {
  it('never carries the words of the note or the key', async () => {
    const { input, cfg } = setup()
    const model = fakeModel((call, n) => (n === 0 ? tooLarge(call) : n === 2 ? limited('1') : null))
    await sortNote(input, { fetchImpl: model.fetchImpl, connection: cfg, partTokens: PART, sleep: async () => undefined })
    const log = stage.logs.join('\n')
    expect(log).not.toContain('Siobhan')
    expect(log).not.toContain('invoice')
    expect(log).not.toContain(cfg.apiKey)
    expect(log).not.toContain(ORG)
  })
})
