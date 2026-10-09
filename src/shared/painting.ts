// SPDX-License-Identifier: GPL-3.0-only
// A painting a day (US-098), as data. Each day gets a subject, a seed,
// and a size: its stroke count, near a typical day's takes. Every take
// (a dictation, a note, or a transform) adds the next stroke. The tier
// (how rich the brushwork is) and the level are fixed when the day's
// first take lands, so a promotion never repaints a day already begun.
// Main keeps these records by day (paintings.json), so the collection
// outlives history retention; they hold word counts, never text. Pure
// and deterministic: the renderer draws from it.
import { TYPICAL_MIN_DAYS, TYPICAL_WINDOW_DAYS } from './analytics'
import { type SessionEvent, countWords, countsTowardStats, dayKey, eventDay } from './history'
import { type RankSpec, levelFor } from './ranks'

export const SUBJECTS = [
  'moon',
  'bamboo',
  'plum',
  'mountains',
  'pine',
  'orchid',
  'chrysanthemum',
  'lotus',
  'waterfall',
  'willow',
  'boat',
  'wave',
  'maple',
  'snow'
] as const
export type SubjectId = (typeof SUBJECTS)[number]

export const SUBJECT_NAMES: Record<SubjectId, string> = {
  moon: 'moon over water',
  bamboo: 'bamboo',
  plum: 'plum branch',
  mountains: 'mountains',
  pine: 'pine on a cliff',
  orchid: 'orchid',
  chrysanthemum: 'chrysanthemum',
  lotus: 'lotus pond',
  waterfall: 'waterfall',
  willow: 'willow by the water',
  boat: 'boat on the river',
  wave: 'breaking wave',
  maple: 'maple branch',
  snow: 'snowfall'
}

/** The smallest painting (also the size before there is a typical day). */
export const MIN_STROKES = 6
/** The largest: past this a day's painting is finished, however long it runs. */
export const MAX_STROKES = 36
/** How far back the book keeps paintings, in calendar days: about a
 *  year and a month. */
export const KEEP_DAYS = 400
/** More takes than this in one stored day is not a real record. */
const MAX_TAKES = 10_000

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
/** Whether a string is a day key (a hand-edited log can hold anything). */
export const isDayKey = (day: unknown): day is string => typeof day === 'string' && DAY_KEY.test(day)

export interface PaintingRecord {
  subject: SubjectId
  seed: number
  /** Strokes to finish, fixed when the day's first take lands. */
  target: number
  /** How rich the brushwork is (0 white belt to 4 black belt and up). */
  tier: number
  /** The level, which adds a bird or two. */
  level: number
  /** The practice rank's id at the day's first take (ranks.json), for the
   *  card; missing on records made before it was kept. */
  rank?: string
  /** Each take's word count, in the order spoken. Never its text. */
  words: number[]
}

/** Paintings by day key. */
export type PaintingBook = Record<string, PaintingRecord>

/** The brushwork tier a belt paints at: washes from blue, splatter from
 *  purple, a second motif from brown, and the heaviest washes and
 *  splatter from black. LaBroi asked for heavier ink washes and splatter
 *  at the higher belts (2026-10-08); the steps between are a design call. */
export function tierFor(belt: string): number {
  switch (belt) {
    case 'none':
    case 'white':
      return 0
    case 'blue':
      return 1
    case 'purple':
      return 2
    case 'brown':
      return 3
    default:
      return 4
  }
}

/** The day key `offset` days from `day` (negative is earlier). */
export function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + offset).getTime())
}

/** A take's stroke weight in words: what was said. A transform's own
 *  word count is the selection it rewrote, so it counts its spoken
 *  instruction instead. */
export function takeWords(event: SessionEvent): number {
  const words = event.kind === 'transform' ? countWords(event.rawText ?? '') : event.words
  return Number.isFinite(words) && words > 0 ? Math.floor(words) : 0
}

/** Each day's takes, as word counts in the order spoken. Events whose
 *  day is not a day key are left out. */
export function takesByDay(events: readonly SessionEvent[]): Map<string, number[]> {
  const byDay = new Map<string, number[]>()
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const day = eventDay(event)
    if (!isDayKey(day)) continue
    const list = byDay.get(day)
    if (list) list.push(takeWords(event))
    else byDay.set(day, [takeWords(event)])
  }
  return byDay
}

/** The median number of takes on the active days in the window before
 *  `day`, or null with fewer active days than Home's typical day needs. */
export function typicalTakes(byDay: ReadonlyMap<string, readonly number[]>, day: string): number | null {
  const counts: number[] = []
  for (let i = 1; i <= TYPICAL_WINDOW_DAYS; i++) {
    const n = byDay.get(shiftDay(day, -i))?.length ?? 0
    if (n > 0) counts.push(n)
  }
  if (counts.length < TYPICAL_MIN_DAYS) return null
  counts.sort((a, b) => a - b)
  const mid = counts.length >> 1
  return counts.length % 2 === 1 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2
}

/** A day's size: a typical day's takes, within the smallest and largest. */
export function paintingSize(typical: number | null): number {
  if (typical === null) return MIN_STROKES
  return Math.max(MIN_STROKES, Math.min(MAX_STROKES, Math.round(typical)))
}

/** A day's seed, mixed with this install's own, so two people painting
 *  on the same day practically never get the same painting. */
export function paintingSeed(install: number, day: string): number {
  let h = (install ^ 0x9e3779b9) >>> 0
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  return (h ^ (h >>> 12)) >>> 0
}

/** The sizes each subject paints well at: most fit every size; a few
 *  quiet ones (the moon, the boat, the orchid, the wave) stop before
 *  their water or leaves crowd, and the waterfall needs a few strokes
 *  for its two cliffs. Every size has ten subjects or more. */
export const SUBJECT_RANGE: Record<SubjectId, readonly [number, number]> = {
  moon: [6, 24],
  bamboo: [6, 36],
  plum: [6, 36],
  mountains: [6, 36],
  pine: [6, 36],
  orchid: [6, 30],
  chrysanthemum: [6, 36],
  lotus: [6, 36],
  waterfall: [8, 36],
  willow: [6, 36],
  boat: [6, 24],
  wave: [6, 30],
  maple: [6, 36],
  snow: [6, 36]
}

/** The day's subject: picked by its seed among those that suit its size,
 *  never the subject of the painted day on either side of it. */
export function pickSubject(seed: number, neighbours: ReadonlyArray<SubjectId | null>, size: number = MIN_STROKES): SubjectId {
  const fits = SUBJECTS.filter((s) => size >= SUBJECT_RANGE[s][0] && size <= SUBJECT_RANGE[s][1])
  const fresh = fits.filter((s) => !neighbours.includes(s))
  const pool = fresh.length > 0 ? fresh : fits.length > 0 ? fits : [...SUBJECTS]
  return pool[(seed >>> 3) % pool.length]
}

/** The rank words and days alone have earned (the founder's included). */
export function practiceRank(ladder: readonly RankSpec[], words: number, days: number): RankSpec | null {
  let best: RankSpec | null = null
  for (const rank of ladder) {
    if (rank.founderOnly || rank.words === null || rank.activeDays === null) continue
    if (words >= rank.words && days >= rank.activeDays) best = rank
  }
  return best
}

/** The belt words and days alone have earned. */
export function practiceBelt(ladder: readonly RankSpec[], words: number, days: number): string {
  return practiceRank(ladder, words, days)?.belt ?? 'none'
}

/**
 * Brings the book up to date with the log. Every day in the log gets a
 * record, made in date order, with the size, tier, and level as of its
 * first take, and a subject unlike the painted days on either side. The
 * tier and level count dictations and notes only, as the belts do. A
 * day's words are refreshed from the log (a retried take can land on an
 * earlier day), unless retention has already trimmed that day below
 * what the record holds. Days more than KEEP_DAYS before the newest are
 * dropped. Returns a new book.
 */
export function syncPaintings(
  book: Readonly<PaintingBook>,
  events: readonly SessionEvent[],
  install: number,
  ladder: readonly RankSpec[]
): PaintingBook {
  const own = (day: string): PaintingRecord | null => (Object.hasOwn(book, day) && isDayKey(day) ? book[day] : null)
  const byDay = takesByDay(events)
  // What the belts count: words of dictations and notes, by day, and
  // each day's first such take.
  const rankWords = new Map<string, number>()
  const firstWords = new Map<string, number>()
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const day = eventDay(event)
    if (!isDayKey(day) || !countsTowardStats(event)) continue
    const w = Number.isFinite(event.words) && event.words > 0 ? event.words : 0
    if (!firstWords.has(day)) firstWords.set(day, w)
    rankWords.set(day, (rankWords.get(day) ?? 0) + w)
  }
  const days = [...new Set([...Object.keys(book).filter((d) => own(d) !== null), ...byDay.keys()])].sort()
  let words = 0
  let activeDays = 0
  const next = new Map<string, PaintingRecord>()
  let before: SubjectId | null = null
  days.forEach((day, i) => {
    const logged = byDay.get(day)
    const kept = own(day)
    if (kept) {
      next.set(day, logged && logged.length >= kept.words.length ? { ...kept, words: [...logged] } : kept)
    } else if (logged) {
      const seed = paintingSeed(install, day)
      const target = paintingSize(typicalTakes(byDay, day))
      // A day filled in between kept days (a retried take) is unlike both.
      const after = days.slice(i + 1).map(own).find((r) => r !== null)?.subject ?? null
      const first = firstWords.get(day) ?? 0
      next.set(day, {
        subject: pickSubject(seed, [before, after], target),
        seed,
        target,
        tier: tierFor(practiceBelt(ladder, words + first, activeDays + (rankWords.has(day) ? 1 : 0))),
        level: levelFor(words + first),
        rank: practiceRank(ladder, words + first, activeDays + (rankWords.has(day) ? 1 : 0))?.id ?? 'none',
        words: [...logged]
      })
    }
    before = next.get(day)?.subject ?? before
    if (rankWords.has(day)) {
      words += rankWords.get(day) ?? 0
      activeDays += 1
    }
  })
  const newest = days.at(-1)
  const cutoff = newest ? shiftDay(newest, -KEEP_DAYS) : ''
  const out: PaintingBook = {}
  for (const [day, record] of next) if (day > cutoff) out[day] = record
  return out
}

/** A record read back from disk, or null when it is not one. */
export function asRecord(value: unknown): PaintingRecord | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Partial<PaintingRecord>
  const int = (n: unknown, lo: number, hi: number): boolean => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi
  if (!SUBJECTS.includes(r.subject as SubjectId)) return null
  if (!int(r.seed, 0, 0xffffffff) || !int(r.target, MIN_STROKES, MAX_STROKES) || !int(r.tier, 0, 4) || !int(r.level, 1, 100000)) return null
  if (!Array.isArray(r.words) || r.words.length > MAX_TAKES || !r.words.every((w) => int(w, 0, 1_000_000))) return null
  const rank = typeof r.rank === 'string' && /^[a-z0-9-]{1,32}$/.test(r.rank) ? r.rank : undefined
  return {
    subject: r.subject as SubjectId,
    seed: r.seed as number,
    target: r.target as number,
    tier: r.tier as number,
    level: r.level as number,
    ...(rank ? { rank } : {}),
    words: [...(r.words as number[])]
  }
}
