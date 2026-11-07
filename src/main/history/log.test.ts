// SPDX-License-Identifier: GPL-3.0-only
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionEvent } from '../../shared/history'
import { HistoryLog } from './log'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-history-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

function event(at: number): SessionEvent {
  return { at, durationMs: 4_000, rawText: 'raw words here', finalText: 'Raw words here.', words: 3, wpm: 45 }
}

describe('HistoryLog', () => {
  it('appends and reads back in order', () => {
    const log = new HistoryLog(dir)
    log.append(event(1))
    log.append(event(2))
    expect(log.readAll().map((e) => e.at)).toEqual([1, 2])
  })

  it('skips corrupt lines and wrong shapes without failing', () => {
    const log = new HistoryLog(dir)
    log.append(event(1))
    appendFileSync(join(dir, 'history.jsonl'), 'not json at all\n{"at":"bad"}\n')
    log.append(event(2))
    expect(log.readAll().map((e) => e.at)).toEqual([1, 2])
  })

  it('prunes events older than the retention window', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 100 * DAY))
    log.append(event(NOW - 5 * DAY))
    log.prune(30, () => NOW)
    expect(log.readAll().map((e) => e.at)).toEqual([NOW - 5 * DAY])
  })

  it('puts words back on the one entry they belong to', () => {
    const log = new HistoryLog(dir)
    log.append({ ...event(1), rawText: '', finalText: '' })
    log.append({ ...event(2), rawText: '', finalText: '' })
    log.fillWords(2, 'said again', 'Said again.')
    expect(log.readAll().map((e) => e.finalText)).toEqual(['', 'Said again.'])
    expect(log.readAll().map((e) => e.words)).toEqual([3, 3])
  })

  it('retention zero keeps everything', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 500 * DAY))
    log.prune(0, () => NOW)
    expect(log.readAll().length).toBe(1)
  })

  it('takes the words out of old events and keeps their numbers (24 hours)', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 2 * DAY))
    log.append(event(NOW - 1000))
    log.applyRetention(1, () => NOW)
    const [old, fresh] = log.readAll()
    expect(old.rawText).toBe('')
    expect(old.finalText).toBe('')
    expect(old.words).toBe(event(NOW - 2 * DAY).words)
    expect(fresh.finalText).toBe(event(NOW - 1000).finalText)
  })

  it('takes the words out of everything for Don\'t keep, and no event goes', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 2 * DAY))
    log.append(event(NOW - 1000))
    log.applyRetention(-1, () => NOW)
    expect(log.readAll()).toHaveLength(2)
    expect(readFileSync(join(dir, 'history.jsonl'), 'utf8')).not.toContain(event(NOW).finalText)
  })

  it('leaves the file alone when there is nothing to take out', () => {
    const log = new HistoryLog(dir)
    log.append({ ...event(NOW - 2 * DAY), rawText: '', finalText: '' })
    const before = statSync(join(dir, 'history.jsonl')).mtimeMs
    log.applyRetention(-1, () => NOW)
    expect(statSync(join(dir, 'history.jsonl')).mtimeMs).toBe(before)
  })

  it('still removes whole entries on the day limits', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 40 * DAY))
    log.append(event(NOW - DAY))
    log.applyRetention(30, () => NOW)
    expect(log.readAll()).toHaveLength(1)
  })

  it('counts what a setting would change', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 40 * DAY))
    log.append(event(NOW - 2 * DAY))
    log.append({ ...event(NOW - 3 * DAY), rawText: '', finalText: '' })
    log.append(event(NOW - 1000))
    expect(log.countAffected(30, NOW)).toBe(1)
    expect(log.countAffected(1, NOW)).toBe(2)
    expect(log.countAffected(-1, NOW)).toBe(3)
    expect(log.countAffected(0, NOW)).toBe(0)
  })

  it('clear empties the log file', () => {
    const log = new HistoryLog(dir)
    log.append(event(1))
    log.clear()
    expect(log.readAll()).toEqual([])
    expect(readFileSync(join(dir, 'history.jsonl'), 'utf8')).toBe('')
  })
})
