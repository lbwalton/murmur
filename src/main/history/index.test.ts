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
  retrying: new Set<string>(),
  readPaintings: (() => []) as () => unknown[],
  userData: null as string | null
}))

const mocks = vi.hoisted(() => ({ writeAppLog: vi.fn() }))

vi.mock('electron', () => ({
  Notification: { isSupported: () => false },
  app: { getPath: () => stage.userData ?? stage.dir },
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
vi.mock('../paintings', () => ({
  clearPaintings: vi.fn(),
  initPaintings: (read: () => unknown[]) => {
    stage.readPaintings = read
  },
  syncPaintingsWith: vi.fn()
}))
vi.mock('../transcribe', () => ({ recoveryDir: () => join(stage.dir, 'recovery') }))
vi.mock('../retry', () => ({ isRetrying: (id: string) => stage.retrying.has(id), recoveryChanged: vi.fn() }))
vi.mock('../window-watch', () => ({ writeAppLog: mocks.writeAppLog }))
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
  stage.userData = null
  mocks.writeAppLog.mockClear()
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

describe('reading only numbers', () => {
  it('stats, paintings, and the entry count open nothing', async () => {
    const { readStatsHistory, recordSession } = await launch()
    recordSession(take)
    const { WordSeal } = await import('./seal')
    const open = vi.spyOn(WordSeal.prototype, 'open')
    expect(readStatsHistory()).toHaveLength(1)
    expect(stage.readPaintings()).toHaveLength(1)
    expect((stage.handlers.get('history:count') as () => number)()).toBe(1)
    expect(open).not.toHaveBeenCalled()
  })
})

describe("this session's words under Don't keep", () => {
  it('lets the oldest go past the cap of 200', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { readHistory, recordSession } = await launch()
    for (let i = 0; i < 201; i += 1) recordSession({ ...take, at: NOW + i })
    const words = readHistory().map((event) => event.finalText)
    expect(words[0]).toBe('')
    expect(words[1]).toBe('The marked words.')
    expect(words[200]).toBe('The marked words.')
  })

  it('stop showing and pasting past the cutoff when Keep history moves to 24 hours', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, readHistory, recordSession, wordsInMemory } = await launch()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    recordSession({ ...take, at: NOW - 2 * DAY })
    recordSession({ ...take, at: NOW - 1000 })
    stage.settings.history.retentionDays = 1
    expect(readHistory().map((event) => event.finalText)).toEqual(['', 'The marked words.'])
    expect(wordsInMemory(NOW - 2 * DAY)).toBe(false)
    recordSession({ ...take, at: NOW - 500, finalText: '' })
    expect(eventToPaste()?.finalText).not.toBe('The marked words.')
  })

  it("stay for as long as Don't keep stays, however old they get", async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { readHistory, recordSession } = await launch()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    recordSession({ ...take, at: NOW - 2 * DAY })
    expect(readHistory()[0].finalText).toBe('The marked words.')
  })

  it('answers whether a held take still has its words here', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const first = await launch()
    first.recordSession(take)
    expect(first.wordsInMemory(NOW)).toBe(true)
    const second = await launch()
    expect(second.wordsInMemory(NOW)).toBe(false)
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

  it('gives way to a memory-only entry too', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { eventToPaste, logWords, recordSession } = await launch()
    const event = recordSession(take)
    recordSession({ ...take, at: NOW + 1000, rawText: 'newer', finalText: 'Newer.' })
    logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, event?.at)
    recordSession({ ...take, at: NOW + 2000, rawText: 'only here', finalText: 'Only here.', persist: false })
    expect(eventToPaste()?.finalText).toBe('Only here.')
  })

  it('leaves its session words in place when the file could not take the new ones', async () => {
    stage.settings.history.retentionDays = KEEP_NO_TEXT
    const { logWords, readHistory, recordSession } = await launch()
    const event = recordSession(take)
    stage.settings.history.retentionDays = 30
    const { HistoryLog } = await import('./log')
    vi.spyOn(HistoryLog.prototype, 'fillWords').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    expect(() => logWords({ ...take, rawText: 'said again', finalText: 'Said again.' }, event?.at)).toThrow('disk full')
    expect(readHistory()[0].finalText).toBe('The marked words.')
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

  it('a log that cannot be read reads as no stats, with a line in the log and no throw', async () => {
    mkdirSync(file())
    const lines = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { readStatsHistory } = await launch()
    expect(readStatsHistory()).toEqual([])
    expect(stage.handlers.has('history:clear')).toBe(true)
    expect(lines).toHaveBeenCalledWith('[murmur] could not read the log for stats: EISDIR')
  })

  it('a failed rewrite on a Keep history change skips nothing and throws nothing', async () => {
    const { recordSession } = await launch()
    recordSession(take)
    rmSync(file())
    mkdirSync(file())
    const later = vi.fn()
    stage.listeners.push(later)
    stage.settings.history.retentionDays = 30
    expect(() => {
      for (const listener of stage.listeners) listener(stage.settings)
    }).not.toThrow()
    expect(later).toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.writeAppLog).toHaveBeenCalledWith(expect.stringContaining('could not apply Keep history')))
    expect(mocks.writeAppLog.mock.calls.flat().join(' ')).not.toContain('marked')
  })

  it('a failed rewrite on the 15 minute check throws nothing', async () => {
    stage.settings.history.retentionDays = 1
    const intervals = vi.spyOn(globalThis, 'setInterval')
    await launch()
    mkdirSync(file(), { recursive: true })
    const fifteenMinutes = intervals.mock.calls.filter(([, ms]) => ms === 15 * 60 * 1000)
    expect(fifteenMinutes.length).toBeGreaterThan(0)
    expect(() => {
      for (const [tick] of fifteenMinutes) (tick as () => void)()
    }).not.toThrow()
    await vi.waitFor(() => expect(mocks.writeAppLog).toHaveBeenCalledWith(expect.stringContaining('could not apply Keep history')))
  })

  it('held recordings still go when history fails to start', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const pastDue = saveTake(NOW - DAY - 1, { failure: { kind: 'held', detail: 'idle' }, loggedAt: NOW - DAY })
    const blocked = join(stage.dir, 'a-file')
    writeFileSync(blocked, '')
    stage.userData = blocked
    await expect(launch()).rejects.toThrow()
    await vi.waitFor(() => expect(existsSync(pastDue)).toBe(false))
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
