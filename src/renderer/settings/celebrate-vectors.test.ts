// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/celebrate-vectors.json through toCelebrate. MurmurCore runs
// the same file, so both platforms celebrate the same promotions
// (ios/prd.json IOS-018).
import { describe, expect, it } from 'vitest'
import ranks from '../../../shared/ranks.json'
import vectors from '../../../shared/celebrate-vectors.json'
import type { RankSpec } from '../../shared/ranks'
import { toCelebrate } from './celebrate'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks

interface Case {
  name: string
  promotions: { id: string; at: number }[]
  seen: string | null
  now: number
  expect: { belt: string | null; tape: string | null; reached: string } | null
}

describe('shared/celebrate-vectors.json', () => {
  for (const c of vectors.cases as Case[]) {
    it(c.name, () => {
      const seen = c.seen === null ? null : LADDER.findIndex((r) => r.id === c.seen)
      const got = toCelebrate(c.promotions, LADDER, seen, c.now)
      expect(got === null ? null : { belt: got.belt?.id ?? null, tape: got.tape?.id ?? null, reached: LADDER[got.reached].id }).toEqual(c.expect)
    })
  }
})
