// SPDX-License-Identifier: GPL-3.0-only
// Learn from my fixes, the main process half (US-185), with a stand-in
// for the watcher process: when a watch starts and when it must not,
// what reaches the process and how, what is learned when it ends, and
// that nothing is learned from a watch that was stopped. The smoke run
// cannot paste, so this is where the watch path itself is held.
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'

interface FakeChild extends EventEmitter {
  stdin: { on: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  stdout: PassThrough
  kill: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  appLog: vi.fn(),
  sent: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: [] as Array<(settings: unknown) => void>,
  notices: [] as Array<{ title: string; body: string }>,
  settings: null as unknown
}))

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('electron', () => ({
  Notification: class {
    static isSupported = (): boolean => true
    constructor(options: { title: string; body: string }) {
      mocks.notices.push(options)
    }
    on(): void {}
    show(): void {}
    close(): void {}
  }
}))
vi.mock('../smoke', () => ({ isSmoke: false, registerSmokeCheck: vi.fn() }))
vi.mock('../window-watch', () => ({ writeAppLog: mocks.appLog }))
vi.mock('../ipc', () => ({
  ipc: { handle: (name: string, fn: (...args: unknown[]) => unknown) => mocks.handlers.set(name, fn), on: vi.fn() }
}))
vi.mock('../settings', () => ({
  getSettings: () => mocks.settings,
  onSettingsChanged: (fn: (settings: unknown) => void) => mocks.listeners.push(fn),
  updateSettings: (partial: Record<string, unknown>) => {
    const current = mocks.settings as Record<string, unknown>
    const next: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(partial)) {
      next[key] =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? { ...(current[key] as object), ...(value as object) }
          : value
    }
    mocks.settings = next
    for (const fn of mocks.listeners) fn(next)
    return next
  }
}))

const { initLearn, watchTake, stopWatching, clearLearned } = await import('./index')
const { updateSettings } = await import('../settings')
const { WATCH_SCRIPT } = await import('./watch-script')

const take = { raw: 'i met shiv on at the cafe today', final: 'I met shiv on at the cafe today. ' }
/** What the watcher prints for the fix: murmur's words that went, and the word in their place. */
const fixed: Array<[string, string]> = [['shiv on', 'Siobhan']]
const platform = process.platform
let dir = ''
let children: FakeChild[] = []

const settingsWith = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over })
const state = (): { suggestions: Array<{ heard: string; written: string; count: number }>; supported: boolean; keeps: boolean } =>
  mocks.handlers.get('learn:state')?.({}) as never
const say = (child: FakeChild, line: object): void => void child.stdout.write(`${JSON.stringify(line)}\n`)
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 15))
/** The watcher ends by itself, as it does when focus leaves the box. */
const end = async (child: FakeChild): Promise<void> => {
  await settle()
  child.emit('close', 0)
}
const logged = (): string => mocks.appLog.mock.calls.map((call) => String(call[0])).join('\n')

beforeAll(() => Object.defineProperty(process, 'platform', { value: 'darwin' }))
afterAll(() => Object.defineProperty(process, 'platform', { value: platform }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-learn-main-'))
  children = []
  mocks.listeners.length = 0
  mocks.notices.length = 0
  mocks.handlers.clear()
  mocks.appLog.mockClear()
  mocks.sent.mockClear()
  mocks.spawn.mockReset()
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter() as FakeChild
    child.stdin = { on: vi.fn(), end: vi.fn() }
    child.stdout = new PassThrough()
    child.kill = vi.fn()
    children.push(child)
    return child
  })
  mocks.settings = settingsWith({
    learn: { watch: true, fixBinding: '' },
    history: { ...DEFAULT_SETTINGS.history, encrypt: false, retentionDays: 90 }
  })
  initLearn({
    dir,
    wrap: { available: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => '' },
    settingsWindow: () => ({ isDestroyed: () => false, webContents: { send: mocks.sent } }) as never,
    openDictionary: () => undefined
  })
})
afterEach(() => {
  stopWatching()
  rmSync(dir, { recursive: true, force: true })
})

describe('when a watch starts', () => {
  it('never starts with the switch off, which is how murmur ships', () => {
    expect(DEFAULT_SETTINGS.learn.watch).toBe(false)
    updateSettings({ learn: { watch: false } } as never)
    watchTake(take)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('never starts when history keeps no text, on Windows, or for a take too short to learn from', () => {
    updateSettings({ history: { retentionDays: -1 } } as never)
    watchTake(take)
    updateSettings({ history: { retentionDays: 90 } } as never)
    watchTake({ raw: 'shiv on', final: 'Shiv on.' })
    Object.defineProperty(process, 'platform', { value: 'win32' })
    watchTake(take)
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(state().supported).toBe(true)
  })

  it('hands the words to the script on standard input, never on its command line', () => {
    watchTake(take)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    const [file, args, options] = mocks.spawn.mock.calls[0] as [string, string[], { stdio: string[] }]
    expect(file).toBe('/usr/bin/osascript')
    expect(args).toEqual(['-l', 'JavaScript', '-e', WATCH_SCRIPT])
    expect(args.join(' ')).not.toMatch(/shiv|cafe/)
    expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore'])
    const config = JSON.parse(String(children[0].stdin.end.mock.calls[0][0])) as Record<string, unknown>
    expect(config).toEqual({ text: 'I met shiv on at the cafe today.', seconds: 60, ownPid: process.pid, maxBox: 200_000 })
  })
})

describe('what a watch teaches', () => {
  it('counts the fix when the watch ends, suggests it after 2 takes, and logs counts and no words', async () => {
    watchTake(take)
    say(children[0], { s: 'watch' })
    say(children[0], { s: 'fixes', f: [['shiv on', 'Siob']] })
    say(children[0], { s: 'fixes', f: fixed })
    say(children[0], { s: 'end', why: 'focus' })
    await end(children[0])
    expect(state().suggestions).toEqual([])

    watchTake(take)
    say(children[1], { s: 'fixes', f: fixed })
    say(children[1], { s: 'end', why: 'anchor' })
    await end(children[1])
    expect(state().suggestions).toEqual([{ heard: 'shiv on', written: 'Siobhan', count: 2 }])
    expect(mocks.sent).toHaveBeenCalledWith('learn:changed', expect.objectContaining({ suggestions: [{ heard: 'shiv on', written: 'Siobhan', count: 2 }] }))

    // 1 notification, when the fix became a suggestion, and no word of it:
    // a notification stays in the system's list after murmur quits.
    expect(mocks.notices).toHaveLength(1)
    expect(`${mocks.notices[0].title} ${mocks.notices[0].body}`).not.toMatch(/shiv|Siobhan|→/i)

    expect(logged()).toContain('[learn] watch ended why=focus fixes=1 ready=0')
    expect(logged()).toContain('[learn] watch ended why=anchor fixes=1 ready=1')
    expect(logged()).not.toMatch(/shiv|Siob|cafe/i)
  })

  it('learns nothing from a take nobody touched, a box it refused, or a line that is not the watcher\'s', async () => {
    watchTake(take)
    say(children[0], { s: 'watch' })
    say(children[0], { s: 'end', why: 'time' })
    await end(children[0])
    watchTake(take)
    say(children[1], { s: 'skip', why: 'secure' })
    await end(children[1])
    watchTake(take)
    children[2].stdout.write('{"s":"fixes"}\nnot json\n{"s":"span","t":"I met Siobhan at the cafe today."}\n{"s":"other","f":[["shiv on","Siobhan"]]}\n')
    await end(children[2])
    watchTake(take)
    await end(children[3])
    watchTake(take)
    await end(children[4])
    expect(state().suggestions).toEqual([])
    expect(logged()).toContain('why=secure fixes=0')
  })

  it('takes no list of changes wider or longer than the watcher may print, and forgets a change that was undone', async () => {
    for (const child of [0, 1]) {
      watchTake(take)
      children[child].stdout.write(`${JSON.stringify({ s: 'fixes', f: [['shiv on', `Siobhan ${'x'.repeat(40)}`]] })}\n`)
      children[child].stdout.write(`${JSON.stringify({ s: 'fixes', f: [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']] })}\n`)
      await end(children[child])
    }
    expect(state().suggestions).toEqual([])
    for (const child of [2, 3]) {
      watchTake(take)
      say(children[child], { s: 'fixes', f: fixed })
      say(children[child], { s: 'fixes', f: [] })
      await end(children[child])
    }
    expect(state().suggestions).toEqual([])
  })

  it('counts only a change that is a spelling the transcript would have taken', async () => {
    for (const child of [0, 1]) {
      watchTake(take)
      // A meaning change, an everyday word, and words the take never held.
      say(children[child], { s: 'fixes', f: [['cafe', 'office'], ['today', 'Thursday'], ['zebra crossing', 'Zebra']] })
      await end(children[child])
    }
    expect(state().suggestions).toEqual([])
  })

  it('ends the watch on 1 take when the next is pasted, and keeps what the first one taught', async () => {
    watchTake(take)
    say(children[0], { s: 'fixes', f: fixed })
    await settle()
    watchTake(take)
    expect(children[0].kill).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
    say(children[1], { s: 'fixes', f: fixed })
    await end(children[1])
    // The first process closing late teaches nothing twice.
    children[0].emit('close', null)
    expect(state().suggestions).toEqual([{ heard: 'shiv on', written: 'Siobhan', count: 2 }])
    expect(logged()).toContain('why=next fixes=1')
  })
})

describe('stopping', () => {
  it('learns nothing from a watch cut off by turning the switch off, and forgets what was counted', async () => {
    watchTake(take)
    say(children[0], { s: 'fixes', f: fixed })
    await end(children[0])
    watchTake(take)
    say(children[1], { s: 'fixes', f: fixed })
    await settle()
    updateSettings({ learn: { watch: false } } as never)
    expect(children[1].kill).toHaveBeenCalled()
    children[1].emit('close', null)
    updateSettings({ learn: { watch: true } } as never)
    expect(state().suggestions).toEqual([])
    // And what it had counted is gone: 1 more take is the first again.
    watchTake(take)
    say(children[2], { s: 'fixes', f: fixed })
    await end(children[2])
    expect(state().suggestions).toEqual([])
  })

  it('lets go of a box when Keep history for is set to keep no text, and keeps no fix', async () => {
    watchTake(take)
    say(children[0], { s: 'fixes', f: fixed })
    await end(children[0])
    watchTake(take)
    say(children[1], { s: 'fixes', f: fixed })
    await settle()
    updateSettings({ history: { retentionDays: -1 } } as never)
    expect(children[1].kill).toHaveBeenCalled()
    expect(state().keeps).toBe(false)
    expect(state().suggestions).toEqual([])
    // The setting was the person's to turn off all along.
    expect((mocks.settings as Settings).learn.watch).toBe(true)
    updateSettings({ history: { retentionDays: 90 } } as never)
    expect(state().suggestions).toEqual([])
  })

  it('learns nothing from a watch cut off by quitting, and Clear all forgets the fixes', async () => {
    watchTake(take)
    say(children[0], { s: 'fixes', f: fixed })
    await end(children[0])
    watchTake(take)
    say(children[1], { s: 'fixes', f: fixed })
    await settle()
    stopWatching()
    expect(children[1].kill).toHaveBeenCalled()
    expect(state().suggestions).toEqual([])
    watchTake(take)
    say(children[2], { s: 'fixes', f: fixed })
    await end(children[2])
    expect(state().suggestions).toHaveLength(1)
    clearLearned()
    expect(state().suggestions).toEqual([])
  })
})

describe('answering a suggestion', () => {
  const suggest = async (): Promise<void> => {
    for (const child of [0, 1]) {
      watchTake(take)
      say(children[child], { s: 'fixes', f: fixed })
      await end(children[child])
    }
  }
  const answer = (heard: unknown, written: unknown, how: unknown): unknown =>
    mocks.handlers.get('learn:answer')?.({}, heard, written, how)

  it('adds only a pair murmur is in fact suggesting, and tells the settings window', async () => {
    await suggest()
    answer('anything', 'Else', 'add')
    answer('shiv on', 'Siobhan', 'wipe')
    answer(7, null, 'add')
    expect((mocks.settings as Settings).dictionary).toEqual([])
    answer('shiv on', 'Siobhan', 'add')
    expect((mocks.settings as Settings).dictionary).toEqual([{ from: 'shiv on', to: 'Siobhan' }])
    expect(mocks.sent).toHaveBeenCalledWith('settings:pushed', expect.objectContaining({ dictionary: [{ from: 'shiv on', to: 'Siobhan' }] }))
    expect(state().suggestions).toEqual([])
    expect(logged()).not.toMatch(/shiv|Siobhan/i)
  })

  it('stops asking about a pair that was turned down, however often it is seen', async () => {
    await suggest()
    answer('shiv on', 'Siobhan', 'dismiss')
    expect(state().suggestions).toEqual([])
    expect((mocks.settings as Settings).dictionary).toEqual([])
    watchTake(take)
    say(children[2], { s: 'fixes', f: fixed })
    await end(children[2])
    expect(state().suggestions).toEqual([])
  })
})
