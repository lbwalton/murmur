// SPDX-License-Identifier: GPL-3.0-only
// The iPhone Journey's painter page (ios/prd.json IOS-018): desktop's own
// brush engine and Journey painter (src/renderer/brush.ts and
// settings/journeyPaint.ts), bundled into the app at build time and run in
// a web view that loads nothing else. murmur asks it for pictures (the
// belt, the road, the gates, the stamps) and for the promotion ceremony;
// every word stays a native view beside or over the painting. A painting a
// day (IOS-019) paints here too, with desktop's painting engine, subjects,
// and light (settings/painting.ts, paintSubjects.ts, paintLight.ts): the
// day's painting, its newest stroke painting in, and the saved card and
// week scroll, whose words are part of the picture, as on desktop. The belt
// share card (IOS-021) is desktop's too (settings/cardPaint.ts): the last
// thirty days as strokes, the rank in the display face. So are the numbers'
// marks (IOS-022, settings/analyticsPaint.ts): the fourteen days as dabs,
// the activity wall as blots, and Home's gold stroke for today.
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import { animateScene, paintScene, type Surface, tokenColor } from '../../src/renderer/brush'
import {
  ROAD,
  beltOnInk,
  ceremonyScene,
  journeyColors,
  paintBelt,
  paintRoad,
  paintStamp,
  paintTallies,
  paintWordsGate,
  roadGroups,
  roadPlace,
  sinceRank
} from '../../src/renderer/settings/journeyPaint'
import type { PaintingBook, PaintingRecord } from '../../src/shared/painting'
import type { ProgressReport, RankSpec } from '../../src/shared/ranks'
import { CARD, SCROLL, paintPainting } from '../../src/renderer/settings/painting'
import { CARD_H, CARD_W, type CardDay, paintShareCard } from '../../src/renderer/settings/cardPaint'
import {
  CHART_H,
  DAY_STROKE_H,
  HEAT_PCT,
  type WallMark,
  dabHeight,
  heatLevel,
  paintChartDab,
  paintDayStroke,
  paintWallMarks,
  wallSize
} from '../../src/renderer/settings/analyticsPaint'
import { cardFonts, dayColors, drawDayCard, drawWeekScroll, lightOf, planFor, progressOf, sealOf } from '../../src/renderer/settings/paintingDay'

const LADDER = (ranks as { ranks: RankSpec[] }).ranks
const BELT_HEX = (cosmetics as { beltColors: Record<string, string> }).beltColors

/** Where practice stands, as murmur's own math found it. */
export interface Standing {
  rank: string
  next: string | null
  words: number
  days: number
}

export type PictureRequest =
  | { kind: 'painting'; width: number; height: number; scale: number; record: PaintingRecord }
  | { kind: 'card'; scale: number; day: string; record: PaintingRecord; longestMs: number | null }
  | { kind: 'week'; scale: number; last: string; book: PaintingBook }
  | { kind: 'belt'; width: number; height: number; scale: number; belt: string; stripes: number; drop?: number }
  | { kind: 'road'; scale: number; standing: Standing }
  | { kind: 'words'; width: number; height: number; scale: number; standing: Standing }
  | { kind: 'tallies'; width: number; height: number; scale: number; standing: Standing }
  | { kind: 'stamp'; size: number; scale: number; id: string; got: boolean; seed: number }
  | { kind: 'share'; scale: number; days: CardDay[]; rank: string; level: number }
  | { kind: 'dabs'; width: number; scale: number; days: DayWords[] }
  | { kind: 'wall'; scale: number; days: DayWords[] }
  | { kind: 'legend'; scale: number }
  | { kind: 'stroke'; width: number; scale: number; share: number; day: string }

/** A day and its words, for the numbers' marks. */
export interface DayWords {
  day: string
  words: number
}

/** The wall's color: desktop's vibrant orange default. */
const heatBase = (): [number, number, number] => tokenColor('--heat-default', [249, 115, 22])

/** Sunday-top weeks: the blank cells before the first day. */
function wallPad(first: string | undefined): number {
  if (!first) return 0
  return new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, Number(first.slice(8, 10))).getDay()
}

export interface Picture {
  png: string
  /** The road's group names and your place, for native text over it. */
  groups?: { name: string; x: number }[]
  you?: number
}

/** A token's value, as desktop's Journey reads its fonts. */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function rank(id: string | null): RankSpec | null {
  return id === null ? null : (LADDER.find((r) => r.id === id) ?? null)
}

/** Just enough of a progress report for the road: practice is the rank,
 *  as on the iPhone, where there is no founder yet. */
export function progressFor(standing: Standing): ProgressReport {
  const at = rank(standing.rank) ?? LADDER[0]
  const next = rank(standing.next)
  const practice = { rank: at, index: LADDER.indexOf(at), next, words: null, activeDays: null }
  return {
    ...practice,
    totals: { words: standing.words, activeDays: standing.days },
    promotions: [],
    founder: false,
    practice,
    level: 1
  }
}

function canvas(width: number, height: number, scale: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.createElement('canvas')
  el.width = Math.round(width * scale)
  el.height = Math.round(height * scale)
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return { el, ctx }
}

/** The display face, inlined into the page at build time, for the saved
 *  cards' titles. Absent (a build without it), the cards set their titles
 *  in a condensed system face, as desktop's do. */
const DISPLAY = 'murmur display'

async function displayFace(): Promise<string | null> {
  try {
    await document.fonts.load(`800 46px "${DISPLAY}"`)
  } catch {
    return null
  }
  const loaded = Array.from(document.fonts).some((face) => face.family.replace(/["']/g, '') === DISPLAY && face.status === 'loaded')
  return loaded ? DISPLAY : null
}

/** A day's painting at rest: its strokes, its seal once finished, and its
 *  light, on no ground (the screen's panel shows through). */
function paintDay(ctx: CanvasRenderingContext2D, w: number, h: number, record: PaintingRecord): void {
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  paintPainting(ctx, w, h, plan, record.words, dayColors(), {
    done,
    seal: finished ? 1 : 0,
    seed: record.seed,
    ground: false,
    sealColor: sealOf(record),
    light: lightOf(record, plan)
  })
}

/** One picture, as a PNG data URL. */
export async function picture(req: PictureRequest): Promise<Picture> {
  const colors = journeyColors(BELT_HEX)
  switch (req.kind) {
    case 'painting': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      paintDay(ctx, req.width, req.height, req.record)
      return { png: el.toDataURL('image/png') }
    }
    case 'card': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(CARD.W, CARD.H, req.scale)
      drawDayCard(ctx, req.day, req.record, dayColors(), req.longestMs, fonts)
      return { png: el.toDataURL('image/png') }
    }
    case 'week': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(SCROLL.W, SCROLL.H, req.scale)
      drawWeekScroll(ctx, req.last, req.book, dayColors(), fonts)
      return { png: el.toDataURL('image/png') }
    }
    case 'belt': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const newest = Math.min(req.stripes, req.belt === 'black' ? 6 : 4) - 1
      paintBelt(ctx, req.width, req.height, req.belt, req.stripes, colors, 1, req.drop === undefined ? undefined : { i: newest, k: req.drop })
      return { png: el.toDataURL('image/png') }
    }
    case 'road': {
      const { el, ctx } = canvas(ROAD.W, ROAD.H, req.scale)
      const place = roadPlace(progressFor(req.standing), LADDER)
      paintRoad(ctx, place.road, place.roadIndex, place.you, place.you, '', colors, token('--font-mono', 'monospace'), false)
      return { png: el.toDataURL('image/png'), groups: roadGroups(place.road), you: place.you }
    }
    case 'words': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const at = rank(req.standing.rank)
      const next = rank(req.standing.next)
      const pct = next ? sinceRank(req.standing.words, at?.words ?? 0, next.words ?? 0) : 1
      paintWordsGate(ctx, req.width, req.height, pct, beltOnInk(at?.belt ?? 'none', colors), colors)
      return { png: el.toDataURL('image/png') }
    }
    case 'tallies': {
      const { el, ctx } = canvas(req.width, req.height, req.scale)
      const at = rank(req.standing.rank)
      const next = rank(req.standing.next)
      const start = at?.activeDays ?? 0
      const need = (next?.activeDays ?? start) - start
      const have = req.standing.days - start
      paintTallies(ctx, req.width, req.height, need, have, beltOnInk(at?.belt ?? 'none', colors), colors, 1, have)
      return { png: el.toDataURL('image/png') }
    }
    case 'stamp': {
      const { el, ctx } = canvas(req.size, req.size, req.scale)
      paintStamp(ctx, req.size, req.id, req.got, req.seed, colors, token('--font-body', 'sans-serif'))
      return { png: el.toDataURL('image/png') }
    }
    case 'share': {
      const fonts = cardFonts(await displayFace())
      const { el, ctx } = canvas(CARD_W, CARD_H, req.scale)
      // No founder on the iPhone yet: practice is the rank (IOS-029 joins them).
      paintShareCard(ctx, { days: req.days, rank: rank(req.rank) ?? LADDER[0], level: req.level, founder: false }, colors, fonts)
      return { png: el.toDataURL('image/png') }
    }
    case 'dabs': {
      const { el, ctx } = canvas(req.width, CHART_H, req.scale)
      const column = req.width / Math.max(1, req.days.length)
      const most = Math.max(1, ...req.days.map((d) => d.words))
      req.days.forEach((d, i) => {
        paintChartDab(ctx, column * (i + 0.5), column, d.day, dabHeight(d.words, most), d.words === 0, i === req.days.length - 1)
      })
      return { png: el.toDataURL('image/png') }
    }
    case 'wall': {
      const pad = wallPad(req.days[0]?.day)
      const most = Math.max(1, ...req.days.map((d) => d.words))
      const marks: Array<WallMark | null> = [...Array.from({ length: pad }, () => null), ...req.days.map((d) => ({ seed: d.day, level: heatLevel(d.words, most) }))]
      const size = wallSize(marks.length, 7)
      const { el, ctx } = canvas(size.width, size.height, req.scale)
      paintWallMarks(ctx, marks, 7, heatBase(), false)
      return { png: el.toDataURL('image/png') }
    }
    case 'legend': {
      const marks = HEAT_PCT.map((_, level) => ({ seed: `legend-${level}`, level }))
      const size = wallSize(marks.length, 1)
      const { el, ctx } = canvas(size.width, size.height, req.scale)
      paintWallMarks(ctx, marks, 1, heatBase(), false)
      return { png: el.toDataURL('image/png') }
    }
    case 'stroke': {
      const { el, ctx } = canvas(req.width, DAY_STROKE_H, req.scale)
      paintDayStroke(ctx, req.width, req.share, req.day)
      return { png: el.toDataURL('image/png') }
    }
  }
}

function surface(id: string, width: number, height: number): Surface | null {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLCanvasElement)) return null
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  const ctx = el.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas: el, ctx, dpr }
}

/** Stops the ceremony's strokes still going, as desktop's ceremony does
 *  before it paints again. */
let stopCeremony = (): void => undefined
/** Stops the live painting's newest stroke still painting in. */
let stopLive = (): void => undefined

/** How long the newest stroke takes to paint in, as on desktop. */
const LIVE_MS = 900

/**
 * Today's painting on the page's own canvases (IOS-019), as desktop's
 * wrap-up paints it: the newest stroke paints itself in when it is new
 * since the last look, and the seal stamps in with the stroke that
 * finished the painting; at rest, or with Reduce Motion, it is drawn
 * finished at once.
 */
export function live(req: { record: PaintingRecord; width: number; height: number; fresh: boolean; doneBefore: number; reduced: boolean }): boolean {
  stopCeremony()
  stopLive()
  stopLive = () => undefined
  const { record, width, height } = req
  const base = surface('base', width, height)
  const fx = surface('fx', width, height)
  if (!base || !fx) return false
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  const colors = dayColors()
  const sealColor = sealOf(record)
  const light = lightOf(record, plan)
  const fresh = req.fresh && !req.reduced
  const draw = (k: number): void => {
    base.ctx.clearRect(0, 0, width, height)
    paintPainting(base.ctx, width, height, plan, record.words, colors, {
      done,
      live: fresh ? Math.min(1, k * 1.25) : undefined,
      // The seal stamps in with the stroke that finishes it.
      seal: finished ? (fresh && req.doneBefore < record.target ? Math.max(0, k * 4 - 3) : 1) : 0,
      seed: record.seed,
      ground: false,
      sealColor,
      light
    })
  }
  if (!fresh) {
    draw(1)
    return true
  }
  const t0 = performance.now()
  let frame = 0
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / LIVE_MS)
    draw(k)
    if (k < 1) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  stopLive = () => cancelAnimationFrame(frame)
  return true
}

/** The ceremony on the page's own canvases: animated, or the finished
 *  painting with Reduce Motion or at a new size. A new call stops the
 *  last one's strokes first, so an old size never paints over the new. */
export function ceremony(req: { rank: string; width: number; height: number; reduced: boolean }): boolean {
  stopLive()
  stopLive = () => undefined
  stopCeremony()
  stopCeremony = () => undefined
  const at = rank(req.rank)
  const { width, height } = req
  const base = surface('base', width, height)
  const fx = surface('fx', width, height)
  if (!at || !base || !fx) return false
  const items = ceremonyScene(at, width, height, journeyColors(BELT_HEX))
  if (req.reduced) paintScene(base.ctx, items)
  else stopCeremony = animateScene(base, fx, items)
  return true
}

declare global {
  interface Window {
    murmurJourney?: { picture: typeof picture; ceremony: typeof ceremony; live: typeof live }
    webkit?: { messageHandlers?: { journey?: { postMessage: (message: unknown) => void } } }
  }
}

if (typeof window !== 'undefined') {
  window.murmurJourney = { picture, ceremony, live }
  window.webkit?.messageHandlers?.journey?.postMessage({ type: 'ready' })
}
