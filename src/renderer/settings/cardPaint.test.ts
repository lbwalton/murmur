// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { JourneyColors } from './journeyPaint'
import { type CardDay, biggestDays, cardScene, cardSeed } from './cardPaint'

const c: JourneyColors = {
  rice: [233, 227, 214],
  text: [236, 233, 228],
  ink: [15, 14, 17],
  smoke: [58, 60, 68],
  founder: [224, 182, 79],
  ember: [232, 88, 43],
  gold: [217, 164, 65],
  dim: [154, 150, 143],
  belts: {}
}

const month = (words: number[]): CardDay[] =>
  words.map((w, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, words: w, sessions: w ? 1 + Math.round(w / 300) : 0 }))

describe('the share card painter', () => {
  const a = month([0, 400, 1200, 0, 3000, 800, 0, 2200, 150, 0])

  it('paints one stroke per day dictated, ember on the three biggest', () => {
    const scene = cardScene(a, c)
    expect(scene).toHaveLength(a.filter((d) => d.words > 0).length)
    expect(biggestDays(a)).toEqual([4, 7, 2])
    const ember = scene.filter((it) => it.stroke?.opts.rgb === c.ember)
    expect(ember).toHaveLength(3)
    expect(scene.filter((it) => it.splat)).toHaveLength(3)
  })

  it('paints the same card from the same history, and another from another', () => {
    expect(JSON.stringify(cardScene(a, c))).toBe(JSON.stringify(cardScene(month([0, 400, 1200, 0, 3000, 800, 0, 2200, 150, 0]), c)))
    const b = month([0, 400, 1200, 0, 3000, 800, 0, 2200, 151, 0])
    expect(cardSeed(b)).not.toBe(cardSeed(a))
    expect(JSON.stringify(cardScene(b, c))).not.toBe(JSON.stringify(cardScene(a, c)))
  })

  it('makes longer strokes for more words and heavier ones for more sessions', () => {
    const scene = cardScene(month([200, 4000]), c)
    const len = (i: number): number => scene[i].stroke?.P.total ?? 0
    expect(len(1)).toBeGreaterThan(len(0))
    expect(scene[1].stroke?.opts.width).toBeGreaterThan(scene[0].stroke?.opts.width ?? 0)
  })
})
