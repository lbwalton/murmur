// SPDX-License-Identifier: GPL-3.0-only
// The analytics' painted marks (US-085, US-087): the fourteen days as brush
// dabs, the activity wall as blots, and Home's one gold stroke for today
// against a typical day. Pure canvas drawing, so the settings window and
// the iPhone's painter page (ios/prd.json IOS-022) paint the same marks
// from the same days; each caller sizes its own canvas first.
import { type Rgb, cachedBrush, mix, mulberry, path, rgba, stroke, tokenColor } from '../brush'
import { daySeed, paintBlot, paintDab } from './inkMarks'

/** The fourteen days chart's height. */
export const CHART_H = 76

/** A day's dab height in the chart: its words against the biggest day. */
export function dabHeight(words: number, maxWords: number): number {
  return Math.max(3, Math.round((words / Math.max(1, maxWords)) * 72))
}

/**
 * One day of the fourteen as a brush dab, the ink dabs waveform's mark,
 * standing on the chart's baseline at cx in a column colWidth wide: today
 * in brand gold, other days in rice, an empty day a faint speck. Seeded by
 * the date.
 */
export function paintChartDab(
  ctx: CanvasRenderingContext2D,
  cx: number,
  colWidth: number,
  day: string,
  height: number,
  empty: boolean,
  today: boolean
): void {
  const rgb = today && !empty ? tokenColor('--brand', [217, 164, 65]) : tokenColor('--rice', [233, 227, 214])
  const dabWidth = Math.min(empty ? 8 : 18, colWidth * 0.72)
  paintDab(ctx, cx, CHART_H - 1, height, dabWidth, rgb, daySeed(day), empty ? 0.22 : 0.92)
}

// Fill strength per heat level. Level 0 keeps the resting cell color;
// the rest mix the chosen base color over transparency so the ladder
// reads the same for any bright base. Dark bases (the black belt)
// invert instead: empty squares go light and activity darkens them,
// so the fill never vanishes into the ink.
export const HEAT_PCT = [0, 20, 40, 65, 95]
export const HEAT_PCT_INVERTED = [0, 35, 55, 75, 95]

export const CELL = 11
export const STEP = 14
/** Room around the cells for the biggest blots' ragged edges. */
export const BLEED = 2

/** A day's heat level, 0 to 4, by its words against the period's biggest day. */
export function heatLevel(words: number, heatMax: number): number {
  if (words === 0) return 0
  const r = words / Math.max(1, heatMax)
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

/** The color a heat level paints, on the same scale as the old squares. */
export function blotColor(level: number, base: Rgb, inverted: boolean, paper: Rgb): { rgb: Rgb; alpha: number } {
  if (inverted) return { rgb: mix(paper, base, HEAT_PCT_INVERTED[level] / 100), alpha: 1 }
  return { rgb: base, alpha: HEAT_PCT[level] / 100 }
}

/** A wall mark: the day it stands for (seeding its edge) and its level. */
export interface WallMark {
  seed: string
  level: number
}

/** The wall's painted size for this many cells in rows. */
export function wallSize(count: number, rows: number): { width: number; height: number } {
  const cols = Math.ceil(count / rows)
  return {
    width: Math.max(1, cols * STEP - (STEP - CELL)) + 2 * BLEED,
    height: rows * STEP - (STEP - CELL) + 2 * BLEED
  }
}

/**
 * The activity wall's paint: each active day a small blot in the wall's
 * color at its heat level, each empty day a faint dot (paper mode keeps
 * its white squares, painted by the cells underneath). Column by column,
 * rows tall, on a canvas wallSize big. Seeded by the date, so the wall
 * paints the same on every open.
 */
export function paintWallMarks(ctx: CanvasRenderingContext2D, marks: ReadonlyArray<WallMark | null>, rows: number, base: Rgb, inverted: boolean): void {
  ctx.save()
  // Cells start BLEED in, so an edge blot is never clipped.
  ctx.translate(BLEED, BLEED)
  const paper = tokenColor('--heat-invert-bg', [236, 233, 228])
  const faint = tokenColor('--text', [236, 233, 228])
  marks.forEach((mark, i) => {
    if (!mark) return
    const x = Math.floor(i / rows) * STEP + CELL / 2
    const y = (i % rows) * STEP + CELL / 2
    const lv = mark.level
    if (lv === 0) {
      if (inverted) return
      ctx.fillStyle = rgba(faint, 0.12)
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    const { rgb, alpha } = blotColor(lv, base, inverted, paper)
    paintBlot(ctx, x, y, 3.9 + lv * 0.35, rgb, daySeed(mark.seed), alpha)
  })
  ctx.restore()
}

/** The gold stroke's height. */
export const DAY_STROKE_H = 24

/**
 * One gold brush stroke for today's time back against a typical day,
 * across a canvas `width` wide: its length is the share (a day past
 * typical fills the width), and a dotted pencil line runs on for the rest
 * of the typical day. Seeded by the date, so the stroke keeps its shape
 * all day.
 */
export function paintDayStroke(ctx: CanvasRenderingContext2D, width: number, share: number, day: string): void {
  const seed = daySeed(day)
  const r = mulberry(seed)
  const x0 = 3
  const full = width - 6
  const reach = share > 0 ? Math.max(10, Math.min(1, share) * full) : 0
  const mid = DAY_STROKE_H / 2
  if (reach > 0) {
    // A few control points with a little lift and sag, the same all day.
    const n = 4
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= n; i++) pts.push([x0 + (reach * i) / n, mid + (r() - 0.5) * 3.2])
    stroke(ctx, path(pts, 1.5), cachedBrush(80 + (seed % 6), 22), {
      width: 9,
      rgb: tokenColor('--brand', [217, 164, 65]),
      dry: 0.55,
      core: 0.35,
      ts: 0.06,
      te: 0.25
    })
  }
  // The rest of a typical day, in pencil.
  const from = x0 + reach + (reach > 0 ? 6 : 0)
  if (from < x0 + full - 4) {
    ctx.save()
    ctx.setLineDash([1.5, 4])
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.3
    ctx.strokeStyle = rgba(tokenColor('--text-dim', [154, 150, 143]), 0.55)
    ctx.beginPath()
    ctx.moveTo(from, mid)
    ctx.lineTo(x0 + full, mid)
    ctx.stroke()
    ctx.restore()
  }
}
