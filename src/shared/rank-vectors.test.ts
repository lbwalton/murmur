// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/rank-vectors.json through the belt math. MurmurCore runs the
// same file, so a change to the math breaks both platforms or neither
// (ios/prd.json IOS-017).
import { describe, expect, it } from 'vitest'
import ranks from '../../shared/ranks.json'
import vectors from '../../shared/rank-vectors.json'
import type { SessionEvent } from './history'
import { type GateProgress, type RanksFile, computeProgress } from './ranks'

interface Case {
  name: string
  founder?: boolean
  events: { at: number; words: number; day: string }[]
  expect: {
    rank: string
    index: number
    next: string | null
    words: GateProgress | null
    activeDays: GateProgress | null
    totals: { words: number; activeDays: number }
    promotions: { id: string; at: number }[]
    level: number
    practice: { rank: string; next: string | null; words: GateProgress | null; activeDays: GateProgress | null }
  }
}

describe('shared/rank-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const events: SessionEvent[] = c.events.map((e) => ({ at: e.at, durationMs: 60_000, rawText: '', finalText: '', words: e.words, wpm: 0, day: e.day }))
      const r = computeProgress(events, ranks as unknown as RanksFile, { founder: c.founder })
      expect({
        rank: r.rank.id,
        index: r.index,
        next: r.next?.id ?? null,
        words: r.words,
        activeDays: r.activeDays,
        totals: r.totals,
        promotions: r.promotions,
        level: r.level,
        practice: { rank: r.practice.rank.id, next: r.practice.next?.id ?? null, words: r.practice.words, activeDays: r.practice.activeDays }
      }).toEqual(c.expect)
    })
  }
})
