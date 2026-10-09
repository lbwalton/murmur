// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import type { SessionEvent } from './history'
import {
  KEEP_DAYS,
  MAX_STROKES,
  MIN_STROKES,
  SUBJECTS,
  SUBJECT_RANGE,
  asRecord,
  hoursByDay,
  paintingHour,
  paintingSeed,
  paintingSize,
  pickSubject,
  practiceBelt,
  sealBelt,
  shiftDay,
  syncPaintings,
  takesByDay,
  tierFor,
  typicalTakes,
  weekLine,
  weekOf
} from './painting'
import type { RankSpec } from './ranks'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks

/** A take of `words` on `day` at `hour`. */
function take(day: string, words: number, hour = 10, text = 'secret words'): SessionEvent {
  const [y, m, d] = day.split('-').map(Number)
  return { at: new Date(y, m - 1, d, hour).getTime(), durationMs: 5000, rawText: text, finalText: text, words, wpm: 120, day }
}

describe('sizing a day', () => {
  it('is the smallest painting before there is a typical day', () => {
    expect(paintingSize(null)).toBe(MIN_STROKES)
  })

  it('follows a typical day within the smallest and largest', () => {
    expect(paintingSize(12)).toBe(12)
    expect(paintingSize(12.5)).toBe(13)
    expect(paintingSize(2)).toBe(MIN_STROKES)
    expect(paintingSize(140)).toBe(MAX_STROKES)
  })

  it('a typical day counts takes, the median over the 28 days before', () => {
    const byDay = takesByDay([
      ...Array.from({ length: 4 }, (_, i) => take('2026-10-01', 10, 9 + i)),
      ...Array.from({ length: 10 }, (_, i) => take('2026-10-03', 10, 8 + i)),
      ...Array.from({ length: 6 }, (_, i) => take('2026-10-05', 10, 9 + i)),
      // The day itself and anything after never count.
      ...Array.from({ length: 30 }, (_, i) => take('2026-10-08', 10, 0 + (i % 23)))
    ])
    expect(typicalTakes(byDay, '2026-10-08')).toBe(6)
    expect(typicalTakes(byDay, '2026-10-04')).toBeNull()
  })

  it('days cross month ends', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('the subject', () => {
  it('is never the subject the day before had, at any size', () => {
    for (let size = MIN_STROKES; size <= MAX_STROKES; size++) {
      for (let seed = 0; seed < 60; seed++) {
        for (const before of SUBJECTS) expect(pickSubject(seed, [before], size)).not.toBe(before)
      }
    }
  })

  it('suits the size: every size has ten subjects or more, so the seed always has a choice', () => {
    for (let size = MIN_STROKES; size <= MAX_STROKES; size++) {
      const fits = SUBJECTS.filter((s) => size >= SUBJECT_RANGE[s][0] && size <= SUBJECT_RANGE[s][1])
      expect(fits.length).toBeGreaterThanOrEqual(10)
      for (let seed = 0; seed < 40; seed++) expect(fits).toContain(pickSubject(seed, [null], size))
    }
  })

  it('a new user at the smallest size still sees every subject that fits it over time', () => {
    let before: (typeof SUBJECTS)[number] | null = null
    const seen = new Set<string>()
    for (let i = 0; i < 120; i++) {
      before = pickSubject(paintingSeed(11, shiftDay('2026-10-01', i)), [before], MIN_STROKES)
      seen.add(before)
    }
    const fits = SUBJECTS.filter((s) => MIN_STROKES >= SUBJECT_RANGE[s][0])
    expect(fits.length).toBeGreaterThanOrEqual(12)
    expect(seen.size).toBe(fits.length)
  })

  it('is unlike the painted days on both sides', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = pickSubject(seed, ['moon', 'bamboo'], MIN_STROKES)
      expect(s).not.toBe('moon')
      expect(s).not.toBe('bamboo')
    }
  })

  it('every subject comes up at a size they all suit', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickSubject(paintingSeed(7, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`) + i, [null], 15)))
    expect(seen.size).toBe(SUBJECTS.length)
  })

  it('two installs painting the same day get different seeds', () => {
    expect(paintingSeed(1, '2026-10-08')).not.toBe(paintingSeed(2, '2026-10-08'))
    expect(paintingSeed(1, '2026-10-08')).toBe(paintingSeed(1, '2026-10-08'))
  })
})

describe('tiers', () => {
  it('rise with the belt', () => {
    expect(['none', 'white', 'blue', 'purple', 'brown', 'black', 'coral-black', 'red'].map(tierFor)).toEqual([0, 0, 1, 2, 3, 4, 4, 4])
  })

  it('come from practice, never the founder belt', () => {
    expect(practiceBelt(LADDER, 0, 0)).toBe('none')
    expect(practiceBelt(LADDER, 30_000, 20)).toBe('blue')
    expect(practiceBelt(LADDER, 99_000_000, 99_999)).toBe('red')
  })
})

describe('the seal', () => {
  it('takes the belt of the rank the painting was made at', () => {
    for (const rank of LADDER.filter((r) => r.belt !== 'none' && !r.founderOnly)) expect(sealBelt(rank.id, LADDER)).toBe(rank.belt)
    expect(sealBelt('blue', LADDER)).toBe('blue')
  })

  it('stays ember before the first belt and for older records', () => {
    expect(sealBelt('none', LADDER)).toBeNull()
    expect(sealBelt(undefined, LADDER)).toBeNull()
    expect(sealBelt('not-a-rank', LADDER)).toBeNull()
  })
})

describe('the book', () => {
  const week = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
  const events = week.flatMap((day, d) => Array.from({ length: 3 + d }, (_, i) => take(day, 40 + i * 10, 8 + i)))

  it('gets a record for every day, sized, seeded, never the same subject twice running', () => {
    const book = syncPaintings({}, events, 42, LADDER)
    expect(Object.keys(book)).toEqual(week)
    week.slice(1).forEach((day, i) => expect(book[day].subject).not.toBe(book[week[i]].subject))
    expect(book['2026-10-02'].target).toBe(MIN_STROKES)
    // Oct 3, 4, 5 had 3, 4, 5 takes: Oct 6's typical day is 4, still the smallest.
    expect(book['2026-10-08'].target).toBe(MIN_STROKES)
    expect(book['2026-10-08'].words).toEqual([40, 50, 60, 70, 80, 90, 100, 110, 120])
  })

  it('keeps word counts only, never what was said', () => {
    const book = syncPaintings({}, events, 42, LADDER)
    expect(JSON.stringify(book)).not.toContain('secret')
  })

  it('a record outlives the history it came from', () => {
    const book = syncPaintings({}, events, 42, LADDER)
    const later = syncPaintings(book, events.filter((e) => e.day !== '2026-10-02'), 42, LADDER)
    expect(later['2026-10-02']).toEqual(book['2026-10-02'])
  })

  it('a take retried onto an earlier day adds its stroke there; a trimmed day keeps its record', () => {
    const book = syncPaintings({}, events, 42, LADDER)
    const retried = syncPaintings(book, [...events, take('2026-10-04', 33, 20)], 42, LADDER)
    expect(retried['2026-10-04'].words.at(-1)).toBe(33)
    expect(retried['2026-10-04'].subject).toBe(book['2026-10-04'].subject)
    const trimmed = syncPaintings(book, events.filter((e) => !(e.day === '2026-10-05' && (e.words ?? 0) > 40)), 42, LADDER)
    expect(trimmed['2026-10-05'].words).toEqual(book['2026-10-05'].words)
  })

  it('a day keeps the tier, level, and rank its first take saw', () => {
    const big = [take('2026-10-01', 30_000, 9), ...Array.from({ length: 14 }, (_, i) => take(shiftDay('2026-10-02', i), 10, 9))]
    const book = syncPaintings({}, big, 1, LADDER)
    expect(book['2026-10-01'].tier).toBe(0)
    expect(book['2026-10-01'].rank).toBe('white')
    expect(book['2026-10-15'].tier).toBe(1)
    expect(book['2026-10-15'].rank).toBe('blue')
    expect(book['2026-10-01'].level).toBe(1)
    // A first take too short for the white belt is painted before it.
    expect(syncPaintings({}, [take('2026-10-01', 40)], 1, LADDER)['2026-10-01'].rank).toBe('none')
  })

  it('a record from before ranks were kept gets its rank from the log', () => {
    const big = [take('2026-10-01', 30_000, 9), ...Array.from({ length: 14 }, (_, i) => take(shiftDay('2026-10-02', i), 10, 9))]
    const book = syncPaintings({}, big, 1, LADDER)
    const { rank: _a, ...old1 } = book['2026-10-01']
    const { rank: _b, ...old15 } = book['2026-10-15']
    const later = syncPaintings({ ...book, '2026-10-01': old1, '2026-10-15': old15 }, big, 1, LADDER)
    expect(later['2026-10-01'].rank).toBe('white')
    expect(later['2026-10-15'].rank).toBe('blue')
    // Without its day in the log, it stays as it was: the ember seal.
    expect(syncPaintings({ '2026-10-01': old1 }, [], 1, LADDER)['2026-10-01'].rank).toBeUndefined()
  })

  it('a painting gets its light hour once it reaches its size: the middle hour of the takes that made it', () => {
    const day = '2026-10-02'
    const takes = [8, 9, 9, 14, 20, 21, 22, 23].map((hour) => take(day, 30, hour))
    const short = syncPaintings({}, takes.slice(0, 5), 1, LADDER)[day]
    expect(short.target).toBe(MIN_STROKES)
    expect(short.hour).toBeUndefined()
    const full = syncPaintings({}, takes, 1, LADDER)[day]
    // The first six takes (8, 9, 9, 14, 20, 21): the lower middle is 9.
    expect(full.hour).toBe(9)
    // Kept once the log is trimmed, refreshed while it has the day.
    expect(syncPaintings({ [day]: full }, [], 1, LADDER)[day].hour).toBe(9)
  })

  it('the hour is the one kept with the take, or its time on older entries', () => {
    const day = '2026-10-02'
    const kept = { ...take(day, 10, 9), hour: 22 }
    expect(hoursByDay([kept, take(day, 10, 11)]).get(day)).toEqual([22, 11])
    expect(paintingHour([22, 11, 3], 3)).toBe(11)
    expect(paintingHour([22, 11], 3)).toBeUndefined()
    expect(paintingHour([1, 2, 3, 4], 4)).toBe(2)
  })

  it('keeps KEEP_DAYS calendar days back from the newest, however sparse', () => {
    const many = Array.from({ length: KEEP_DAYS + 20 }, (_, i) => take(shiftDay('2025-01-01', i), 10))
    const book = syncPaintings({}, many, 3, LADDER)
    expect(Object.keys(book)).toHaveLength(KEEP_DAYS)
    expect(Object.keys(book)[0]).toBe(shiftDay('2025-01-01', 20))
    const sparse = Array.from({ length: 300 }, (_, i) => take(shiftDay('2024-01-01', i * 2), 10))
    const days = Object.keys(syncPaintings({}, sparse, 3, LADDER))
    expect(days[0] > shiftDay(days.at(-1) ?? '', -KEEP_DAYS)).toBe(true)
    expect(days.length).toBeLessThanOrEqual(KEEP_DAYS / 2 + 1)
  })

  it('a hand-edited log with a strange day never breaks it', () => {
    const odd = ['constructor', 'toString', '__proto__', 'zzz', 'hasOwnProperty'].map((day) => ({ ...take('2026-10-08', 10), day }))
    const book = syncPaintings({}, [...events, ...odd], 42, LADDER)
    expect(Object.keys(book)).toEqual(week)
  })

  it('transforms add strokes by what was said, and never lift the belt the painting is drawn at', () => {
    const transform = (day: string): SessionEvent => ({ ...take(day, 1400, 20, 'make this a list'), kind: 'transform' })
    const days = Array.from({ length: 24 }, (_, i) => shiftDay('2026-09-01', i))
    const plain = days.map((day) => take(day, 50))
    const withTransforms = [...plain, ...days.map(transform)]
    const a = syncPaintings({}, plain, 9, LADDER)
    const b = syncPaintings({}, withTransforms, 9, LADDER)
    for (const day of days) {
      expect(b[day].tier).toBe(a[day].tier)
      expect(b[day].level).toBe(a[day].level)
    }
    expect(b[days[3]].words).toEqual([50, 4])
  })

  it('reads back only well-formed records', () => {
    const book = syncPaintings({}, events, 42, LADDER)
    const record = book['2026-10-08']
    expect(asRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(asRecord({ ...record, subject: 'portrait' })).toBeNull()
    expect(asRecord({ ...record, words: ['x'] })).toBeNull()
    expect(asRecord({ ...record, target: 999 })).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord({ ...record, hour: 21 })?.hour).toBe(21)
    expect(asRecord({ ...record, hour: 24 })).not.toHaveProperty('hour')
  })
})

describe('the week', () => {
  it('is the seven days ending on a day, oldest first, across a month end', () => {
    expect(weekOf('2026-10-02')).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('says what the week painted: paintings finished, takes, and words', () => {
    const record = (target: number, words: number[]) => ({ subject: 'moon' as const, seed: 1, target, tier: 0, level: 1, words })
    const book = {
      '2026-10-02': record(6, [10, 20, 30, 40, 50, 60]),
      '2026-10-03': record(6, [100, 200]),
      // Outside the week ending Oct 8: never counted.
      '2026-09-20': record(6, [999, 999, 999, 999, 999, 999])
    }
    expect(weekLine(book, '2026-10-08')).toBe('1 painting finished from 8 takes and 510 words')
    expect(weekLine({ ...book, '2026-10-05': record(6, [1, 1, 1, 1, 1, 1]) }, '2026-10-08')).toBe('2 paintings finished from 14 takes and 516 words')
    expect(weekLine({ '2026-10-03': record(6, [1]) }, '2026-10-08')).toBe('1 take and 1 word')
  })
})
