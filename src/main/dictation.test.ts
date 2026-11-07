// SPDX-License-Identifier: GPL-3.0-only
// Which takes hold their recording, and when a paste lets one go, with
// the capture, delivery, and history around dictation stood in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_NO_TEXT } from '../shared/history'
import { deliverRetried, dictationStart, dictationStop, holdRecording, lastTakeHeld, pasteLastDictation } from './dictation'

const stage = vi.hoisted(() => ({
  retentionDays: 90,
  phase: 'idle',
  event: { at: 123, words: 2, wpm: 100, finalText: 'hello there', rawText: 'hello there' },
  insert: 'inserted' as string | Error,
  logFails: false,
  noteSaved: { ok: false } as object
}))

const mocks = vi.hoisted(() => ({
  saveTakeForRetry: vi.fn(),
  releaseHeldTake: vi.fn(),
  heldTakeSaved: vi.fn(),
  performTransform: vi.fn(),
  clipboardWrite: vi.fn(),
  playCue: vi.fn(),
  recordSession: vi.fn(),
  logWords: vi.fn()
}))

vi.mock('electron', () => ({ clipboard: { writeText: mocks.clipboardWrite } }))
vi.mock('./audio', () => ({
  cancelRecording: vi.fn(),
  playCue: mocks.playCue,
  rearmCapture: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(async () => new Uint8Array(48).fill(1))
}))
vi.mock('../shared/wav', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/wav')>()),
  wavSamples: () => new Float32Array(16000)
}))
vi.mock('../shared/speech-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/speech-gate')>()),
  checkSpeech: () => ({ speech: true, voicedMs: 900, steadyMs: 900 })
}))
vi.mock('./formatter', () => ({ maybePolish: async (text: string) => text, resolveTransformConnection: () => ({}) }))
vi.mock('./settings', () => ({
  getSettings: () => ({
    dictionary: [],
    expansions: [],
    formatting: { level: 'off', numbers: 'auto', smartLists: false },
    hotkey: { mode: 'hold' },
    history: { retentionDays: stage.retentionDays }
  })
}))
vi.mock('./insertion', () => ({
  insertText: vi.fn(async () => {
    if (stage.insert instanceof Error) throw stage.insert
    return stage.insert
  })
}))
vi.mock('./notes', () => ({ notesConfigured: () => true, saveNote: () => stage.noteSaved }))
vi.mock('./notes/receipt', () => ({ noteSaved: vi.fn(), sortWithReceipt: vi.fn(async () => undefined) }))
vi.mock('./notes/sorter', () => ({ rememberForSort: vi.fn() }))
vi.mock('./overlay', () => ({
  getOverlayPhase: () => stage.phase,
  getOverlayState: vi.fn(),
  refreshOverlayConfig: vi.fn(),
  setOverlayPhase: (phase: string) => {
    stage.phase = phase
    return true
  },
  showOverlayHint: vi.fn()
}))
vi.mock('./transcribe', () => ({
  SMOKE_TRANSCRIPT: 'smoke',
  saveTakeForRetry: mocks.saveTakeForRetry,
  transcribeWav: async () => ({ ok: true, text: 'hello there' })
}))
vi.mock('./transform', () => ({ TRANSFORM_NO_CONNECTION_HINT: 'x', performTransform: mocks.performTransform }))
vi.mock('./smoke', () => ({ isSmoke: false, registerSmokeCheck: vi.fn() }))
vi.mock('./hotkeys', () => ({ waitForModifiersReleased: async () => true }))
const appLog = vi.hoisted(() => vi.fn())
vi.mock('./window-watch', () => ({ writeAppLog: appLog }))
vi.mock('./retry', () => ({ releaseHeldTake: mocks.releaseHeldTake }))
vi.mock('./history', () => ({
  eventToPaste: () => stage.event,
  heldTakeSaved: mocks.heldTakeSaved,
  isMemoryOnly: () => true,
  logWords: mocks.logWords,
  recordSession: mocks.recordSession
}))

const held = (kind: string, detail: string): object =>
  expect.objectContaining({ kind, loggedAt: 123, failure: { kind: 'held', detail } })

async function take(kind: 'dictation' | 'note' | 'transform', opts: { save?: 'silence' } = {}): Promise<string> {
  stage.phase = 'idle'
  expect(dictationStart(kind)).toBe(true)
  return dictationStop(kind, opts)
}

beforeEach(() => {
  vi.clearAllMocks()
  stage.retentionDays = KEEP_NO_TEXT
  stage.phase = 'idle'
  stage.insert = 'inserted'
  stage.logFails = false
  stage.noteSaved = { ok: false }
  const logged = (): typeof stage.event => {
    if (stage.logFails) throw new Error('disk full')
    return stage.event
  }
  mocks.recordSession.mockImplementation(logged)
  mocks.logWords.mockImplementation(logged)
  mocks.saveTakeForRetry.mockReturnValue('/recovery/take.wav')
})

describe('holdRecording', () => {
  const wav = new Uint8Array(4)

  it("holds under Don't keep and joins the watch", async () => {
    holdRecording(wav, 'dictation', 1, 123, 'silence')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(wav, { kind: 'dictation', startedAt: 1, loggedAt: 123, failure: { kind: 'held', detail: 'silence' } })
    await vi.waitFor(() => expect(mocks.heldTakeSaved).toHaveBeenCalled())
  })

  it('stays off under every other Keep history setting', () => {
    for (const days of [1, 30, 90, 365, 0]) {
      stage.retentionDays = days
      holdRecording(wav, 'dictation', 1, 123, 'silence')
    }
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })

  it('holds nothing without an entry, and a failed save costs nothing', () => {
    holdRecording(wav, 'dictation', 1, undefined, 'silence')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
    mocks.saveTakeForRetry.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    expect(() => holdRecording(wav, 'dictation', 1, 123, 'silence')).not.toThrow()
  })
})

describe("takes under Don't keep", () => {
  it('holds a hands-free take that stopped on its own', async () => {
    expect(await take('dictation', { save: 'silence' })).toBe('delivered')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), held('dictation', 'silence'))
  })

  it('promises no recording when the cap took it straight back', async () => {
    mocks.saveTakeForRetry.mockReturnValue(null)
    expect(await take('dictation', { save: 'silence' })).toBe('delivered')
    expect(lastTakeHeld()).toBe(false)
    expect(mocks.heldTakeSaved).not.toHaveBeenCalled()
  })

  it('forgets the last hold when the next take starts', async () => {
    await take('dictation', { save: 'silence' })
    expect(lastTakeHeld()).toBe(true)
    await take('dictation')
    expect(lastTakeHeld()).toBe(false)
  })

  it('keeps a note the file and the log both refused', async () => {
    stage.logFails = true
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    expect(await take('note')).toBe('retry')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ kind: 'note', failure: expect.objectContaining({ kind: 'unlogged' }) })
    )
  })

  it('a filed note needs no log to count as delivered', async () => {
    stage.noteSaved = { ok: true, relative: 'inbox.md', location: 'folder' }
    stage.logFails = true
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    expect(await take('note')).toBe('delivered')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })

  it('holds no recording for a take that reached an app', async () => {
    expect(await take('dictation')).toBe('delivered')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })

  it('holds no recording when a failed paste left the words on the clipboard', async () => {
    stage.insert = 'copied'
    expect(await take('dictation')).toBe('delivered')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })

  it('holds a note neither folder could take', async () => {
    expect(await take('note')).toBe('logged')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), held('note', 'note-failed'))
    expect(lastTakeHeld()).toBe(true)
  })

  it('holds no recording for a note that was filed', async () => {
    stage.noteSaved = { ok: true, relative: 'inbox.md', location: 'folder' }
    expect(await take('note')).toBe('delivered')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })

  it('holds a too-long transform for the entry it logged', async () => {
    mocks.performTransform.mockImplementationOnce(async (deps: { onUnsent: (event: object) => void }) => {
      deps.onUnsent({ at: 123 })
      return 'too-long'
    })
    expect(await take('transform')).toBe('failed')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), held('transform', 'too-long'))
  })

  it('keeps a transform the log refused on the Retry list', async () => {
    mocks.performTransform.mockImplementationOnce(async () => 'unlogged')
    expect(await take('transform')).toBe('retry')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ kind: 'transform', failure: expect.objectContaining({ kind: 'unlogged' }) })
    )
    await vi.waitFor(() => expect(appLog).toHaveBeenCalledWith('[dictation] unlogged kind=transform kept=true'))
  })

  it('under other settings the same takes hold nothing', async () => {
    stage.retentionDays = 30
    mocks.performTransform.mockImplementationOnce(async (deps: { onUnsent: (event: object) => void }) => {
      deps.onUnsent({ at: 123 })
      return 'too-long'
    })
    await take('dictation', { save: 'silence' })
    await take('note')
    await take('transform')
    expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
  })
})

describe('paste-last', () => {
  it('releases the held recording once the paste lands', async () => {
    await pasteLastDictation()
    expect(mocks.releaseHeldTake).toHaveBeenCalledWith(123)
  })

  it('keeps it when the words only reached the clipboard', async () => {
    stage.insert = 'copied'
    await pasteLastDictation()
    expect(mocks.releaseHeldTake).not.toHaveBeenCalled()
  })

  it("has nothing to release outside Don't keep", async () => {
    stage.retentionDays = 30
    await pasteLastDictation()
    expect(mocks.releaseHeldTake).not.toHaveBeenCalled()
  })
})

describe('a take that could not be pasted or logged, on every Keep history value', () => {
  const VALUES = [KEEP_NO_TEXT, 1, 30, 90, 365, 0]
  const unlogged = expect.objectContaining({ kind: 'dictation', failure: expect.objectContaining({ kind: 'unlogged' }) })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  for (const days of VALUES) {
    describe(`Keep history ${days}`, () => {
      beforeEach(() => {
        stage.retentionDays = days
      })

      it('a paste that throws logs the words, keeps the error pill, and leaves the clipboard alone', async () => {
        stage.insert = new Error('clipboard refused')
        expect(await take('dictation')).toBe('logged')
        expect(mocks.recordSession).toHaveBeenCalledTimes(1)
        expect(stage.phase).toBe('error')
        expect(mocks.playCue).toHaveBeenLastCalledWith('error')
        expect(mocks.clipboardWrite).not.toHaveBeenCalled()
        if (days === KEEP_NO_TEXT) {
          expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), held('dictation', 'paste-failed'))
        } else {
          expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
        }
      })

      it('an error outcome is treated the same as a throw', async () => {
        stage.insert = 'error'
        expect(await take('dictation')).toBe('logged')
        expect(mocks.recordSession).toHaveBeenCalledTimes(1)
        expect(stage.phase).toBe('error')
      })

      it('a paste and a log that both fail keep the recording plainly', async () => {
        stage.insert = new Error('clipboard refused')
        stage.logFails = true
        expect(await take('dictation')).toBe('retry')
        expect(mocks.saveTakeForRetry).toHaveBeenCalledTimes(1)
        expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), unlogged)
        expect(stage.phase).toBe('error')
      })

      it('a log that fails on the save path keeps the recording plainly', async () => {
        stage.logFails = true
        expect(await take('dictation', { save: 'silence' })).toBe('retry')
        expect(mocks.saveTakeForRetry).toHaveBeenCalledTimes(1)
        expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), unlogged)
        expect(stage.phase).toBe('error')
        expect(mocks.clipboardWrite).not.toHaveBeenCalled()
      })

      it('a log that fails after the paste landed shows no error, since the text landed', async () => {
        stage.logFails = true
        expect(await take('dictation')).toBe('delivered')
        expect(stage.phase).toBe('inserted')
        expect(mocks.playCue).toHaveBeenLastCalledWith('insert')
        expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
      })

      it('the success path is what it was', async () => {
        expect(await take('dictation')).toBe('delivered')
        expect(mocks.recordSession).toHaveBeenCalledTimes(1)
        expect(stage.phase).toBe('inserted')
        expect(mocks.saveTakeForRetry).not.toHaveBeenCalled()
        expect(mocks.clipboardWrite).not.toHaveBeenCalled()
      })
    })
  }

  it('says so when even the recording could not be kept', async () => {
    stage.logFails = true
    mocks.saveTakeForRetry.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    expect(await take('dictation', { save: 'silence' })).toBe('failed')
    expect(stage.phase).toBe('error')
  })

  it('reads a null event from the log as a failure too', async () => {
    mocks.recordSession.mockReturnValue(null)
    expect(await take('dictation', { save: 'silence' })).toBe('retry')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), unlogged)
  })
})

describe('a retry', () => {
  const retried = (loggedAt?: number): Parameters<typeof deliverRetried>[0] => ({
    kind: 'dictation',
    startedAt: 1,
    savedAt: 2,
    ...(loggedAt === undefined ? {} : { loggedAt })
  })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("holds the recording under Don't keep, for the entry the words went to", async () => {
    expect(await deliverRetried(retried(), 'hello there')).toMatchObject({ ok: true, location: 'log', heldAt: 123 })
  })

  it('lets it go under every other setting', async () => {
    for (const days of [1, 30, 90, 365, 0]) {
      stage.retentionDays = days
      expect(await deliverRetried(retried(), 'hello there')).toMatchObject({ ok: true, heldAt: null })
    }
  })

  it('goes back on the held entry when it has one', async () => {
    await deliverRetried(retried(123), 'hello there')
    expect(mocks.logWords).toHaveBeenCalledWith(expect.objectContaining({ rawText: 'hello there' }), 123)
    expect(mocks.recordSession).not.toHaveBeenCalled()
  })

  it('counts a null event as a failure, so the audio stays', async () => {
    mocks.recordSession.mockReturnValue(null)
    expect(await deliverRetried(retried(), 'hello there')).toEqual({ ok: false, failure: expect.objectContaining({ kind: 'unlogged' }) })
  })

  it('counts a log that throws as a failure', async () => {
    stage.logFails = true
    expect(await deliverRetried(retried(), 'hello there')).toMatchObject({ ok: false })
    expect(await deliverRetried({ ...retried(), kind: 'transform' }, 'hello there')).toMatchObject({ ok: false })
  })

  it('a filed note lets the recording go, under any setting', async () => {
    stage.noteSaved = { ok: true, relative: 'inbox.md', location: 'folder' }
    expect(await deliverRetried({ ...retried(), kind: 'note' }, 'hello there')).toMatchObject({ ok: true, heldAt: null, location: 'folder' })
  })

  it('a note no folder took stays held, and fails with no log either', async () => {
    expect(await deliverRetried({ ...retried(), kind: 'note' }, 'hello there')).toMatchObject({ ok: true, heldAt: 123, location: 'history' })
    stage.logFails = true
    expect(await deliverRetried({ ...retried(), kind: 'note' }, 'hello there')).toMatchObject({ ok: false })
  })
})
