// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { PaintingRecord } from '../../shared/painting'
import { MAX_EXTRA } from './painting'
import { lightOf, painterOf, planFor, progressOf, sealOf } from './paintingDay'

// A day's painting as both platforms show it (ios/prd.json IOS-019): the
// wrap-up and the iPhone's painter page draw from these.
describe('a day as both platforms show it', () => {
  const record: PaintingRecord = { subject: 'lotus', seed: 99, target: 6, tier: 0, level: 1, rank: 'white-1', hour: 20, words: [10, 20, 30, 40, 50, 60, 70] }

  it('counts its strokes, finishing at its size and keeping a few past it', () => {
    expect(progressOf(record)).toEqual({ done: 7, finished: true })
    expect(progressOf({ ...record, words: [1, 2] })).toEqual({ done: 2, finished: false })
    expect(progressOf({ ...record, words: Array(200).fill(1) }).done).toBe(6 + MAX_EXTRA)
  })

  it('names who painted it, and its light once it is finished', () => {
    expect(painterOf(record)).toBe('painted at white belt, one stripe, level 1, at dusk')
    expect(painterOf({ ...record, words: [1] })).toBe('painted at white belt, one stripe, level 1')
    expect(painterOf({ ...record, rank: 'none' })).toBe('painted before the first belt, level 1, at dusk')
  })

  it('plans more for each take past its size', () => {
    expect(planFor(record).length).toBeGreaterThan(planFor({ ...record, words: record.words.slice(0, 6) }).length)
  })

  it('takes its light and its seal once finished, the seal in its belt', () => {
    expect(lightOf(record, planFor(record))).toBeDefined()
    expect(lightOf({ ...record, words: [1] }, planFor(record))).toBeUndefined()
    expect(sealOf(record)).toBeDefined()
    expect(sealOf({ ...record, rank: 'none' })).toBeUndefined()
  })
})
