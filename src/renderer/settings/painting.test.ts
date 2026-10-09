// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { SUBJECTS } from '../../shared/painting'
import { MAX_FLOURISHES, allocate, clusterFor, flourish, paintingCaption, paintingLine, planPainting } from './painting'

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
            plan.forEach((gesture, g) => {
              if (gesture.length === 0) bad.push(`${at}: an empty gesture`)
              // Every take paints something on the canvas.
              const seen = gesture.some((m) => ('pts' in m ? m.pts.some(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1) : m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1))
              if (!seen) bad.push(`${at}: take ${g + 1} is off the canvas`)
              for (const mark of gesture) {
                const vs = 'pts' in mark ? mark.pts.flat() : [mark.x, mark.y]
                if (vs.some((v) => !Number.isFinite(v) || v < -0.4 || v > 1.4)) bad.push(`${at}: ${mark.kind} far outside the frame`)
                // Plants stay inside the frame: blossoms, buds, needles, and
                // small strokes that are not grounds bled to the edge.
                if (mark.kind === 'blossom' || mark.kind === 'bud' || mark.kind === 'needles') {
                  if (mark.x < 0.02 || mark.x > 0.98 || mark.y < 0.02 || mark.y > 0.98) bad.push(`${at}: a ${mark.kind} past the frame`)
                } else if (mark.kind === 'stroke' && mark.tone !== 'wash') {
                  const bled = mark.pts.some(([x, y]) => x < -0.03 || x > 1.03 || y > 1.03)
                  const xs = mark.pts.map((p) => p[0])
                  const ys = mark.pts.map((p) => p[1])
                  const small = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 0.3
                  if (small && !bled && mark.pts.some(([x, y]) => x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98)) bad.push(`${at}: a small stroke past the frame`)
                }
              }
            })
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

  it('past its size a painting keeps taking small strokes: echoes of its own, in the frame, each in its place', () => {
    expect(MAX_FLOURISHES).toBeGreaterThanOrEqual(20)
    for (const subject of SUBJECTS) {
      const plan = planPainting({ subject, seed: 31, target: 12, tier: 1, level: 1 })
      for (let i = 0; i < MAX_FLOURISHES; i++) {
        const extra = flourish(plan, 31, i)
        expect(extra.length).toBeGreaterThan(0)
        expect(flourish(plan, 31, i)).toEqual(extra)
        for (const m of extra) {
          expect(m.kind === 'fill' || m.kind === 'blot' || (m.kind === 'stroke' && m.tone === 'wash')).toBe(false)
          const vs = 'pts' in m ? m.pts.flat() : [m.x, m.y]
          for (const v of vs) expect(v >= 0.02 && v <= 0.98, `${subject} flourish ${i}`).toBe(true)
        }
      }
      expect(flourish(plan, 31, 0)).not.toEqual(flourish(plan, 31, 1))
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

  it('a finished painting counts the strokes it keeps taking', () => {
    expect(paintingCaption('bamboo', 13, 12)).toBe('bamboo, finished, and 1 stroke more')
    expect(paintingCaption('bamboo', 22, 12)).toBe('bamboo, finished, and 10 strokes more')
  })

  it('a finished painting gets a line from its own numbers', () => {
    expect(paintingLine([300, 900, 40], 72_000)).toBe('3 takes, 1,240 words. The longest ran 1:12.')
    expect(paintingLine([10], null)).toBe('1 take, 10 words.')
  })
})
