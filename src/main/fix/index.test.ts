// SPDX-License-Identifier: GPL-3.0-only
// Fix a word (US-184), the flow itself with the keystrokes, the panel
// window and the stores stood in: 1 run at a time, only the question on
// screen can be answered, what the pill says follows what happened, and
// every path that does not fix a word leaves the dictionary alone.
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readSelection: vi.fn(),
  insertText: vi.fn(),
  teachPair: vi.fn(),
  hint: vi.fn(),
  cue: vi.fn(),
  appLog: vi.fn(),
  phase: 'idle' as string,
  modifiersUp: true,
  on: new Map<string, (...args: unknown[]) => void>(),
  windows: [] as unknown[],
  loads: true,
  takesKeyboard: true,
  last: null as { rawText: string; finalText: string } | null
}))

class FakeWindow extends EventEmitter {
  destroyed = false
  shown = false
  focused = false
  sent: Array<[string, unknown]> = []
  webContents = Object.assign(new EventEmitter(), {
    send: (channel: string, payload: unknown) => void this.sent.push([channel, payload]),
    focus: () => undefined,
    getURL: () => 'file:///renderer/fix/index.html'
  })
  constructor(readonly options: Record<string, unknown>) {
    super()
    mocks.windows.push(this)
    queueMicrotask(() => this.webContents.emit(mocks.loads ? 'did-finish-load' : 'did-fail-load'))
  }
  setAlwaysOnTop(): void {}
  loadFile(): Promise<void> {
    return Promise.resolve()
  }
  loadURL(): Promise<void> {
    return Promise.resolve()
  }
  setBounds(): void {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  isFocused(): boolean {
    return this.focused
  }
  show(): void {
    this.shown = true
    this.focused = mocks.takesKeyboard
  }
  focus(): void {}
  hide(): void {
    this.shown = false
    this.focused = false
  }
  destroy(): void {
    this.destroyed = true
    this.emit('closed')
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  screen: {
    getCursorScreenPoint: () => ({ x: 400, y: 300 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })
  }
}))
vi.mock('../insertion', () => ({
  readSelection: mocks.readSelection,
  insertText: mocks.insertText,
  captureClipboard: vi.fn(),
  restoreClipboard: vi.fn()
}))
vi.mock('../learn', () => ({ teachPair: mocks.teachPair }))
vi.mock('../overlay', () => ({ getOverlayPhase: () => mocks.phase, showOverlayHint: mocks.hint }))
vi.mock('../audio', () => ({ playCue: mocks.cue }))
vi.mock('../hotkeys', () => ({ waitForModifiersReleased: async () => mocks.modifiersUp }))
vi.mock('../smoke', () => ({ registerSmokeCheck: vi.fn() }))
vi.mock('../window-watch', () => ({ devRendererUrl: () => undefined, watchWindow: vi.fn(), writeAppLog: mocks.appLog }))
vi.mock('../ipc', () => ({ ipc: { on: (channel: string, fn: (...args: unknown[]) => void) => mocks.on.set(channel, fn) } }))
vi.mock('../settings', () => ({ getSettings: () => ({ dictionary: [] }), updateSettings: vi.fn() }))
vi.mock('../history', () => ({ eventToPaste: () => mocks.last }))

const { fixWord, initFixWord, destroyFixWindow } = await import('./index')

const panel = (): FakeWindow => mocks.windows[mocks.windows.length - 1] as FakeWindow
const asked = (): { id: number; heard: string } => panel().sent[panel().sent.length - 1][1] as { id: number; heard: string }
const settle = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const logged = (): string => mocks.appLog.mock.calls.map((call) => String(call[0])).join('\n')
const selected = (text: string): void => void mocks.readSelection.mockResolvedValue({ ok: true, text })

beforeEach(() => {
  destroyFixWindow()
  vi.clearAllMocks()
  mocks.windows.length = 0
  mocks.phase = 'idle'
  mocks.modifiersUp = true
  mocks.loads = true
  mocks.takesKeyboard = true
  mocks.last = null
  selected('shiv on')
  mocks.insertText.mockResolvedValue('inserted')
  mocks.teachPair.mockReturnValue('added')
  initFixWord()
})

describe('the chord, start to finish', () => {
  it('reads the selection, asks in the panel, pastes the spelling and saves the pair', async () => {
    const run = fixWord()
    await vi.waitFor(() => expect(panel()?.shown).toBe(true))
    expect(asked()).toEqual({ id: expect.any(Number), heard: 'shiv on' })
    // The panel is 1 that can take the keyboard, sandboxed, with only its own bridge.
    expect(panel().options).toMatchObject({ frame: false, alwaysOnTop: true, skipTaskbar: true })
    expect(panel().options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
    mocks.on.get('fix:save')?.({}, asked().id, ' Siobhan ')
    expect(await run).toBe('fixed')
    expect(panel().shown).toBe(false)
    expect(mocks.insertText).toHaveBeenCalledWith('Siobhan')
    expect(mocks.teachPair).toHaveBeenCalledWith({ heard: 'shiv on', written: 'Siobhan' }, undefined)
    expect(mocks.hint).toHaveBeenLastCalledWith('fixed and saved')
    expect(logged()).toContain('[fix] outcome=inserted dictionary=added')
    expect(logged()).not.toMatch(/shiv|Siobhan/i)
  })

  it('saves the transcript\'s own words when cleanup had changed the selected ones', async () => {
    mocks.last = { rawText: 'deploy it on cooper netties tonight please', finalText: 'Deploy it on Coopernetties tonight, please.' }
    selected('Coopernetties')
    expect(await fixWord({ ask: async () => 'Kubernetes' })).toBe('fixed')
    expect(mocks.teachPair).toHaveBeenCalledWith({ heard: 'cooper netties', written: 'Kubernetes' }, undefined)
  })

  it('runs 1 at a time: a second press while the first is still reading the selection does nothing', async () => {
    let release: (value: unknown) => void = () => undefined
    mocks.readSelection.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    const first = fixWord({ ask: async () => 'Siobhan' })
    await settle(5)
    expect(await fixWord({ ask: async () => 'Other' })).toBe('busy')
    expect(mocks.readSelection).toHaveBeenCalledTimes(1)
    release({ ok: true, text: 'shiv on' })
    expect(await first).toBe('fixed')
    // And while the panel is up.
    const open = fixWord()
    await vi.waitFor(() => expect(panel()?.shown).toBe(true))
    expect(await fixWord()).toBe('busy')
    mocks.on.get('fix:cancel')?.({}, asked().id)
    expect(await open).toBe('cancelled')
  })

  it('does nothing while a take is recording or processing', async () => {
    for (const phase of ['recording', 'processing']) {
      mocks.phase = phase
      expect(await fixWord({ ask: async () => 'Siobhan' })).toBe('busy')
    }
    expect(mocks.readSelection).not.toHaveBeenCalled()
  })
})

describe('what opens the panel, and what does not', () => {
  it('says to select a word when nothing came back from the copy, and opens nothing', async () => {
    const ask = vi.fn(async () => 'x')
    mocks.readSelection.mockResolvedValue({ ok: false, reason: 'unchanged' })
    expect(await fixWord({ ask })).toBe('empty')
    mocks.readSelection.mockResolvedValue({ ok: false, reason: 'empty' })
    expect(await fixWord({ ask })).toBe('empty')
    expect(mocks.hint.mock.calls.map((call) => call[0])).toEqual(['select a word first', 'select a word first'])
    mocks.readSelection.mockResolvedValue({ ok: false, reason: 'keystroke' })
    expect(await fixWord({ ask })).toBe('unreadable')
    expect(mocks.hint).toHaveBeenLastCalledWith('could not read the selection')
    selected('2 lines\nof text')
    expect(await fixWord({ ask })).toBe('long')
    selected('x'.repeat(81))
    expect(await fixWord({ ask })).toBe('long')
    expect(mocks.hint).toHaveBeenLastCalledWith('select 1 word or a short phrase')
    expect(ask).not.toHaveBeenCalled()
    expect(mocks.insertText).not.toHaveBeenCalled()
    expect(mocks.teachPair).not.toHaveBeenCalled()
    expect(mocks.windows).toHaveLength(0)
  })

  it('logs that the chord\'s modifiers were still down, and goes on', async () => {
    mocks.modifiersUp = false
    expect(await fixWord({ ask: async () => 'Siobhan' })).toBe('fixed')
    expect(logged()).toContain('[fix] modifiers still held; copying anyway')
  })
})

describe('answering the panel', () => {
  // The run is handed back in a box: a promise returned from an async
  // function would be waited on, and it ends only with an answer.
  const open = async (): Promise<{ run: Promise<string> }> => {
    const run = fixWord()
    await vi.waitFor(() => expect(panel()?.shown).toBe(true))
    return { run }
  }

  it('takes only the answer to the question on screen, by its own id, and only text of a sane length', async () => {
    const { run } = await open()
    const { id } = asked()
    mocks.on.get('fix:save')?.({}, id + 1, 'Forged')
    mocks.on.get('fix:save')?.({}, String(id), 'Forged')
    mocks.on.get('fix:save')?.({}, id, 7)
    mocks.on.get('fix:save')?.({}, id, 'x'.repeat(121))
    mocks.on.get('fix:cancel')?.({}, id + 1)
    await settle(5)
    expect(panel().shown).toBe(true)
    expect(mocks.insertText).not.toHaveBeenCalled()
    mocks.on.get('fix:save')?.({}, id, 'Siobhan')
    expect(await run).toBe('fixed')
    // An answer that arrives after the question closed changes nothing.
    mocks.on.get('fix:save')?.({}, id, 'Late')
    expect(mocks.insertText).toHaveBeenCalledTimes(1)
  })

  it('closes and changes nothing on Esc, a spelling that is the same, or an empty one', async () => {
    let { run } = await open()
    mocks.on.get('fix:cancel')?.({}, asked().id)
    expect(await run).toBe('cancelled')
    ;({ run } = await open())
    mocks.on.get('fix:save')?.({}, asked().id, 'shiv on')
    expect(await run).toBe('unchanged')
    ;({ run } = await open())
    mocks.on.get('fix:save')?.({}, asked().id, '   ')
    expect(await run).toBe('unchanged')
    expect(mocks.insertText).not.toHaveBeenCalled()
    expect(mocks.teachPair).not.toHaveBeenCalled()
    expect(mocks.hint).not.toHaveBeenCalled()
  })

  it('closes when the panel loses the keyboard: a click in another app, which sends a panel no blur', async () => {
    const { run } = await open()
    await settle(350)
    panel().focused = false
    expect(await run).toBe('cancelled')
    expect(panel().shown).toBe(false)
    expect(mocks.insertText).not.toHaveBeenCalled()
  })

  it('closes when a take starts, so the take never pastes into the panel', async () => {
    const { run } = await open()
    mocks.phase = 'recording'
    expect(await run).toBe('cancelled')
    expect(panel().shown).toBe(false)
  })

  it('gives way to a take that began as Enter was pressed', async () => {
    const { run } = await open()
    mocks.phase = 'processing'
    mocks.on.get('fix:save')?.({}, asked().id, 'Siobhan')
    expect(await run).toBe('cancelled')
    expect(mocks.insertText).not.toHaveBeenCalled()
    expect(mocks.teachPair).not.toHaveBeenCalled()
  })

  it('says so when the panel never gets the keyboard, or its page does not load', async () => {
    mocks.takesKeyboard = false
    expect(await fixWord()).toBe('nofocus')
    expect(mocks.hint).toHaveBeenLastCalledWith('could not open the fix box')
    expect(panel().shown).toBe(false)
    destroyFixWindow()
    mocks.takesKeyboard = true
    mocks.loads = false
    expect(await fixWord()).toBe('nofocus')
    expect(mocks.insertText).not.toHaveBeenCalled()
  })

  it('opens a new panel after its page dies, and answers the question that was open', async () => {
    const { run } = await open()
    const dead = panel()
    dead.webContents.emit('render-process-gone')
    expect(await run).toBe('cancelled')
    expect(dead.destroyed).toBe(true)
    const again = await open()
    expect(panel()).not.toBe(dead)
    mocks.on.get('fix:cancel')?.({}, asked().id)
    await again.run
  })
})

describe('what the pill says once a spelling was typed', () => {
  const fix = (): Promise<string> => fixWord({ ask: async () => 'Siobhan' })

  it('says the spelling waits on the clipboard only when it does: copy only mode, or a paste key that could not be pressed', async () => {
    mocks.insertText.mockResolvedValue('copied')
    expect(await fix()).toBe('copied')
    expect(mocks.hint).toHaveBeenLastCalledWith('saved, paste to fix')
    expect(mocks.cue).toHaveBeenLastCalledWith('insert')
  })

  it('says a full dictionary in copy only mode too, and never calls a pair saved that was not', async () => {
    mocks.insertText.mockResolvedValue('copied')
    mocks.teachPair.mockReturnValue('full')
    expect(await fix()).toBe('copied')
    expect(mocks.hint).toHaveBeenLastCalledWith('copied, your dictionary is full')
    mocks.insertText.mockResolvedValue('inserted')
    expect(await fix()).toBe('fixed')
    expect(mocks.hint).toHaveBeenLastCalledWith('fixed, your dictionary is full')
    mocks.teachPair.mockReturnValue('same')
    expect(await fix()).toBe('fixed')
    expect(mocks.hint).toHaveBeenLastCalledWith('fixed')
  })

  it('tells a paste that failed from a save that failed', async () => {
    mocks.insertText.mockRejectedValue(new Error('clipboard refused'))
    expect(await fix()).toBe('error')
    expect(mocks.hint).toHaveBeenLastCalledWith('saved, could not paste')
    expect(mocks.cue).toHaveBeenLastCalledWith('error')
    expect(mocks.teachPair).toHaveBeenCalledTimes(1)
    mocks.insertText.mockResolvedValue('inserted')
    mocks.teachPair.mockImplementation(() => {
      throw new Error('disk full')
    })
    expect(await fix()).toBe('error')
    expect(mocks.hint).toHaveBeenLastCalledWith('fixed, could not save')
    expect(logged()).toContain('[fix] could not save reason=Error')
    expect(logged()).not.toMatch(/shiv|Siobhan|disk full/i)
  })
})
