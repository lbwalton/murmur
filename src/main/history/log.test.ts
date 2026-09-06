// SPDX-License-Identifier: GPL-3.0-only
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

  it('retention zero keeps everything', () => {
    const log = new HistoryLog(dir)
    log.append(event(NOW - 500 * DAY))
    log.prune(0, () => NOW)
    expect(log.readAll().length).toBe(1)
  })

  it('clear empties the log file', () => {
    const log = new HistoryLog(dir)
    log.append(event(1))
    log.clear()
    expect(log.readAll()).toEqual([])
    expect(readFileSync(join(dir, 'history.jsonl'), 'utf8')).toBe('')
  })
})
