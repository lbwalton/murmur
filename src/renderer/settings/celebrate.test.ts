// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import ranksFile from '../../../shared/ranks.json'
import type { RankSpec } from '../../shared/ranks'
import { FRESH_MS, toCelebrate } from './celebrate'

const LADDER = (ranksFile as { ranks: RankSpec[] }).ranks
const NOW = 1_790_000_000_000
const at = (hoursAgo: number): number => NOW - hoursAgo * 3_600_000
const idx = (id: string): number => LADDER.findIndex((r) => r.id === id)

describe('toCelebrate', () => {
  it('holds the ceremony for a new belt and the tape for a stripe', () => {
    const belt = toCelebrate([{ id: 'white', at: at(30) }, { id: 'blue', at: at(1) }], LADDER, idx('white'), NOW)
    expect(belt).toMatchObject({ belt: { id: 'blue' }, tape: null, reached: idx('blue') })
    const stripe = toCelebrate([{ id: 'blue', at: at(30) }, { id: 'blue-1', at: at(1) }], LADDER, idx('blue'), NOW)
    expect(stripe).toMatchObject({ belt: null, tape: { id: 'blue-1' } })
    expect(toCelebrate([{ id: 'black-1', at: at(1) }], LADDER, idx('black'), NOW)?.tape?.id).toBe('black-1')
    expect(toCelebrate([{ id: 'coral-7', at: at(1) }], LADDER, idx('black-6'), NOW)?.belt?.id).toBe('coral-7')
    expect(toCelebrate([{ id: 'white', at: at(1) }], LADDER, null, NOW)?.belt?.id).toBe('white')
  })

  it('never skips a belt earned since the last look', () => {
    // Blue on Monday, a stripe on Friday, the Journey opened on Friday.
    const week = toCelebrate([{ id: 'blue', at: at(100) }, { id: 'blue-1', at: at(2) }], LADDER, idx('white-4'), NOW)
    expect(week).toMatchObject({ belt: { id: 'blue' }, tape: { id: 'blue-1' } })
    // One long take crosses two ranks at once.
    const take = toCelebrate([{ id: 'white-4', at: at(1) }, { id: 'blue', at: at(1) }, { id: 'blue-1', at: at(1) }], LADDER, idx('white-3'), NOW)
    expect(take).toMatchObject({ belt: { id: 'blue' }, tape: { id: 'blue-1' } })
    // Two belts at once: the newest belt is the ceremony.
    expect(toCelebrate([{ id: 'blue', at: at(1) }, { id: 'purple', at: at(1) }], LADDER, idx('white-4'), NOW)?.belt?.id).toBe('purple')
  })

  it('celebrates by height, so trimmed or cleared history never replays a belt', () => {
    // After a retention cut the same blue belt is recomputed with a new date.
    expect(toCelebrate([{ id: 'white', at: at(3) }, { id: 'blue', at: at(1) }], LADDER, idx('blue'), NOW)).toBeNull()
    // After Clear all, re-earning white is below what was celebrated.
    expect(toCelebrate([{ id: 'white', at: at(1) }], LADDER, idx('purple'), NOW)).toBeNull()
  })

  it('never replays an old promotion on first open', () => {
    expect(toCelebrate([{ id: 'blue', at: NOW - FRESH_MS - 1 }], LADDER, null, NOW)).toBeNull()
    expect(toCelebrate([], LADDER, null, NOW)).toBeNull()
  })
})
