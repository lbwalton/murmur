// SPDX-License-Identifier: GPL-3.0-only
// What a retry does with a take's audio. It is the only copy until the
// words are safe, so every way out is covered with real files.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeWavPcm16 } from '../shared/wav'
import { initRetry, retryTake } from './retry'
import { getRecovery, saveRecovery } from './transcribe/recovery'

const stage = vi.hoisted(() => ({ dir: '' }))
const mocks = vi.hoisted(() => ({
  deliverRetried: vi.fn(),
  heldTakeSaved: vi.fn(),
  setWordsInMemoryCheck: vi.fn(),
  transcribeWav: vi.fn(),
  wordsInMemory: vi.fn()
}))

vi.mock('electron', () => ({ clipboard: {} }))
vi.mock('./ipc', () => ({ ipc: { handle: vi.fn() } }))
vi.mock('./dictation', () => ({ deliverRetried: mocks.deliverRetried }))
vi.mock('./history', () => ({ heldTakeSaved: mocks.heldTakeSaved, readHistory: () => [], wordsInMemory: mocks.wordsInMemory }))
vi.mock('./smoke', () => ({ isSmoke: false, registerSmokeCheck: vi.fn() }))
vi.mock('./window-watch', () => ({ writeAppLog: vi.fn() }))
vi.mock('./transcribe', () => ({
  recoveryDir: () => stage.dir,
  setRecoveryListener: vi.fn(),
  setWordsInMemoryCheck: mocks.setWordsInMemoryCheck,
  transcribeWav: mocks.transcribeWav
}))

const T = 1_790_000_000_000
const ID = `recovery-${T}`
const wav = encodeWavPcm16(new Float32Array(1600), 16000)
const save = (): void => {
  saveRecovery(wav, stage.dir, { now: () => T, take: { kind: 'dictation', startedAt: T - 500, failure: { kind: 'network', detail: 'x' } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  stage.dir = mkdtempSync(join(tmpdir(), 'murmur-retry-'))
  mocks.transcribeWav.mockResolvedValue({ ok: true, text: 'hello there' })
  save()
})

afterEach(() => {
  rmSync(stage.dir, { recursive: true, force: true })
})

describe('retryTake', () => {
  it('removes the audio once the words are safe', async () => {
    mocks.deliverRetried.mockResolvedValue({ ok: true, words: 2, location: 'log', heldAt: null })
    expect(await retryTake(ID)).toMatchObject({ ok: true })
    expect(existsSync(join(stage.dir, `${ID}.wav`))).toBe(false)
    expect(mocks.heldTakeSaved).not.toHaveBeenCalled()
  })

  it('holds the audio for the entry when the words are in memory only', async () => {
    mocks.deliverRetried.mockResolvedValue({ ok: true, words: 2, location: 'log', heldAt: 123 })
    expect(await retryTake(ID)).toMatchObject({ ok: true })
    expect(getRecovery(stage.dir, ID)).toMatchObject({ loggedAt: 123, failure: { kind: 'held' } })
    expect(mocks.heldTakeSaved).toHaveBeenCalled()
  })

  it('keeps the audio and says why when the log could not take the words', async () => {
    mocks.deliverRetried.mockResolvedValue({ ok: false, failure: { kind: 'unlogged', detail: 'the log could not be written' } })
    expect(await retryTake(ID)).toMatchObject({ ok: false })
    expect(getRecovery(stage.dir, ID)).toMatchObject({ failure: { kind: 'unlogged' } })
  })

  it('keeps the audio when delivery throws', async () => {
    mocks.deliverRetried.mockRejectedValue(new Error('disk full'))
    vi.spyOn(console, 'error').mockImplementationOnce(() => undefined)
    expect(await retryTake(ID)).toMatchObject({ ok: false })
    expect(existsSync(join(stage.dir, `${ID}.wav`))).toBe(true)
  })
})

describe('initRetry', () => {
  it('tells the cap which held takes still have their words in memory', () => {
    initRetry(() => null)
    expect(mocks.setWordsInMemoryCheck).toHaveBeenCalledWith(mocks.wordsInMemory)
  })
})
