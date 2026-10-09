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
  it('is one gesture per stroke, for every subject, tier, size, and a few seeds', () => {
    const bad: string[] = []
    for (const subject of SUBJECTS) {
      for (let tier = 0; tier <= 4; tier++) {
        for (let target = 6; target <= 36; target++) {
          for (const seed of [1234 + target, 99 * target + tier]) {
            const plan = planPainting({ subject, seed, target, tier, level: 1 })
            const at = `${subject} tier ${tier} size ${target} seed ${seed}`
            if (plan.length !== target) bad.push(`${at}: ${plan.length} gestures`)
            for (const gesture of plan) {
              if (gesture.length === 0) bad.push(`${at}: an empty gesture`)
              for (const mark of gesture) {
                const vs = 'pts' in mark ? mark.pts.flat() : [mark.x, mark.y]
                if (vs.some((v) => !Number.isFinite(v) || v < -0.3 || v > 1.3)) bad.push(`${at}: ${mark.kind} outside the frame`)
              }
            }
          }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('the same day paints the same plan; another seed another', () => {
    const a = planPainting({ subject: 'bamboo', seed: 7, target: 12, tier: 1, level: 1 })
    expect(planPainting({ subject: 'bamboo', seed: 7, target: 12, tier: 1, level: 1 })).toEqual(a)
    expect(planPainting({ subject: 'bamboo', seed: 8, target: 12, tier: 1, level: 1 })).not.toEqual(a)
  })

  it('richer from rank: more marks per stroke, washes from blue, splatter from purple', () => {
    const marks = (tier: number): number =>
      planPainting({ subject: 'plum', seed: 99, target: 18, tier, level: 1 }).reduce((n, g) => n + g.length, 0)
    expect([0, 1, 2, 3, 4].map(clusterFor)).toEqual([1, 1, 2, 3, 4])
    expect(marks(1)).toBeGreaterThan(marks(0))
    expect(marks(4)).toBeGreaterThan(marks(2))
    const kinds = (tier: number): Set<string> =>
      new Set(planPainting({ subject: 'plum', seed: 99, target: 18, tier, level: 1 }).flat().map((m) => (m.kind === 'stroke' ? `stroke:${m.tone}` : m.kind)))
    expect(kinds(0).has('splat')).toBe(false)
    expect(kinds(2).has('splat')).toBe(true)
  })

  it('every subject climbs with rank: washes from blue, splatter from purple, more marks from purple on', () => {
    const plan = (subject: (typeof SUBJECTS)[number], tier: number, target: number) => planPainting({ subject, seed: 4242, target, tier, level: 1 })
    // A belt wash: the kit's wash, faint (its alpha stays under a third).
    const washes = (g: ReturnType<typeof plan>): number =>
      g.flat().filter((m) => m.kind === 'stroke' && m.tone === 'wash' && m.dry === 0.92 && m.alpha !== undefined && m.alpha < 0.33).length
    const marks = (g: ReturnType<typeof plan>): number => g.reduce((n, x) => n + x.length, 0)
    for (const subject of SUBJECTS) {
      for (const target of [8, 16, 30]) {
        expect(washes(plan(subject, 0, target)), `${subject} ${target}`).toBe(0)
        expect(washes(plan(subject, 1, target)), `${subject} ${target}`).toBeGreaterThan(0)
        expect(plan(subject, 2, target).flat().some((m) => m.kind === 'splat'), `${subject} ${target}`).toBe(true)
        expect(marks(plan(subject, 4, target)), `${subject} ${target}`).toBeGreaterThan(marks(plan(subject, 2, target)))
        expect(marks(plan(subject, 2, target)), `${subject} ${target}`).toBeGreaterThan(marks(plan(subject, 0, target)))
      }
      for (let target = 6; target <= 36; target++) {
        expect(plan(subject, 2, target).flat().some((m) => m.kind === 'splat'), `${subject} splatter at ${target}`).toBe(true)
      }
    }
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
