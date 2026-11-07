// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, fsyncSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '../../shared/history'
import { KEEP_24_HOURS, KEEP_NO_TEXT } from '../../shared/history'
import { HistoryLog } from './log'
import { type KeyWrap, WordSeal } from './seal'

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, fsyncSync: vi.fn(real.fsyncSync), renameSync: vi.fn(real.renameSync) }
})

let dir: string
let file: string
let keys: string

beforeEach(() => {
  vi.mocked(fsyncSync).mockClear()
  vi.mocked(renameSync).mockClear()
  dir = mkdtempSync(join(tmpdir(), 'murmur-seal-'))
  file = join(dir, 'history.jsonl')
  keys = join(dir, 'history-keys.json')
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const MARKED = 'the marked sentence'

function take(at: number, words = MARKED): SessionEvent {
  return { at, durationMs: 4_000, rawText: words, finalText: `${words}.`, words: 3, wpm: 45, day: '2027-01-15', hour: 9 }
}

/** Stands in for safeStorage: a wrapped key opens only while the store
 *  holds the same secret, as a Keychain item does. */
function keychain(start: { available?: boolean; secret?: string } = {}): KeyWrap & { state: { available: boolean; secret: string } } {
  const state = { available: start.available ?? true, secret: start.secret ?? 'one' }
  return {
    state,
    available: () => state.available,
    encrypt: (plain) => Buffer.from(`${state.secret}:${plain}`),
    decrypt: (wrapped) => {
      const [secret, plain] = wrapped.toString().split(':')
      if (secret !== state.secret) throw new Error('Error while decrypting the ciphertext')
      return plain
    }
  }
}

function sealedLog(wrap: KeyWrap = keychain()): HistoryLog {
  const log = new HistoryLog(dir, new WordSeal(dir, wrap))
  log.setSealing(true)
  return log
}

describe('sealed history', () => {
  it('a marked sentence cannot be found in the file and still reads back', () => {
    const log = sealedLog()
    log.append(take(1))
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
    expect(log.readAll()[0]).toEqual(take(1))
  })

  it('keeps the numbers readable with no key at all', () => {
    sealedLog().append(take(1))
    const line = JSON.parse(readFileSync(file, 'utf8').trim()) as SessionEvent
    expect(line).toMatchObject({ at: 1, words: 3, wpm: 45, durationMs: 4_000, day: '2027-01-15', hour: 9, rawText: '', finalText: '' })
    expect(new HistoryLog(dir).readAll()[0]).toEqual({ ...take(1), rawText: '', finalText: '', unreadable: true })
  })

  it('leaves an entry with no words as it is', () => {
    const log = sealedLog()
    log.append({ ...take(1), rawText: '', finalText: '' })
    expect(readFileSync(file, 'utf8')).not.toContain('sealed')
  })

  it('migrates plain history once, and the next launch writes nothing', () => {
    const plain = new HistoryLog(dir)
    plain.append(take(1))
    plain.append(take(2))
    const log = sealedLog()
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
    expect(log.readAll().map((event) => event.finalText)).toEqual([`${MARKED}.`, `${MARKED}.`])
    const before = statSync(file).mtimeMs
    sealedLog()
    expect(statSync(file).mtimeMs).toBe(before)
  })

  it('a failed migration leaves the file whole, keeps working, and says so', () => {
    const plain = new HistoryLog(dir)
    plain.append(take(1))
    const before = readFileSync(file, 'utf8')
    const seal = new WordSeal(dir, keychain())
    vi.spyOn(seal, 'open').mockReturnValue(null)
    const log = new HistoryLog(dir, seal)
    expect(() => log.setSealing(true)).toThrow('did not open')
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(existsSync(`${file}.tmp`)).toBe(false)
    expect(log.readAll()).toEqual([take(1)])
    expect(log.sealStatus().pending).toBe(1)
  })

  it('a rename that fails leaves the file whole, with no copy beside it, and a later try works', () => {
    const plain = new HistoryLog(dir)
    plain.append(take(1))
    const before = readFileSync(file, 'utf8')
    const seal = new WordSeal(dir, keychain())
    seal.prepare()
    const log = new HistoryLog(dir, seal)
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    expect(() => log.setSealing(true)).toThrow('disk full')
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(existsSync(`${file}.tmp`)).toBe(false)
    expect(log.readAll()).toEqual([take(1)])
    expect(log.sealStatus().pending).toBe(1)
    log.setSealing(true)
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
    expect(log.sealStatus().pending).toBe(0)
  })

  it('a copy left beside the file by a cut short rewrite goes when sealing starts', () => {
    writeFileSync(`${file}.tmp`, `${JSON.stringify(take(1))}\n`)
    sealedLog()
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('a leftover copy never stands in for the file', () => {
    const plain = new HistoryLog(dir)
    plain.append(take(1))
    writeFileSync(`${file}.tmp`, `${JSON.stringify(take(9, 'stale copy'))}\n`)
    const log = sealedLog()
    expect(log.readAll()).toEqual([take(1)])
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  it('a new key that cannot be opened again is not used', () => {
    const wrap = keychain()
    wrap.decrypt = () => 'something else'
    const log = sealedLog(wrap)
    log.append(take(1))
    expect(readFileSync(file, 'utf8')).toContain('marked')
    expect(existsSync(keys)).toBe(false)
    expect(log.sealStatus().state).toBe('unavailable')
  })

  it('the switch opens every line in place, and seals them again', () => {
    const log = sealedLog()
    log.append(take(1))
    log.setSealing(false)
    expect(readFileSync(file, 'utf8')).toContain('marked')
    expect(readFileSync(file, 'utf8')).not.toContain('sealed')
    expect(log.sealStatus().state).toBe('plain')
    log.append(take(2))
    expect(log.readAll()).toEqual([take(1), take(2)])
    log.setSealing(true)
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
    expect(log.readAll()).toEqual([take(1), take(2)])
    expect(log.sealStatus()).toEqual({ state: 'sealed', unreadable: 0, pending: 0 })
  })

  it('without secure storage it keeps working, keeps the text as it was, and says so', () => {
    const wrap = keychain({ available: false })
    const log = sealedLog(wrap)
    log.append(take(1))
    expect(log.readAll()).toEqual([take(1)])
    expect(readFileSync(file, 'utf8')).toContain('marked')
    expect(log.sealStatus().state).toBe('unavailable')
    expect(existsSync(keys)).toBe(false)
    wrap.state.available = true
    sealedLog(wrap)
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
  })

  it('prunes and clears sealed lines', () => {
    const log = sealedLog()
    log.append(take(NOW - 40 * DAY))
    log.append(take(NOW - DAY))
    log.prune(30, () => NOW)
    expect(log.readAll().map((event) => event.at)).toEqual([NOW - DAY])
    log.clear()
    expect(log.readAll()).toEqual([])
  })

  it('takes sealed words out on the short limits and keeps the numbers', () => {
    const log = sealedLog()
    log.append(take(NOW - 2 * DAY))
    log.append(take(NOW - 1000))
    expect(log.countAffected(KEEP_24_HOURS, NOW)).toBe(1)
    log.applyRetention(KEEP_24_HOURS, () => NOW)
    expect(log.readAll().map((event) => event.finalText)).toEqual(['', `${MARKED}.`])
    expect(log.readAll()[0].words).toBe(3)
    expect(readFileSync(file, 'utf8').match(/sealed/g)).toHaveLength(1)
  })

  it('a sealed transform keeps its instruction count once its words go', () => {
    const log = sealedLog()
    log.append({ ...take(1, 'make this shorter please'), kind: 'transform' })
    log.applyRetention(KEEP_NO_TEXT, () => NOW)
    expect(log.readAll()[0]).toMatchObject({ rawText: '', instructionWords: 4 })
  })

  it('seals words put back on an entry', () => {
    const log = sealedLog()
    log.append({ ...take(1), rawText: '', finalText: '' })
    log.fillWords(1, 'said again', 'Said again.')
    expect(readFileSync(file, 'utf8')).not.toContain('again')
    expect(log.readAll()[0].finalText).toBe('Said again.')
  })

  it('measuring opens nothing, so stats after a take never pay for it', () => {
    const seal = new WordSeal(dir, keychain())
    const log = new HistoryLog(dir, seal)
    log.setSealing(true)
    log.append(take(1))
    const open = vi.spyOn(seal, 'open')
    expect(log.readNumbers().map((event) => event.words)).toEqual([3])
    expect(open).not.toHaveBeenCalled()
  })

  it('a sealed field that is not text leaves the numbers readable and stops nothing', () => {
    const line = '{"at":1,"durationMs":1000,"rawText":"","finalText":"","words":2,"wpm":120,"sealed":5}\n'
    writeFileSync(file, line)
    const log = sealedLog()
    expect(log.readAll()[0]).toMatchObject({ at: 1, words: 2, finalText: '' })
    expect(log.readAll()[0].unreadable).toBeUndefined()
    expect(log.readNumbers()).toHaveLength(1)
    expect(log.sealStatus().unreadable).toBe(0)
    log.prune(30, () => 2)
    expect(readFileSync(file, 'utf8')).not.toContain('sealed')
    expect(log.readAll()[0].words).toBe(2)
  })

  it('opening anything that is not a sealed line answers null', () => {
    const seal = new WordSeal(dir, keychain())
    seal.prepare()
    for (const sealed of [5, null, {}, [], '', 'a', 'a.b.c.d', '....']) {
      expect(seal.open({ ...take(1), sealed } as never)).toBeNull()
    }
  })

  it('a line moved or edited reads as no words, never as garbage', () => {
    const log = sealedLog()
    log.append(take(1))
    const line = JSON.parse(readFileSync(file, 'utf8').trim()) as SessionEvent
    writeFileSync(file, `${JSON.stringify({ ...line, at: 2 })}\n`)
    expect(log.readAll()[0]).toMatchObject({ at: 2, words: 3, finalText: '' })
    expect(log.sealStatus().unreadable).toBe(1)
  })
})

describe('the key on disk', () => {
  it('reaches the disk before the rename, and the folder after it, before any line is sealed', () => {
    const log = sealedLog()
    const synced = vi.mocked(fsyncSync).mock.invocationCallOrder
    const [renamed] = vi.mocked(renameSync).mock.invocationCallOrder
    expect(synced[0]).toBeLessThan(renamed)
    if (process.platform !== 'win32') expect(synced[1]).toBeGreaterThan(renamed)
    const synchronized = vi.mocked(fsyncSync).mock.calls.length
    log.append(take(1))
    expect(vi.mocked(fsyncSync).mock.calls.length).toBe(synchronized)
    expect(existsSync(`${keys}.tmp`)).toBe(false)
  })

  it('a key that cannot reach the disk seals nothing', () => {
    vi.mocked(fsyncSync).mockImplementationOnce(() => {
      throw new Error('disk failed')
    })
    const log = sealedLog()
    log.append(take(1))
    expect(existsSync(keys)).toBe(false)
    expect(readFileSync(file, 'utf8')).toContain('marked')
    expect(log.sealStatus().state).toBe('unavailable')
    log.setSealing(true)
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
  })

  it('keeps the key file private', () => {
    sealedLog()
    if (process.platform !== 'win32') expect(statSync(keys).mode & 0o777).toBe(0o600)
  })
})

describe('a lost key', () => {
  it('puts new words on a line no key opens, sealed under the key that works', () => {
    const wrap = keychain()
    sealedLog(wrap).append(take(1))
    wrap.state.secret = 'a new keychain'
    const lost = sealedLog(wrap)
    expect(lost.readAll()[0].unreadable).toBe(true)
    lost.fillWords(1, 'said again', 'Said again.')
    expect(readFileSync(file, 'utf8')).not.toContain('again')
    expect(lost.readAll()[0]).toMatchObject({ finalText: 'Said again.', words: 3 })
    expect(lost.readAll()[0].unreadable).toBeUndefined()
    expect(lost.sealStatus().unreadable).toBe(0)
  })

  it('marks a line no key opens on reading, and never stores the mark', () => {
    const wrap = keychain()
    sealedLog(wrap).append(take(1))
    wrap.state.secret = 'a new keychain'
    const lost = sealedLog(wrap)
    expect(lost.readAll()[0].unreadable).toBe(true)
    lost.prune(30, () => 2)
    expect(readFileSync(file, 'utf8')).not.toContain('unreadable')
  })

  it('reads as numbers, and no rewrite costs the sealed words', () => {
    const wrap = keychain()
    const log = sealedLog(wrap)
    log.append(take(NOW - 40 * DAY))
    log.append(take(NOW - DAY))
    wrap.state.secret = 'a new keychain'
    const lost = sealedLog(wrap)
    expect(lost.readAll().map((event) => event.finalText)).toEqual(['', ''])
    expect(lost.readAll().reduce((sum, event) => sum + event.words, 0)).toBe(6)
    expect(lost.sealStatus()).toEqual({ state: 'sealed', unreadable: 2, pending: 0 })
    lost.prune(30, () => NOW)
    lost.setSealing(false)
    lost.setSealing(true)
    wrap.state.secret = 'one'
    expect(sealedLog(wrap).readAll().map((event) => event.finalText)).toEqual([`${MARKED}.`])
  })

  it('never replaces a key: new lines get a new one, and both open once the old returns', () => {
    const wrap = keychain()
    sealedLog(wrap).append(take(1))
    wrap.state.secret = 'a new keychain'
    sealedLog(wrap).append(take(2))
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
    expect(JSON.parse(readFileSync(keys, 'utf8'))).toHaveLength(2)
    expect(sealedLog(wrap).readAll().map((event) => event.finalText)).toEqual(['', `${MARKED}.`])
    wrap.state.secret = 'one'
    expect(sealedLog(wrap).readAll()[0].finalText).toBe(`${MARKED}.`)
  })

  it('a history copied to another machine cannot be read there, and its numbers can', () => {
    sealedLog(keychain({ secret: 'this mac' })).append(take(1))
    const other = sealedLog(keychain({ secret: 'that mac' }))
    expect(other.readAll()[0]).toMatchObject({ words: 3, finalText: '' })
  })

  it('a missing key file costs words, not entries', () => {
    const wrap = keychain()
    sealedLog(wrap).append(take(1))
    renameSync(keys, `${keys}.gone`)
    expect(sealedLog(wrap).readAll()[0]).toMatchObject({ words: 3, finalText: '' })
  })

  it('sets a damaged key file aside and never writes over it', () => {
    writeFileSync(keys, 'not json')
    sealedLog().append(take(1))
    expect(readdirSync(dir).filter((name) => name.endsWith('.damaged'))).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).not.toContain('marked')
  })

  it('on the short limits, words nobody can open still go', () => {
    const wrap = keychain()
    sealedLog(wrap).append(take(NOW - 2 * DAY))
    wrap.state.secret = 'a new keychain'
    const lost = sealedLog(wrap)
    lost.applyRetention(KEEP_NO_TEXT, () => NOW)
    expect(readFileSync(file, 'utf8')).not.toContain('sealed')
    expect(lost.readAll()[0].words).toBe(3)
  })
})
