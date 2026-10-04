// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { JourneyColors } from './journeyPaint'
import { biggestTake, dayScene, daySummary } from './dayPaint'

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
const take = (words: number, durationMs = 20_000, wpm = 150): { words: number; durationMs: number; wpm: number } => ({ words, durationMs, wpm })

describe('the wrap-up painting', () => {
  const day = [take(80), take(210), take(64), take(330, 72_000, 168), take(95)]

  it('paints one stroke per dictation, the biggest in ember, longer for more words', () => {
    const scene = dayScene(day, '2026-10-03', 600, 230, c)
    expect(scene).toHaveLength(5)
    expect(biggestTake(day)).toBe(3)
    expect(scene.filter((it) => it.stroke?.opts.rgb === c.ember)).toHaveLength(1)
    expect(scene[3].stroke?.opts.rgb).toBe(c.ember)
    expect(scene[3].stroke?.P.total).toBeGreaterThan(scene[2].stroke?.P.total ?? 0)
    expect(scene.map((it) => it.start)).toEqual([0, 40, 80, 120, 160])
  })

  it('paints the same day the same way and another day another way', () => {
    const a = JSON.stringify(dayScene(day, '2026-10-03', 600, 230, c))
    expect(JSON.stringify(dayScene(day, '2026-10-03', 600, 230, c))).toBe(a)
    expect(JSON.stringify(dayScene(day, '2026-10-04', 600, 230, c))).not.toBe(a)
  })

  it('says the day in words, as Copy summary copies it', () => {
    const s = daySummary(day, 14)
    expect(s.headline).toBe('5 dictations, 779 words')
    expect(s.detail).toBe('14 min back, longest take 1:12, best pace 168 wpm')
    expect(s.text).toBe(`${s.headline}\n${s.detail}`)
    expect(daySummary([take(12)], 0).headline).toBe('1 dictation, 12 words')
  })
})
