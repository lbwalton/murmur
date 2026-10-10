// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import ranksFile from '../../../shared/ranks.json'
import type { RankSpec } from '../../shared/ranks'
import type { JourneyColors } from './journeyPaint'
import { type CardDay, biggestDays, cardScene, cardSeed, displayFont, paintShareCard, plainWidth } from './cardPaint'
import { paintPaintingCard, paintWeekScroll, paintingColors, planPainting } from './painting'

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

describe('the display face on a card', () => {
  /** A canvas the way Chromium keeps one: setting the font resets the
   *  width to normal. */
  const canvasLike = (): CanvasRenderingContext2D => {
    let font = ''
    let stretch = 'normal'
    return {
      get font() {
        return font
      },
      set font(v: string) {
        font = v
        stretch = 'normal'
      },
      get fontStretch() {
        return stretch
      },
      set fontStretch(v: string) {
        stretch = v
      }
    } as unknown as CanvasRenderingContext2D
  }
  const width = (ctx: CanvasRenderingContext2D): string => (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch

  /** A canvas that draws nothing and notes, for each line of text, its
   *  font and its width at the moment it was drawn. */
  const recording = (): { ctx: CanvasRenderingContext2D; texts: Array<{ text: string; font: string; stretch: string }> } => {
    const texts: Array<{ text: string; font: string; stretch: string }> = []
    const kept: Record<string | symbol, unknown> = { font: '', fontStretch: 'normal' }
    const noop = (): void => undefined
    const calls: Record<string, unknown> = {
      measureText: (t: string) => ({ width: t.length * Number(/(\d+)px/.exec(String(kept.font))?.[1] ?? 10) * 0.6 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      fillText: (text: string) => texts.push({ text, font: String(kept.font), stretch: String(kept.fontStretch) })
    }
    const ctx = new Proxy(kept, {
      has: () => true,
      get: (_, k) => (typeof k === 'string' && k in calls ? calls[k] : k in kept ? kept[k] : noop),
      set: (_, k, v) => {
        kept[k] = v
        if (k === 'font') kept.fontStretch = 'normal'
        return true
      }
    })
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts }
  }
  const fonts = { display: '"murmur display"', body: 'Inter', mono: 'Menlo' }

  it('draws every card title condensed and every other line at normal width', () => {
    const rank = (ranksFile as { ranks: RankSpec[] }).ranks.find((r) => r.label.length > 20) as RankSpec
    const pc = paintingColors(c.ink, c.rice, c.ember, c.gold)
    const ink = { text: c.text, dim: c.dim }
    const plan = planPainting({ subject: 'willow', seed: 4242, target: 12, tier: 1, level: 2 })
    const words = Array.from({ length: 12 }, (_, i) => 30 + i * 9)
    const cards: Array<(ctx: CanvasRenderingContext2D) => void> = [
      (ctx) => paintShareCard(ctx, { days: month([400, 0, 1200, 3000]), rank, level: 2, founder: true }, c, fonts),
      (ctx) =>
        paintPaintingCard(ctx, plan, words, pc, ink, fonts, { date: 'Friday, October 9', title: 'willow by the water', caption: 'finished in 12 strokes', line: 'a line', painter: 'painted at blue belt' }, { done: 12, finished: true, seed: 4242 }),
      (ctx) => paintWeekScroll(ctx, [{ day: 'Mon', caption: 'a day off', painting: null }], pc, ink, fonts, { title: 'the week of October 3', numbers: '1 painting' })
    ]
    for (const paint of cards) {
      const { ctx, texts } = recording()
      paint(ctx)
      const titles = texts.filter((t) => t.font.includes(fonts.display))
      expect(titles.length).toBeGreaterThan(0)
      for (const t of texts) expect([t.text, t.stretch]).toEqual([t.text, t.font.includes(fonts.display) ? 'condensed' : 'normal'])
    }
  })

  it('stays condensed through every size a title shrinks to', () => {
    const ctx = canvasLike()
    for (const size of [46, 44, 42]) {
      displayFont(ctx, size, '"murmur display"')
      expect(ctx.font).toBe(`800 ${size}px "murmur display"`)
      expect(width(ctx)).toBe('condensed')
    }
    plainWidth(ctx)
    expect(width(ctx)).toBe('normal')
  })
})
