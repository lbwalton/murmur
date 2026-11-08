// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/painting-vectors.json through the painting book and its
// words. MurmurCore runs the same file, so a change to either side breaks
// both platforms or neither (ios/prd.json IOS-019).
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/painting-vectors.json'
import { paintingCaption, paintingLine } from '../renderer/settings/painting'
import type { SessionEvent } from './history'
import { type PaintingBook, type SubjectId, paintingSeed, paintingSize, pickSubject, syncPaintings, typicalTakes, weekLine } from './painting'
import type { RankSpec } from './ranks'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks

interface Take {
  at: number
  day: string
  hour: number
  words: number
  kind?: 'transform'
  rawText?: string
}

const event = (t: Take): SessionEvent =>
  ({ at: t.at, durationMs: 1000, rawText: t.rawText ?? '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: t.hour, ...(t.kind ? { kind: t.kind } : {}) }) as SessionEvent

describe('shared/painting-vectors.json', () => {
  for (const c of vectors.cases as unknown as { name: string; install: number; book: PaintingBook; takes: Take[]; expect: PaintingBook }[]) {
    it(c.name, () => {
      expect(syncPaintings(c.book, c.takes.map(event), c.install, LADDER)).toEqual(c.expect)
    })
  }

  it('seeds, subjects, sizes, and typical days', () => {
    for (const s of vectors.seeds) expect(paintingSeed(s.install, s.day)).toBe(s.seed)
    for (const s of vectors.subjects) expect(pickSubject(s.seed, s.neighbours as (SubjectId | null)[], s.size)).toBe(s.subject)
    for (const s of vectors.sizes) expect(paintingSize(s.typical)).toBe(s.size)
    for (const t of vectors.typical) expect(typicalTakes(new Map(Object.entries(t.counts)), t.day)).toBe(t.typical)
  })

  it('the words', () => {
    for (const w of vectors.weeks.lines) expect(weekLine(vectors.weeks.book as unknown as PaintingBook, w.last)).toBe(w.line)
    for (const c of vectors.captions) expect(paintingCaption(c.subject as SubjectId, c.done, c.target)).toBe(c.caption)
    for (const l of vectors.lines) expect(paintingLine(l.words, l.longestMs)).toBe(l.line)
  })
})
