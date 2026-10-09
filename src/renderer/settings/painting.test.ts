// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { SUBJECTS } from '../../shared/painting'
import { allocate, clusterFor, paintingCaption, paintingLine, planPainting } from './painting'

describe('sharing strokes across layers', () => {
  it('always adds up to the size, minimums first, never past a maximum', () => {
    const layers = [
      { weight: 0, min: 1, max: 1 },
      { weight: 1, min: 0, max: 3 },
      { weight: 3, min: 2 },
      { weight: 2, min: 1 }
    ]
    for (let total = 4; total <= 40; total++) {
      const counts = allocate(total, layers)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total)
      expect(counts[0]).toBe(1)
      expect(counts[1]).toBeLessThanOrEqual(3)
      expect(counts[2]).toBeGreaterThanOrEqual(2)
    }
    expect(allocate(16, layers)).toEqual([1, 3, 7, 5])
  })

  it('a size too small for every minimum takes from the last layers first', () => {
    expect(allocate(2, [{ weight: 1, min: 2 }, { weight: 1, min: 2 }])).toEqual([2, 0])
  })
})

describe('the plan', () => {
  it('is one gesture per stroke, for every subject, tier, and size', () => {
    for (const subject of SUBJECTS) {
      for (let tier = 0; tier <= 4; tier++) {
        for (const target of [6, 7, 8, 12, 18, 24, 36]) {
          const plan = planPainting({ subject, seed: 1234 + target, target, tier, level: 1 })
          expect(plan).toHaveLength(target)
          for (const gesture of plan) {
            expect(gesture.length).toBeGreaterThan(0)
            for (const mark of gesture) {
              const xs = mark.kind === 'stroke' || mark.kind === 'fill' ? mark.pts.map((p) => p[0]) : [mark.x]
              const ys = mark.kind === 'stroke' || mark.kind === 'fill' ? mark.pts.map((p) => p[1]) : [mark.y]
              for (const v of [...xs, ...ys]) {
                expect(v, `${subject} tier ${tier} size ${target}`).toBeGreaterThan(-0.3)
                expect(v, `${subject} tier ${tier} size ${target}`).toBeLessThan(1.3)
              }
            }
          }
        }
      }
    }
  })

  it('the same day paints the same plan; another seed another', () => {
    const a = planPainting({ subject: 'bamboo', seed: 7, target: 12, tier: 1, level: 1 })
    expect(planPainting({ subject: 'bamboo', seed: 7, target: 12, tier: 1, level: 1 })).toEqual(a)
    expect(planPainting({ subject: 'bamboo', seed: 8, target: 12, tier: 1, level: 1 })).not.toEqual(a)
  })

  it('richer from rank: more marks per stroke, washes from blue, splatter from purple', () => {
    const marks = (tier: number): number =>
      planPainting({ subject: 'plum', seed: 99, target: 18, tier, level: 1 }).reduce((n, g) => n + g.length, 0)
    expect(clusterFor(0)).toBe(1)
    expect(clusterFor(2)).toBe(2)
    expect(clusterFor(4)).toBe(3)
    expect(marks(1)).toBeGreaterThan(marks(0))
    expect(marks(4)).toBeGreaterThan(marks(2))
    const kinds = (tier: number): Set<string> =>
      new Set(planPainting({ subject: 'plum', seed: 99, target: 18, tier, level: 1 }).flat().map((m) => (m.kind === 'stroke' ? `stroke:${m.tone}` : m.kind)))
    expect(kinds(0).has('splat')).toBe(false)
    expect(kinds(2).has('splat')).toBe(true)
  })

  it('levels add birds to the last stroke', () => {
    const last = (level: number): number => planPainting({ subject: 'moon', seed: 5, target: 8, tier: 0, level }).at(-1)?.length ?? 0
    expect(last(2)).toBe(last(1) + 1)
    expect(last(9)).toBe(last(1) + 2)
  })
})

describe('words', () => {
  it('the subject stays a surprise for two strokes', () => {
    expect(paintingCaption('bamboo', 2, 12)).toBe('a painting, 2 of 12 strokes')
    expect(paintingCaption('bamboo', 3, 12)).toBe('bamboo, 3 of 12 strokes')
    expect(paintingCaption('plum', 12, 12)).toBe('plum branch, finished')
  })

  it('a finished painting gets a line from its own numbers', () => {
    expect(paintingLine([300, 900, 40], 72_000)).toBe('3 takes, 1,240 words. The longest ran 1:12.')
    expect(paintingLine([10], null)).toBe('1 take, 10 words.')
  })
})
