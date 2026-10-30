// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import cosmetics from '../../../shared/cosmetics.json'
import ranks from '../../../shared/ranks.json'
import type { SessionEvent } from '../../shared/history'
import { type RanksFile, computeProgress } from '../../shared/ranks'
import {
  ROAD,
  beltOnInk,
  ceremonyScene,
  daysPerMark,
  drawFrom,
  journeyColors,
  paintRoad,
  rankX,
  roadGroups,
  roadPlace,
  roadRanks,
  sealPaint,
  sinceRank,
  youX
} from './journeyPaint'

describe('the road', () => {
  const n = 31

  it('lays the ranks out evenly from the start to the end of the road', () => {
    expect(rankX(0, n)).toBeGreaterThan(ROAD.pad)
    expect(rankX(n - 1, n)).toBeCloseTo(ROAD.W - ROAD.pad)
    expect(rankX(2, n) - rankX(1, n)).toBeCloseTo(rankX(1, n) - rankX(0, n))
  })

  it('puts you between your rank and the next by the slower gate', () => {
    expect(youX(3, 0, n)).toBe(rankX(3, n))
    expect(youX(3, 0.5, n)).toBeCloseTo((rankX(3, n) + rankX(4, n)) / 2)
    expect(youX(3, 2, n)).toBe(rankX(4, n))
  })

  it('starts you before the first knot without a belt, and ends you at the last', () => {
    expect(youX(-1, 0, n)).toBe(ROAD.pad)
    expect(youX(-1, 1, n)).toBe(rankX(0, n))
    expect(youX(n - 1, 0.4, n)).toBe(rankX(n - 1, n))
  })
})

describe('tally marks', () => {
  it('keeps one mark a day up to fifty, then groups them', () => {
    expect(daysPerMark(9)).toBe(1)
    expect(daysPerMark(50)).toBe(1)
    expect(daysPerMark(60)).toBe(2)
    expect(daysPerMark(400)).toBe(8)
    expect(Math.ceil(400 / daysPerMark(400))).toBeLessThanOrEqual(50)
  })
})

describe('gates drawing on', () => {
  it('start where you last saw them on the same rank', () => {
    expect(drawFrom(9_000, 6_000, 11_017)).toBe(9_000)
  })

  it('start at the rank with no record, or on a new rank', () => {
    expect(drawFrom(null, 6_000, 11_017)).toBe(6_000)
  })

  it('never run backwards or start before the rank', () => {
    // After Clear all or a retention cut you may have less than you saw.
    expect(drawFrom(14_000, 6_000, 11_017)).toBe(11_017)
    expect(drawFrom(2_000, 6_000, 11_017)).toBe(6_000)
  })
})

describe('the level note', () => {
  it('says what the next level takes', async () => {
    const { levelNote } = await import('./JourneyView')
    expect(levelNote(1, 11_017)).toBe(
      'Level 1. You gain a level for every 100,000 words you dictate, with no days needed. 88,983 more words to reach level 2.'
    )
    expect(levelNote(3, 299_999)).toContain('1 more word to reach level 4.')
  })
})

describe('the seal in a belt', () => {
  const c = journeyColors((cosmetics as { beltColors: Record<string, string> }).beltColors)

  it('is the belt as it reads on the ink: white as rice paper, black lifted off the ink', () => {
    expect(sealPaint('white', c)).toEqual(c.rice)
    expect(sealPaint('blue', c)).toEqual(c.belts.blue)
    expect(sealPaint('red', c)).toEqual(c.belts.red)
    const black = sealPaint('black', c) as number[]
    expect(black).not.toEqual(c.belts.black)
    expect(black[0] + black[1] + black[2]).toBeGreaterThan(c.belts.black[0] + c.belts.black[1] + c.belts.black[2])
  })

  it('splits the coral belts into their two colors', () => {
    expect(sealPaint('coral-black', c)).toEqual([c.belts['coral-black'], sealPaint('black', c)])
    expect(sealPaint('coral-white', c)).toEqual([c.belts['coral-black'], c.rice])
  })
})

// The road and the ceremony as the iPhone's painter page uses them too
// (IOS-018): one module, so both platforms paint the same road.
describe('the road, shared with the iPhone', () => {
  const spec = ranks as unknown as RanksFile
  const day = (n: number): string => `2026-09-${String(10 + n).padStart(2, '0')}`
  const takes = (words: number[]): SessionEvent[] =>
    words.map((w, i) => ({ at: 1_789_000_000_000 + i * 86_400_000, durationMs: 1000, rawText: '', finalText: '', words: w, wpm: 0, day: day(i) }))

  it('runs every rank after none, the founder rank only on the founder road', () => {
    const road = roadRanks(spec.ranks, false)
    expect(road[0].id).toBe('white')
    expect(road.some((r) => r.id === 'none' || r.founderOnly)).toBe(false)
    expect(roadRanks(spec.ranks, true).length).toBe(road.length + spec.ranks.filter((r) => r.founderOnly).length)
  })

  it('measures since your rank, and a closed gate is the whole way', () => {
    expect(sinceRank(7_380, 6_000, 12_000)).toBeCloseTo(0.23)
    expect(sinceRank(5_000, 6_000, 12_000)).toBe(0)
    expect(sinceRank(13_000, 6_000, 12_000)).toBe(1)
    expect(sinceRank(10, 6, 6)).toBe(1)
  })

  it('places practice on the road by the slower gate', () => {
    const progress = computeProgress(takes([1300, 1300]), spec)
    const place = roadPlace(progress, spec.ranks)
    expect(place.road[place.roadIndex].id).toBe('white-1')
    expect(place.toNext).toBeCloseTo(Math.min(sinceRank(2600, 2500, 6000), sinceRank(2, 2, 4)))
    expect(place.you).toBeCloseTo(youX(place.roadIndex, place.toNext, place.road.length))
    const none = roadPlace(computeProgress([], spec), spec.ranks)
    expect(none.roadIndex).toBe(-1)
    expect(none.you).toBe(ROAD.pad)
  })

  it('leaves its words off for a page that sets them natively', () => {
    const progress = computeProgress(takes([1300, 1300]), spec)
    const place = roadPlace(progress, spec.ranks)
    const written = (text: boolean): string[] => {
      const said: string[] = []
      const ctx = new Proxy({} as Record<string | symbol, unknown>, {
        get: (target, key) => {
          if (key in target) return target[key]
          if (key === 'fillText') return (words: string) => said.push(words)
          if (key === 'measureText') return () => ({ width: 30 })
          return () => undefined
        },
        set: (target, key, value) => {
          target[key] = value
          return true
        }
      }) as unknown as CanvasRenderingContext2D
      paintRoad(ctx, place.road, place.roadIndex, place.you, place.you, '2,600 words', journeyColors(cosmetics.beltColors), 'monospace', text)
      return said
    }
    expect(written(true)).toContain('2,600 words')
    expect(written(true)).toContain('white')
    expect(written(false)).toEqual([])
  })

  it('names each belt group once, under where it starts, coral once', () => {
    const road = roadRanks(spec.ranks, false)
    const groups = roadGroups(road)
    expect(groups.map((g) => g.name)).toEqual(['white', 'blue', 'purple', 'brown', 'black', 'coral', 'red'])
    expect(groups[1].x).toBe(rankX(road.findIndex((r) => r.belt === 'blue'), road.length))
  })
})

describe('the ceremony scene', () => {
  it('sweeps the new belt in its own color, splats, and lays a rice stroke', () => {
    const c = journeyColors(cosmetics.beltColors)
    const blue = (ranks as unknown as RanksFile).ranks.find((r) => r.id === 'blue')
    if (!blue) throw new Error('no blue belt')
    const items = ceremonyScene(blue, 390, 844, c)
    expect(items.length).toBe(4)
    expect(items[0].stroke?.opts.rgb).toEqual(beltOnInk('blue', c))
    expect(items.filter((i) => i.splat).length).toBe(2)
    expect(items.map((i) => i.start ?? 0)).toEqual([...items.map((i) => i.start ?? 0)].sort((a, b) => a - b))
  })
})
