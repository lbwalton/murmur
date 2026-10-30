// SPDX-License-Identifier: GPL-3.0-only
// A day's painting as both platforms show it (US-098; ios/prd.json
// IOS-019): its plan, how far it got, its seal, its light, who painted it,
// and the saved card and week scroll drawn onto a canvas. Desktop's
// wrap-up and the iPhone's painter page both draw from here.
import cosmeticsFile from '../../../shared/cosmetics.json'
import ranksFile from '../../../shared/ranks.json'
import { type PaintingBook, type PaintingRecord, SUBJECT_NAMES, sealBelt, weekLine, weekOf } from '../../shared/painting'
import type { RankSpec } from '../../shared/ranks'
import { tokenColor } from '../brush'
import { journeyColors, sealPaint } from './journeyPaint'
import { LIGHT_WORDS, lightFor, planLight } from './paintLight'
import {
  type Gesture,
  MAX_EXTRA,
  type PaintingColors,
  type ScrollDay,
  type SealColor,
  paintPaintingCard,
  paintingColors,
  paintingLine,
  paintWeekScroll,
  planPainting
} from './painting'

const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors
const LADDER = (ranksFile as { ranks: RankSpec[] }).ranks

/** The colors a day's painting paints with, on the panel. */
export function dayColors(): PaintingColors {
  const c = journeyColors(BELT_HEX)
  return paintingColors(tokenColor('--panel', [23, 22, 27]), c.rice, c.ember, c.gold)
}

/** How far a painting has got: its strokes so far (past its size, the
 *  strokes a finished painting keeps adding) and whether it is finished. */
export function progressOf(record: PaintingRecord): { done: number; finished: boolean } {
  return { done: Math.min(record.words.length, record.target + MAX_EXTRA), finished: record.words.length >= record.target }
}

/** A day's whole plan: its strokes, then what each take past its size
 *  added, from that take's words. */
export function planFor(record: PaintingRecord): Gesture[] {
  const { subject, seed, target, tier, level } = record
  return planPainting({ subject, seed, target, tier, level }, record.words.slice(target, target + MAX_EXTRA))
}

/** The rank and level a day was painted at, for its card, and its light
 *  once it has one: white belt, one stripe, level 1, by moonlight.
 *  Records from before ranks were kept name the level. */
export function painterOf(record: PaintingRecord): string {
  const light = record.hour !== undefined && record.words.length >= record.target ? `, ${LIGHT_WORDS[lightFor(record.hour)]}` : ''
  if (record.rank === 'none') return `painted before the first belt, level ${record.level}${light}`
  const rank = LADDER.find((r) => r.id === record.rank)
  return `${rank ? `painted at ${rank.label}, level` : 'painted at level'} ${record.level}${light}`
}

/** A finished painting's light (US-100), from the hour its takes were
 *  made in; none before it finishes. */
export function lightOf(record: PaintingRecord, plan: readonly Gesture[]): Gesture | undefined {
  if (record.hour === undefined || record.words.length < record.target) return undefined
  return planLight(plan, record.target, record.seed, record.tier, record.hour)
}

/** The seal's color (US-101): the belt the day was painted at, as paint
 *  on the night ground, the coral belts in their two colors; undefined
 *  keeps the ember seal (before the first belt, or a record from before
 *  ranks were kept). */
export function sealOf(record: PaintingRecord): SealColor | undefined {
  const belt = sealBelt(record.rank, LADDER)
  return belt ? sealPaint(belt, journeyColors(BELT_HEX)) : undefined
}

/** A day's key as words: Friday, October 9. */
export function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

/** A day's key as its short weekday: Fri. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short' })
}

/** The fonts a saved card draws with: the display face (its family name)
 *  when it loaded, else a condensed system face. */
export function cardFonts(display: string | null): { display: string; body: string; mono: string } {
  const css = getComputedStyle(document.documentElement)
  const body = css.getPropertyValue('--font-body').trim() || 'sans-serif'
  return {
    display: display ? `"${display}", ${body}` : `"Arial Narrow", "Helvetica Neue", ${body}`,
    body,
    mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
  }
}

/**
 * A day's portrait card (CARD, saved at twice its size): the painting as
 * it stands, its name, how far it got, the date, and the wordmark, drawn
 * on `ctx`, already scaled.
 */
export function drawDayCard(
  ctx: CanvasRenderingContext2D,
  day: string,
  record: PaintingRecord,
  colors: PaintingColors,
  longestMs: number | null,
  fonts: { display: string; body: string; mono: string }
): void {
  const { subject, seed, target } = record
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  const c = journeyColors(BELT_HEX)
  const more = done - target
  paintPaintingCard(
    ctx,
    plan,
    record.words,
    colors,
    { text: c.text, dim: c.dim },
    fonts,
    {
      date: longDate(day),
      // The subject stays a surprise until its third stroke here too.
      title: done < 3 ? 'a painting' : SUBJECT_NAMES[subject],
      caption: finished ? `finished in ${target} strokes${more > 0 ? `, and ${more} more` : ''}` : `${done} of ${target} strokes so far`,
      line: finished ? paintingLine(record.words, longestMs) : null,
      painter: painterOf(record)
    },
    { done, finished, seed, sealColor: sealOf(record), light: lightOf(record, plan) }
  )
}

/**
 * The week's scroll (US-102, SCROLL, saved at twice its size): the seven
 * days ending on `last` side by side, each painting as it stands with its
 * seal and light, a day without takes as one dry mark, and the week's
 * numbers, drawn on `ctx`, already scaled.
 */
export function drawWeekScroll(
  ctx: CanvasRenderingContext2D,
  last: string,
  book: PaintingBook,
  colors: PaintingColors,
  fonts: { display: string; body: string; mono: string }
): void {
  const week = weekOf(last)
  const days: ScrollDay[] = week.map((day) => {
    const record = Object.hasOwn(book, day) ? book[day] : null
    if (!record) return { day: shortDay(day), caption: 'a day off', painting: null }
    const plan = planFor(record)
    const { done, finished } = progressOf(record)
    return {
      day: shortDay(day),
      caption: finished ? SUBJECT_NAMES[record.subject] : `${done} of ${record.target}`,
      painting: { plan, words: record.words, opts: { done, seal: finished ? 1 : 0, seed: record.seed, sealColor: sealOf(record), light: lightOf(record, plan) } }
    }
  })
  const [y, m, d] = week[0].split('-').map(Number)
  const title = `the week of ${new Date(y, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric' })}`
  const c = journeyColors(BELT_HEX)
  paintWeekScroll(ctx, days, colors, { text: c.text, dim: c.dim }, fonts, { title, numbers: weekLine(book, last) })
}
