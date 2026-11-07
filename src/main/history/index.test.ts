// SPDX-License-Identifier: GPL-3.0-only
// History's wiring, with Electron and its neighbours stood in. The log
// itself is covered in log.test.ts and seal.test.ts.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_NO_TEXT } from '../../shared/history'

const stage = vi.hoisted(() => ({
  dir: '',
  settings: { history: { retentionDays: 90, encrypt: true }, timeBack: { typingWpm: 40 } },
  listeners: [] as Array<(settings: { history: { retentionDays: number; encrypt: boolean } }) => void>,
  handlers: new Map<string, unknown>(),
  retrying: new Set<string>()
}))

vi.mock('electron', () => ({
  Notification: { isSupported: () => false },
  app: { getPath: () => stage.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(plain),
    decryptString: (wrapped: Buffer) => wrapped.toString()
  }
}))
vi.mock('../ipc', () => ({ ipc: { handle: (name: string, fn: unknown) => stage.handlers.set(name, fn) } }))
vi.mock('../settings', () => ({
  getSettings: () => stage.settings,
  onSettingsChanged: (listener: (typeof stage.listeners)[number]) => stage.listeners.push(listener)
}))
vi.mock('../smoke', () => ({ isSmoke: true, registerSmokeCheck: vi.fn() }))
vi.mock('../paintings', () => ({ clearPaintings: vi.fn(), initPaintings: vi.fn(), syncPaintingsWith: vi.fn() }))
vi.mock('../transcribe', () => ({ recoveryDir: () => join(stage.dir, 'recovery') }))
vi.mock('../retry', () => ({ isRetrying: (id: string) => stage.retrying.has(id), recoveryChanged: vi.fn() }))
vi.mock('../window-watch', () => ({ writeAppLog: vi.fn() }))
vi.mock('../timeback', () => ({ sessionLanded: vi.fn() }))
vi.mock('../notes/receipt', () => ({ forgetLastNote: vi.fn(), scrubLastNoteLine: vi.fn() }))

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000
const take = { startedAt: NOW - 2000, at: NOW, rawText: 'the marked words', finalText: 'The marked words.' }

const file = (): string => join(stage.dir, 'history.jsonl')
const lines = (): Array<Record<string, unknown>> =>
  readFileSync(file(), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

/** A fresh start of murmur: everything in memory is gone. */
async function launch(): Promise<typeof import('./index')> {
  vi.resetModules()
  stage.listeners.length = 0
  stage.handlers.clear()
  const history = await import('./index')
  history.initHistory(() => null)
  return history
}

function saveTake(savedAt: number, record: object): string {
  const dir = join(stage.dir, 'recovery')
  mkdirSync(dir, { recursive: true })
  const wav = join(dir, `recovery-${savedAt}.wav`)
  writeFileSync(wav, 'audio')
  writeFileSync(join(dir, `recovery-${savedAt}.json`), JSON.stringify({ kind: 'dictation', startedAt: savedAt, ...record }))
  return wav
}

beforeEach(() => {
  stage.dir = mkdtempSync(join(tmpdir(), 'murmur-history-index-'))
  stage.settings.history = { retentionDays: 90, encrypt: true }
  stage.retrying.clear()
})

// Launch starts checks that finish later, and one left running would
// reach into the next test's folder.
afterEach(async () => {
  await vi.dynamicImportSettled()
  await new Promise((resolve) => setTimeout(resolve, 10))
  vi.restoreAllMocks()
  rmSync(stage.dir, { recursive: true, force: true })
})

describe('recordSession', () => {
  it('seals the words on an ordinary take', async () => {
    const { recordSession } = await launch()
    recordSession(take)
    expect(readFileSync(file(), 'utf8')).not.toContain('marked')
    expect(lines()[0].sealed).toEqual(expect.any(String))
  })

  it("under Don't keep writes numbers only, sealed or not, and paste-last still has the words", async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, recordSession } = await launch()
    recordSession(take)
    expect(lines()[0]).toMatchObject({ rawText: '', finalText: '', words: 3 })
    expect(lines()[0].sealed).toBeUndefined()
    expect(eventToPaste()?.finalText).toBe('The marked words.')
  })

  it("under Don't keep the words are gone after a quit and the numbers stay", async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const first = await launch()
    first.recordSession(take)
    const second = await launch()
    expect(second.readHistory()[0]).toMatchObject({ finalText: '', words: 3 })
  })

  it('throws when the log cannot be written, so dictation can keep the recording', async () => {
    const { recordSession } = await launch()
    rmSync(file(), { force: true })
    mkdirSync(file())
    expect(() => recordSession(take)).toThrow()
  })

  it('leaves a memory-only entry off the disk altogether', async () => {
    const { readHistory, recordSession } = await launch()
    recordSession({ ...take, persist: false })
    expect(existsSync(file())).toBe(false)
    expect(readHistory().at(-1)?.finalText).toBe('The marked words.')
  })
})

describe('a held take retried', () => {
  it('goes back on its own entry and counts once', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { logWords, readHistory, recordSession } = await launch()
    const event = recordSession(take)
    recordSession({ ...take, at: NOW + 1000, rawText: 'newer', finalText: 'Newer.' })
    const back = logWords({ ...take, at: NOW + 2000, rawText: 'said again', finalText: 'Said again.', retried: true }, event?.at)
    expect(back?.at).toBe(NOW)
    expect(back?.words).toBe(3)
    expect(lines()).toHaveLength(2)
    expect(readHistory().find((entry) => entry.at === NOW)?.finalText).toBe('Said again.')
  })

  it('is what paste-last pastes, though a newer take sits below it', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, logWords, recordSession } = await launch()
    const event = recordSession(take)
    recordSession({ ...take, at: NOW + 1000, rawText: 'newer', finalText: 'Newer.' })
    expect(eventToPaste()?.at).toBe(NOW + 1000)
    logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, event?.at)
    expect(eventToPaste()).toMatchObject({ at: NOW, finalText: 'Said again.' })
  })

  it('gives way to the next take that lands', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, logWords, recordSession } = await launch()
    const event = recordSession(take)
    logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, event?.at)
    recordSession({ ...take, at: NOW + 1000, rawText: 'newer', finalText: 'Newer.' })
    expect(eventToPaste()?.at).toBe(NOW + 1000)
  })

  it('puts the words on disk, sealed, once Keep history keeps them again', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, logWords, recordSession } = await launch()
    const event = recordSession(take)
    stage.settings.history.retentionDays = 30
    logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, event?.at)
    expect(readFileSync(file(), 'utf8')).not.toContain('again')
    expect(lines()[0].sealed).toEqual(expect.any(String))
    expect(eventToPaste()?.finalText).toBe('Said again.')
  })

  it('becomes a new entry when Clear all took the old one', async () => {
    const { logWords } = await launch()
    logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, NOW)
    expect(lines()).toHaveLength(1)
  })
})

describe('the 24 hour hold', () => {
  it('removes a held recording past its limit at launch, and nothing else', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const pastDue = saveTake(NOW - DAY - 1, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW - DAY })
    const young = saveTake(NOW - DAY + 60_000, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW })
    const failed = saveTake(NOW - 5 * DAY, { failure: { kind: 'network', detail: 'x' } })
    await launch()
    await vi.waitFor(() => expect(existsSync(pastDue)).toBe(false))
    expect(existsSync(young)).toBe(true)
    expect(existsSync(failed)).toBe(true)
  })

  it('holds whatever Keep history is set to, even forever', async () => {
    stage.settings.history.retentionDays = 0
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const pastDue = saveTake(NOW - DAY - 1, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW - DAY })
    await launch()
    await vi.waitFor(() => expect(existsSync(pastDue)).toBe(false))
  })

  it('removes a held recording on the slow timer while murmur stays open', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const held = saveTake(NOW - 1000, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW })
    await launch()
    await new Promise((resolve) => setImmediate(resolve))
    expect(existsSync(held)).toBe(true)
    clock.mockReturnValue(NOW + DAY)
    const fifteenMinutes = intervals.mock.calls.filter(([, ms]) => ms === 15 * 60 * 1000)
    for (const [tick] of fifteenMinutes) (tick as () => void)()
    await vi.waitFor(() => expect(existsSync(held)).toBe(false))
  })

  it('waits for a recording that is being retried', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const pastDue = saveTake(NOW - DAY - 1, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW - DAY })
    stage.retrying.add(`recovery-${NOW - DAY - 1}`)
    await launch()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(existsSync(pastDue)).toBe(true)
  })
})

describe('starting', () => {
  it('survives the line that once stopped launch, and every handler registers', async () => {
    stage.settings.history.retentionDays = 0
    writeFileSync(file(), '{"at":1,"durationMs":1000,"rawText":"","finalText":"","words":2,"wpm":120,"sealed":5}\n')
    const { readHistory } = await launch()
    expect(readHistory()[0]).toMatchObject({ at: 1, words: 2 })
    expect(stage.handlers.has('history:list')).toBe(true)
  })

  it('still registers every handler when the log cannot be read', async () => {
    mkdirSync(file())
    await launch()
    expect(stage.handlers.has('history:list')).toBe(true)
    expect(stage.handlers.has('history:clear')).toBe(true)
  })

  it('follows the switch while running', async () => {
    const { recordSession } = await launch()
    recordSession(take)
    stage.settings.history.encrypt = false
    for (const listener of stage.listeners) listener(stage.settings)
    expect(readFileSync(file(), 'utf8')).toContain('marked')
    stage.settings.history.encrypt = true
    for (const listener of stage.listeners) listener(stage.settings)
    expect(readFileSync(file(), 'utf8')).not.toContain('marked')
  })
})
