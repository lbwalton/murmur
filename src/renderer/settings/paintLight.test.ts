// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { SUBJECTS } from '../../shared/painting'
import { type Mark } from './paintKit'
import { lightFor, occupancy, planLight } from './paintLight'
import { planPainting } from './painting'

const HOURS = { dawn: 7, day: 13, dusk: 19, night: 23 }

/** Every point a mark touches. */
const pointsOf = (m: Mark): [number, number][] => ('pts' in m ? m.pts : [[m.x, m.y]])

describe('the light', () => {
  it('follows the hour: dawn from 5, day from 10, dusk from 17, night from 21', () => {
    expect([0, 4, 5, 9, 10, 16, 17, 20, 21, 23].map(lightFor)).toEqual(['night', 'night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night'])
  })

  it('is the same every time, and what grows later never moves it', () => {
    const record = { subject: 'bamboo' as const, seed: 31, target: 12, tier: 1, level: 1 }
    const base = planPainting(record)
    const grown = planPainting(record, Array.from({ length: 30 }, (_, i) => 20 + i * 7))
    for (const hour of Object.values(HOURS)) {
      expect(planLight(base, 12, 31, 1, hour)).toEqual(planLight(base, 12, 31, 1, hour))
      expect(planLight(grown, 12, 31, 1, hour)).toEqual(planLight(base, 12, 31, 1, hour))
    }
  })

  it('every subject gets its light inside the frame: a sun by day, a crescent and stars at night, never a second moon', () => {
    const bad: string[] = []
    for (const subject of SUBJECTS) {
      for (const tier of [0, 3]) {
        for (const seed of [5, 808]) {
          const plan = planPainting({ subject, seed, target: 14, tier, level: 1 })
          const hasMoon = plan.flat().some((m) => m.kind === 'stroke' && m.moon === true)
          const grid = occupancy(plan)
          for (const [light, hour] of Object.entries(HOURS)) {
            const at = `${subject} tier ${tier} seed ${seed} ${light}`
            const marks = planLight(plan, 14, seed, tier, hour)
            if (marks.some((m) => pointsOf(m).some(([x, y]) => x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98))) bad.push(`${at}: off the frame`)
            const discs = marks.filter((m) => m.kind === 'blot' && m.alpha >= 0.6)
            if (light === 'night') {
              const stars = marks.filter((m): m is Extract<Mark, { kind: 'bud' }> => m.kind === 'bud')
              if (stars.length < 10) bad.push(`${at}: ${stars.length} stars`)
              if (stars.some((s) => grid[Math.floor(s.y * 16) * 20 + Math.floor(s.x * 20)] > 0)) bad.push(`${at}: a star on paint`)
              if (discs.length !== (hasMoon ? 0 : 1)) bad.push(`${at}: ${discs.length} moons beside its own`)
            } else if (discs.length !== (hasMoon ? 0 : 1)) {
              bad.push(`${at}: ${discs.length} suns`)
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('a painting with its own moon gets its afterglow under that moon, low or high', () => {
    const bad: string[] = []
    for (const subject of SUBJECTS) {
      for (const seed of [1, 5, 77, 808, 1234]) {
        const plan = planPainting({ subject, seed, target: 14, tier: 3, level: 1 })
        const moon = plan.flat().find((m) => m.kind === 'stroke' && m.moon === true)
        if (!moon || !('pts' in moon)) continue
        const lowest = Math.max(...moon.pts.map((p) => p[1]))
        for (const hour of [HOURS.dawn, HOURS.day, HOURS.dusk]) {
          for (const m of planLight(plan, 14, seed, 3, hour)) {
            if (m.kind !== 'stroke') continue
            if (Math.min(...m.pts.map((p) => p[1])) <= lowest) bad.push(`${subject} seed ${seed} hour ${hour}: a band above its moon`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('no star sits under an ink stroke, at any tier, size, or seed', () => {
    const bad: string[] = []
    for (const subject of SUBJECTS) {
      for (const tier of [0, 2, 4]) {
        for (const target of [6, 14, 24]) {
          for (const seed of [5, 808]) {
            const plan = planPainting({ subject, seed, target, tier, level: 1 })
            const strokes = plan.flat().filter((m): m is Extract<Mark, { kind: 'stroke' }> => m.kind === 'stroke' && m.tone !== 'wash')
            const stars = planLight(plan, target, seed, tier, HOURS.night).filter((m): m is Extract<Mark, { kind: 'bud' }> => m.kind === 'bud')
            for (const star of stars) {
              // In canvas proportions (4 wide, 3 tall), against the boldest stroke weight.
              const hit = strokes.some((m) => {
                const reach = (m.w * 4 * 1.25) / 2 + star.r * 4
                return m.pts.some((p, i) => {
                  if (i === 0) return false
                  const [ax, ay] = [m.pts[i - 1][0] * 4, m.pts[i - 1][1] * 3]
                  const [bx, by] = [p[0] * 4, p[1] * 3]
                  const [px, py] = [star.x * 4, star.y * 3]
                  const len = (bx - ax) ** 2 + (by - ay) ** 2
                  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len))
                  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) < reach
                })
              })
              if (hit) bad.push(`${subject} tier ${tier} size ${target} seed ${seed}: a star at ${star.x.toFixed(3)}, ${star.y.toFixed(3)}`)
            }
          }
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('the moon over water keeps its own moon in every light', () => {
    const plan = planPainting({ subject: 'moon', seed: 3, target: 10, tier: 0, level: 1 })
    for (const hour of Object.values(HOURS)) expect(planLight(plan, 10, 3, 0, hour).filter((m) => m.kind === 'blot')).toEqual([])
  })
})
