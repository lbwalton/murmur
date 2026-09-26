// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWavPcm16 } from '../../shared/wav'
import {
  RECOVERY_KEEP,
  getRecovery,
  listRecovery,
  markRecoveryFailed,
  readRecoveryWav,
  removeRecovery,
  saveRecovery,
  wavDurationMs
} from './recovery'

let dir: string
const T = 1_790_000_000_000
const take = (startedAt: number) => ({
  kind: 'dictation' as const,
  startedAt,
  failure: { kind: 'auth', detail: 'no API key configured' }
})
/** A real 16 kHz mono PCM16 WAV of the given length. */
const wavOf = (ms: number) => encodeWavPcm16(new Float32Array((16000 * ms) / 1000), 16000)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-recovery-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('saveRecovery', () => {
  it('writes the wav bytes and returns the path', () => {
    const wav = new Uint8Array([82, 73, 70, 70])
    const file = saveRecovery(wav, dir, { now: () => T })
    expect(file.endsWith(`recovery-${T}.wav`)).toBe(true)
    expect(existsSync(file)).toBe(true)
    expect(Array.from(readFileSync(file))).toEqual([82, 73, 70, 70])
  })

  it('writes a record beside the audio for a live take', () => {
    saveRecovery(wavOf(500), dir, { now: () => T, take: take(T - 2000) })
    expect(JSON.parse(readFileSync(join(dir, `recovery-${T}.json`), 'utf8'))).toEqual(take(T - 2000))
  })

  it('prunes to the newest RECOVERY_KEEP takes, records included', () => {
    for (let i = 0; i < RECOVERY_KEEP + 5; i++) {
      saveRecovery(new Uint8Array([i]), dir, { now: () => T + i, take: take(T + i - 1000) })
    }
    const wavs = readdirSync(dir).filter((n) => n.endsWith('.wav')).sort()
    const records = readdirSync(dir).filter((n) => n.endsWith('.json')).sort()
    expect(wavs.length).toBe(RECOVERY_KEEP)
    expect(wavs[0]).toBe(`recovery-${T + 5}.wav`)
    expect(records).toEqual(wavs.map((n) => n.replace('.wav', '.json')))
  })

  it('drops a record whose audio is gone', () => {
    writeFileSync(join(dir, `recovery-${T}.json`), JSON.stringify(take(T)))
    saveRecovery(wavOf(100), dir, { now: () => T + 1 })
    expect(existsSync(join(dir, `recovery-${T}.json`))).toBe(false)
  })
})

describe('wavDurationMs', () => {
  it('reads the length from the header', () => {
    expect(wavDurationMs(wavOf(1500))).toBe(1500)
  })

  it('is zero for anything that is not a WAV', () => {
    expect(wavDurationMs(new Uint8Array([1, 2, 3]))).toBe(0)
    expect(wavDurationMs(new Uint8Array(64))).toBe(0)
  })
})

describe('listRecovery', () => {
  it('lists takes newest first with their records', () => {
    saveRecovery(wavOf(1000), dir, { now: () => T, take: take(T - 3000) })
    saveRecovery(wavOf(2000), dir, { now: () => T + 60_000, take: { ...take(T + 50_000), kind: 'note' } })
    const list = listRecovery(dir)
    expect(list.map((t) => t.id)).toEqual([`recovery-${T + 60_000}`, `recovery-${T}`])
    expect(list[0]).toEqual({
      id: `recovery-${T + 60_000}`,
      savedAt: T + 60_000,
      startedAt: T + 50_000,
      audioMs: 2000,
      kind: 'note',
      failure: { kind: 'auth', detail: 'no API key configured' }
    })
  })

  it('lists a take saved before records existed as a dictation', () => {
    writeFileSync(join(dir, `recovery-${T}.wav`), wavOf(4000))
    expect(listRecovery(dir)).toEqual([
      { id: `recovery-${T}`, savedAt: T, startedAt: T - 4000, audioMs: 4000, kind: 'dictation', failure: null }
    ])
  })

  it('is empty when the folder does not exist yet', () => {
    expect(listRecovery(join(dir, 'missing'))).toEqual([])
  })
})

describe('one take', () => {
  it('reads the audio back and records a new failure', () => {
    saveRecovery(wavOf(300), dir, { now: () => T, take: take(T - 1000) })
    const id = `recovery-${T}`
    expect(readRecoveryWav(dir, id)).toEqual(wavOf(300))
    markRecoveryFailed(dir, id, { kind: 'network', detail: 'fetch failed' })
    expect(getRecovery(dir, id)?.failure).toEqual({ kind: 'network', detail: 'fetch failed' })
    expect(getRecovery(dir, id)?.startedAt).toBe(T - 1000)
  })

  it('gives a legacy take a record when a retry fails', () => {
    writeFileSync(join(dir, `recovery-${T}.wav`), wavOf(1000))
    markRecoveryFailed(dir, `recovery-${T}`, { kind: 'timeout', detail: 'no response' })
    expect(getRecovery(dir, `recovery-${T}`)).toMatchObject({ kind: 'dictation', startedAt: T - 1000 })
  })

  it('removes the audio and the record', () => {
    saveRecovery(wavOf(300), dir, { now: () => T, take: take(T - 1000) })
    removeRecovery(dir, `recovery-${T}`)
    expect(readdirSync(dir)).toEqual([])
    expect(getRecovery(dir, `recovery-${T}`)).toBeNull()
  })

  it('refuses any id that could leave the folder', () => {
    for (const bad of ['../secret', `recovery-${T}/../../x`, 'recovery-', 'notes', `recovery-${T}.wav`]) {
      expect(getRecovery(dir, bad)).toBeNull()
      expect(() => readRecoveryWav(dir, bad)).toThrow()
      expect(() => removeRecovery(dir, bad)).toThrow()
    }
  })
})
