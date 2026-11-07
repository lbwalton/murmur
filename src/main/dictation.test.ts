// SPDX-License-Identifier: GPL-3.0-only
// Which takes hold their recording, and when a paste lets one go, with
// the capture, delivery, and history around dictation stood in.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP_NO_TEXT } from '../shared/history'
import { dictationStart, dictationStop, holdRecording, pasteLastDictation } from './dictation'

const stage = vi.hoisted(() => ({
  retentionDays: 90,
  phase: 'idle',
  event: { at: 123, words: 2, wpm: 100, finalText: 'hello there', rawText: 'hello there' },
  insert: 'inserted',
  noteSaved: { ok: false } as object
}))

const mocks = vi.hoisted(() => ({
  saveTakeForRetry: vi.fn(),
  releaseHeldTake: vi.fn(),
  heldTakeSaved: vi.fn(),
  performTransform: vi.fn()
}))

vi.mock('electron', () => ({ clipboard: {} }))
vi.mock('./audio', () => ({
  cancelRecording: vi.fn(),
  playCue: vi.fn(),
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
vi.mock('./insertion', () => ({ insertText: vi.fn(async () => stage.insert) }))
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
vi.mock('./window-watch', () => ({ writeAppLog: vi.fn() }))
vi.mock('./retry', () => ({ releaseHeldTake: mocks.releaseHeldTake }))
vi.mock('./history', () => ({
  eventToPaste: () => stage.event,
  heldTakeSaved: mocks.heldTakeSaved,
  isMemoryOnly: () => true,
  logWords: () => stage.event,
  recordSession: () => stage.event
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
  stage.noteSaved = { ok: false }
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
    expect(await take('note')).toBe('failed')
    expect(mocks.saveTakeForRetry).toHaveBeenCalledWith(expect.any(Uint8Array), held('note', 'note-failed'))
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
