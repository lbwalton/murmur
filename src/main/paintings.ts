// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (US-098): the book of paintings, kept in userData as
// paintings.json: this install's own seed and one small record per day
// (subject, seed, size, tier, level, and each take's word count, never
// its text). It is brought up to date from the history log before
// retention prunes it, so the collection outlives the log, and Clear all
// empties it with the log. The settings window reads it to paint. A
// failure here is logged and never stops history or dictation.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import type { SessionEvent } from '../shared/history'
import { type PaintingBook, asRecord, isDayKey, shiftDay, syncPaintings } from '../shared/painting'
import { dayKey } from '../shared/history'
import type { RankSpec } from '../shared/ranks'
import ranksSpec from '../../shared/ranks.json'
import { isSmoke, registerSmokeCheck } from './smoke'

interface Store {
  install: number
  days: PaintingBook
}

const LADDER = (ranksSpec as { ranks: RankSpec[] }).ranks
/** How many days the window asks for: today and the four weeks before. */
const SHOWN_DAYS = 29

let store: Store | null = null

const bookFile = (): string => join(app.getPath('userData'), 'paintings.json')

/** Reads a book from disk. A file that cannot be read as one is moved
 *  aside (name.bad), so a rebuild from the log never overwrites
 *  paintings older than the log. */
function readStore(file: string): Store {
  let install = -1
  const days: PaintingBook = {}
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { install?: unknown; days?: unknown }
      if (Number.isInteger(raw.install) && (raw.install as number) >= 0) install = raw.install as number
      const stored = raw.days && typeof raw.days === 'object' ? (raw.days as Record<string, unknown>) : {}
      for (const day of Object.keys(stored)) {
        const record = isDayKey(day) ? asRecord(stored[day]) : null
        if (record) days[day] = record
      }
    } catch (error) {
      console.error('[murmur] paintings: could not read the book; keeping it aside as .bad:', error)
      try {
        renameSync(file, `${file}.bad`)
      } catch (moveError) {
        console.error('[murmur] paintings: could not move the damaged book aside:', moveError)
      }
    }
  }
  return { install: install >= 0 ? install : randomInt(0, 0x7fffffff), days }
}

function writeStore(file: string, s: Store): void {
  try {
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(s))
    renameSync(tmp, file)
  } catch (error) {
    console.error('[murmur] paintings: could not save the book:', error)
  }
}

function load(): Store {
  store ??= readStore(bookFile())
  return store
}

/** Syncs a book with the log; true when it changed. */
function syncStore(s: Store, events: readonly SessionEvent[]): boolean {
  const before = JSON.stringify(s.days)
  s.days = syncPaintings(s.days, events, s.install, LADDER)
  return JSON.stringify(s.days) !== before
}

/** Brings the book up to date with the log; history calls this before
 *  it prunes, and the window's request does too. Never throws. */
export function syncPaintingsWith(events: readonly SessionEvent[]): void {
  try {
    const s = load()
    if (syncStore(s, events)) writeStore(bookFile(), s)
  } catch (error) {
    console.error('[murmur] paintings: sync failed:', error)
  }
}

/** Clear all empties the book with the log; the install's seed stays. */
export function clearPaintings(): void {
  try {
    const s = load()
    s.days = {}
    writeStore(bookFile(), s)
  } catch (error) {
    console.error('[murmur] paintings: clear failed:', error)
  }
}

export function initPaintings(readEvents: () => SessionEvent[]): void {
  // Today and the four weeks before it, synced first so today's newest
  // take is in it.
  ipcMain.handle('paintings:list', () => {
    syncPaintingsWith(readEvents())
    const today = dayKey(Date.now())
    const days = load().days
    const shown: PaintingBook = {}
    for (let i = SHOWN_DAYS - 1; i >= 0; i--) {
      const day = shiftDay(today, -i)
      if (Object.hasOwn(days, day)) shown[day] = days[day]
    }
    return shown
  })

  registerSmokeCheck('paintings', () => {
    // On its own file in the hermetic smoke profile, never the real
    // book: a day of takes makes a record of word counts with no text,
    // it round-trips through the file, a damaged file is kept aside, and
    // clearing empties it.
    if (!isSmoke) return false
    const file = join(app.getPath('userData'), 'paintings-smoke.json')
    rmSync(file, { force: true })
    rmSync(`${file}.bad`, { force: true })
    const day = dayKey(Date.now())
    const takes: SessionEvent[] = [12, 30, 7].map((words, i) => ({
      at: Date.now() - (3 - i) * 1000,
      durationMs: 2000,
      rawText: 'smoke painting probe',
      finalText: 'Smoke painting probe.',
      words,
      wpm: 100,
      day
    }))
    const s = readStore(file)
    syncStore(s, takes)
    writeStore(file, s)
    const onDisk = readFileSync(file, 'utf8')
    const reread = readStore(file).days[day]
    const recorded = s.days[day]?.words.join(',') === '12,30,7' && JSON.stringify(reread) === JSON.stringify(s.days[day])
    const privateOk = !onDisk.includes('smoke painting probe') && !onDisk.includes('Smoke painting probe')
    writeFileSync(file, '{ not json')
    const rebuilt = readStore(file)
    const keptAside = existsSync(`${file}.bad`) && Object.keys(rebuilt.days).length === 0
    s.days = {}
    writeStore(file, s)
    const cleared = Object.keys(readStore(file).days).length === 0
    rmSync(file, { force: true })
    rmSync(`${file}.bad`, { force: true })
    return recorded && privateOk && keptAside && cleared
  })
}
