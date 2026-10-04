// SPDX-License-Identifier: GPL-3.0-only
// The share card, painted from your month (US-078): one stroke per day you
// dictated in the last thirty, fanned out from a point, longer for more
// words and heavier for more sessions, ember on your three biggest days.
// The same history always paints the same card; two histories paint two
// cards. The rank is set in the display face (Bricolage Grotesque, allowed
// on the share card), over a fade that keeps the words legible.
import type { RankSpec } from '../../shared/ranks'
import { type SceneItem, cachedBrush, lerp, mix, mulberry, paintScene, path, rgba, splat } from '../brush'
import { type JourneyColors, paintBelt } from './journeyPaint'
import { daySeed } from './inkMarks'

export const CARD_W = 840
export const CARD_H = 440
export const CARD_DAYS = 30

export interface CardDay {
  day: string
  words: number
  sessions: number
}

export interface CardData {
  days: CardDay[]
  rank: RankSpec
  level: number
  founder: boolean
}

export interface CardFonts {
  display: string
  body: string
  mono: string
}

/** The card's seed: every day and its words, so any change repaints. */
export function cardSeed(days: readonly CardDay[]): number {
  return daySeed(days.map((d) => `${d.day}:${d.words}:${d.sessions}`).join('|'))
}

/** The three biggest days by words (their indexes), ties to the later. */
export function biggestDays(days: readonly CardDay[]): number[] {
  return days
    .map((d, i) => ({ words: d.words, i }))
    .filter((d) => d.words > 0)
    .sort((a, b) => b.words - a.words || b.i - a.i)
    .slice(0, 3)
    .map((d) => d.i)
}

/** The month as brush marks: a stroke per active day, in day order. */
export function cardScene(days: readonly CardDay[], c: JourneyColors): SceneItem[] {
  const seed = cardSeed(days)
  const r = mulberry(seed)
  const top = biggestDays(days)
  const F: [number, number] = [610, 225]
  const items: SceneItem[] = []
  const last = Math.max(1, days.length - 1)
  days.forEach((d, i) => {
    if (d.words <= 0) return
    const ang = lerp(-2.5, 2.5, i / last) + (r() - 0.5) * 0.18
    const len = 90 + Math.sqrt(d.words) * 4.4
    const width = 5 + Math.min(14, d.sessions) * 2.2
    const sx = F[0] - Math.cos(ang) * len * 0.25
    const sy = F[1] - Math.sin(ang) * len * 0.25
    const ex = F[0] + Math.cos(ang) * len * 0.75
    const ey = F[1] + Math.sin(ang) * len * 0.75
    const bend = (r() - 0.5) * 30
    const big = top.includes(i)
    const pick = r()
    const rgb = big ? c.ember : pick < 0.4 ? mix(c.smoke, c.ink, 0.35) : pick < 0.85 ? c.smoke : mix(c.smoke, c.dim, 0.5)
    const dry = 0.4 + r() * 0.35
    items.push({
      start: i * 28,
      dur: 360,
      stroke: {
        P: path(
          [
            [sx, sy],
            [(sx + ex) / 2 - Math.sin(ang) * bend, (sy + ey) / 2 + Math.cos(ang) * bend],
            [ex, ey]
          ],
          2
        ),
        B: cachedBrush(2000 + (seed % 97) + i, 24),
        opts: { width, rgb, alpha: big ? 0.95 : 0.85, dry }
      },
      ...(big ? { splat: { sp: splat(seed + i, ex, ey, { r: width * 0.9, count: 14, mist: 14 }), rgb: c.ember } } : {})
    })
  })
  return items
}

/** Paints the whole card at CARD_W by CARD_H (scale the context first). */
export function paintShareCard(ctx: CanvasRenderingContext2D, data: CardData, c: JourneyColors, fonts: CardFonts): void {
  ctx.fillStyle = rgba(c.ink)
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  paintScene(ctx, cardScene(data.days, c))
  // A fade from the left keeps the words legible over the paint.
  const fade = ctx.createLinearGradient(0, 0, 560, 0)
  fade.addColorStop(0, rgba(c.ink, 0.96))
  fade.addColorStop(0.62, rgba(c.ink, 0.82))
  fade.addColorStop(1, rgba(c.ink, 0))
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, 560, CARD_H)

  const condensed = (on: boolean): void => {
    if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = on ? 'condensed' : 'normal'
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  condensed(true)
  ctx.fillStyle = rgba(c.rice)
  ctx.font = `800 26px ${fonts.display}`
  ctx.fillText('murmur', 56, 76)

  ctx.save()
  ctx.translate(50, 104)
  paintBelt(ctx, 330, 70, data.rank.belt, data.rank.belt === 'red' ? 0 : data.rank.stripes, c)
  ctx.restore()
  if (data.founder) {
    ctx.fillStyle = rgba(c.founder)
    ctx.font = `26px ${fonts.body}`
    ctx.textAlign = 'center'
    ctx.fillText('♛', 50 + 165, 104 + 44)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = rgba(c.text)
  let size = 40
  ctx.font = `800 ${size}px ${fonts.display}`
  // Long ranks (the coral belts) shrink to fit beside the paint.
  while (ctx.measureText(data.rank.label).width > 470 && size > 24) {
    size -= 2
    ctx.font = `800 ${size}px ${fonts.display}`
  }
  ctx.fillText(data.rank.label, 56, 232)
  condensed(false)
  ctx.fillStyle = rgba(c.dim)
  ctx.font = `italic 17px ${fonts.body}`
  ctx.fillText(`"${data.rank.title}"`, 56, 262)

  const total = data.days.reduce((n, d) => n + d.words, 0)
  const active = data.days.filter((d) => d.words > 0).length
  ctx.fillStyle = rgba(c.text)
  ctx.font = `14px ${fonts.mono}`
  ctx.fillText(`${total.toLocaleString()} words in the last ${CARD_DAYS} days, ${active} days on the mat`, 56, 318)
  ctx.fillStyle = rgba(c.dim)
  ctx.font = `12px ${fonts.mono}`
  ctx.fillText(`lvl. ${data.level.toLocaleString()}`, 56, 342)
  ctx.font = `11px ${fonts.mono}`
  ctx.fillText('push-to-talk dictation. earned, never bought.', 56, 392)
}
