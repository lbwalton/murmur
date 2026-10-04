// SPDX-License-Identifier: GPL-3.0-only
// Today, wrapped, as a small painting (US-088): one stroke per dictation,
// fanned in the order you spoke, longer for more words, the day's biggest
// take in ember. The daily cousin of the share card (US-078), from the
// same brush engine; marks stack in start order through paintScene. The
// same day paints the same card, and a different day another.
import { formatDuration } from '../../shared/time'
import { formatMinutesBack } from '../../shared/timeback'
import { type Rgb, type SceneItem, cachedBrush, lerp, mix, mulberry, paintScene, path, rgba } from '../brush'
import { daySeed } from './inkMarks'
import type { JourneyColors } from './journeyPaint'

export interface DayTake {
  words: number
  durationMs: number
  wpm: number
}

/** The day's biggest take by words (the first, on a tie), or -1. */
export function biggestTake(takes: readonly DayTake[]): number {
  let best = -1
  takes.forEach((t, i) => {
    if (t.words > 0 && (best < 0 || t.words > takes[best].words)) best = i
  })
  return best
}

/** The day's marks on a w by h canvas, seeded by the day and its takes. */
export function dayScene(takes: readonly DayTake[], day: string, w: number, h: number, c: JourneyColors): SceneItem[] {
  const seed = daySeed(`${day}|${takes.map((t) => t.words).join(',')}`)
  const r = mulberry(seed)
  const big = biggestTake(takes)
  const F: [number, number] = [w * 0.7, h * 0.4]
  const last = Math.max(1, takes.length - 1)
  return takes.map((t, i) => {
    const ang = lerp(-2.7, 0.5, takes.length === 1 ? 0.5 : i / last) + (r() - 0.5) * 0.2
    const len = 70 + Math.sqrt(Math.max(1, t.words)) * 13
    const sx = F[0] - Math.cos(ang) * len * 0.3
    const sy = F[1] - Math.sin(ang) * len * 0.3
    const ex = F[0] + Math.cos(ang) * len * 0.7
    const ey = F[1] + Math.sin(ang) * len * 0.7
    const tone = r()
    const rgb = i === big ? c.ember : tone < 0.5 ? c.smoke : mix(c.smoke, c.dim, 0.5)
    return {
      start: i * 40,
      dur: 400,
      stroke: {
        P: path(
          [
            [sx, sy],
            [(sx + ex) / 2 + (r() - 0.5) * 20, (sy + ey) / 2 + (r() - 0.5) * 20],
            [ex, ey]
          ],
          2
        ),
        B: cachedBrush(700 + (i % 40), 24),
        opts: { width: Math.min(26, 8 + t.words / 18), rgb, alpha: 0.9, dry: 0.45 }
      }
    }
  })
}

/** The day in words: the headline, the detail line, and the text Copy
 *  summary puts on the clipboard (the two lines as shown). */
export function daySummary(takes: readonly DayTake[], minutesBack: number): { headline: string; detail: string; text: string } {
  const n = takes.length
  const words = takes.reduce((sum, t) => sum + t.words, 0)
  const longest = takes.reduce((ms, t) => Math.max(ms, t.durationMs), 0)
  const pace = takes.reduce((best, t) => Math.max(best, t.wpm), 0)
  const headline = `${n.toLocaleString()} ${n === 1 ? 'dictation' : 'dictations'}, ${words.toLocaleString()} words`
  const detail = `${formatMinutesBack(minutesBack)} back, longest take ${formatDuration(longest)}, best pace ${pace} wpm`
  return { headline, detail, text: `${headline}\n${detail}` }
}

/** The painting: the panel ground, the day's strokes, and a fade at the
 *  bottom so the summary over it stays legible. */
export function paintDay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  takes: readonly DayTake[],
  day: string,
  c: JourneyColors,
  panel: Rgb
): void {
  ctx.fillStyle = rgba(panel)
  ctx.fillRect(0, 0, w, h)
  paintScene(ctx, dayScene(takes, day, w, h, c))
  // Strong enough under the summary that a busy day's strokes never
  // crowd the words.
  const fade = ctx.createLinearGradient(0, h * 0.38, 0, h)
  fade.addColorStop(0, rgba(panel, 0))
  fade.addColorStop(0.45, rgba(panel, 0.82))
  fade.addColorStop(1, rgba(panel, 0.97))
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, h)
}

/** The saved card: the painting with the wordmark, the date, and the
 *  summary written onto it, at w by h. */
export function paintDayCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  takes: readonly DayTake[],
  day: string,
  dateLabel: string,
  summary: { headline: string; detail: string },
  c: JourneyColors,
  panel: Rgb,
  fonts: { body: string; mono: string }
): void {
  paintDay(ctx, w, h, takes, day, c, panel)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = rgba(c.gold)
  ctx.font = `12px ${fonts.mono}`
  ctx.fillText('m u r m u r', 24, 34)
  ctx.textAlign = 'right'
  ctx.fillStyle = rgba(c.dim)
  ctx.fillText(dateLabel, w - 24, 34)
  ctx.textAlign = 'left'
  ctx.fillStyle = rgba(c.text)
  ctx.font = `700 22px ${fonts.body}`
  ctx.fillText(summary.headline, 24, h - 44)
  ctx.fillStyle = rgba(c.dim)
  ctx.font = `12px ${fonts.mono}`
  ctx.fillText(summary.detail, 24, h - 22)
}
