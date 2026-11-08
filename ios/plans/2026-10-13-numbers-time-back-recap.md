# Analytics, Time Back, and the Recap (IOS-022) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** How much you said and how much time it saved you on iPhone, counted against typing with your thumbs: Your numbers (this month, the fourteen days as brush dabs, the activity wall as blots, the lifetime), Home's Back today with its one gold stroke, and an optional daily recap.

**Architecture:**
- **Desktop's numbers in Swift.** Desktop's `src/shared/analytics.ts` (the month, today, lifetime, the fourteen days, the typical day, the activity wall, the estimated cost at the catalog's rates), `timeback.ts`, and `recap.ts` are ported to MurmurCore as `Analytics`, `TimeBack`, and `Recap`. `shared/analytics-vectors.json` (begun by IOS-021) holds desktop's own answers for all of it, and both platforms run it.
- **Thumbs, cited.** Time back counts against 36 words a minute on iPhone, the average phone typing speed across 37,370 people (Palin et al., MobileHCI 2019, checked 2026-10-13). It's a setting (10 to 200); desktop keeps its 40.
- **Desktop's marks in one module.** The fourteen days' dab, the wall's blots, and Home's gold stroke move out of desktop's React views into `src/renderer/settings/analyticsPaint.ts`, which desktop and the iPhone's painter page both import. Home's typical-day sentence moves into `timeback.ts`. Desktop's pages are pixel-identical before and after.
- **The screens.** Home gains Back today (today's time back, the gold stroke against a typical day, the month and lifetime) with a gold Your numbers row. Your numbers shows desktop's panels with native numbers and painted dabs and wall. Settings gains Time back and recap.
- **The recap.** One local notification a day at the time you pick, off until you turn it on, which is the only moment murmur asks for notification permission. Each take, each return to murmur, and each settings change lays down the coming week's recaps: today's with today's numbers so far, the rest quiet until their takes land.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI, UserNotifications, WebKit, TypeScript, React, vitest.

**Spec:**
- `ios/prd.json` IOS-022, with `conventions` (design, parity, docs, verify).
- `CLAUDE.md` (night studio, brushwork: Analytics in ink, Home's one gold stroke) and `DESIGN.md`.
- Desktop's `src/shared/analytics.ts`, `timeback.ts`, `recap.ts`, `src/renderer/settings/AnalyticsView.tsx`, `HomeView.tsx`, `DayStroke.tsx`, `inkMarks.ts`, and `docs/settings.md` (How does murmur calculate time earned back? and How do recaps and the wrap-up work?), all murmur's own.

The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** in a throwaway copy of `feature/ios` at e5173c4:
- `npm run typecheck` was clean; `npm run test` passed 1020 (1007 + 13 vectors). `npm run smoke` (desktop) printed `"ok":true`.
- `swift test` passed 144 (138 + 6). Every Swift number matched desktop's on the first run.
- `npm run ios:test` passed 342 app tests (335 + 7).
- `npm run ios:smoke` printed twenty-four true checks, `analytics` among them.
- **Desktop unchanged, pixel for pixel.** Desktop's analytics page (the fourteen dabs), its wall scrolled into view, and Home (the gold stroke) were captured from one scratch profile of 90 made-up takes, before and after the move (`MURMUR_SETTINGS_CAPTURE`, `--murmur-userdata`). Zero pixels differ on all three.
- **Same numbers as desktop.** From the same 90 takes, the iPhone's Your numbers shows desktop's month (19.3 minutes, 5,406 words, 19 takes, $0.02) and lifetime (27,430 words). Time back differs on purpose: 2 h 11 min this month at 36 words a minute against desktop's 1 h 56 min at 40.
- **Screens rendered and read:** Back today (1 min, the gold stroke at 9% of a 14 min typical day, the month and lifetime), Your numbers (this month, the fourteen dabs with today in gold, the wall), the wall scrolled to today with its months, day names, and legend (a bug fixed on the way: a spacer without a width took half the row), and Time back and recap.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **Thumbs start at 36 words a minute.** Palin, Feit, Kim, Kristensson, and Oulasvirta, "How do People Type on Mobile Devices? Observations from a Study with 37,000 Volunteers", MobileHCI 2019 (https://doi.org/10.1145/3338286.3340120): 36.17 on average, checked 2026-10-13 against the paper itself. Desktop's 40 for keyboards stays as it is (it cites nothing). If wrong: another default, one constant.
2. **Desktop's marks and its typical-day sentence move into shared modules** that both platforms import; desktop is pixel-identical.
3. **The recap's words are set as it is scheduled.** iOS cannot compute a notification's text when it fires, so each take, each return to murmur, and each settings change lays down the next seven days. Today's recap has today's numbers so far; the others are quiet until their takes land. A week away still gets its quiet recaps.
4. **The iPhone's recap says takes and one minute.** On iPhone a session is the listening window, so it reads "4 takes, 12 minutes, 1,240 words today. 19 minutes back." A quiet day reads "A quiet day: no dictations. The pill misses you." Desktop's own sentence is unchanged and pinned by the vectors.
5. **Tapping the recap opens murmur** at Home, where Back today is.
6. **The estimated cost shows on iPhone,** at the catalog's rates for the models your takes ran through, with the date the rates were checked.
7. **The wall is the lifetime, in desktop's orange.** The year picker and the wall's color and paper mode stay on the Mac.
8. **The wall scrolls sideways,** opening on today.
9. **No milestone notifications on iPhone,** as IOS-021 ruled for achievements. Send one now stands in for desktop's Test button.
10. **Your numbers is a row under Home's Back today;** Time back and recap is its own Settings screen.
11. **Copy summary on the painting screen stays deferred;** IOS-022's criteria don't ask for it.
12. **Back today shows once there is a take,** as desktop's card shows once a take counts.

## Global Constraints

- Swift 6, iOS 26, compiling on Swift 6.3 (CI's Xcode 26.6): typed lets for long arithmetic, in tests too; no `Binding(get:set:)` closures; bind by key path.
- `shared/` stays the single source of shared rules; both platforms run the same vector files; desktop's behavior does not change.
- Design: night studio tokens, no raw colors in code (the design lint checks Swift too); gold for section titles, the Your numbers row, Send one now, and Open Settings; paint only for the dabs, the wall, and the one gold stroke; text follows Dynamic Type; VoiceOver reads every number, the fourteen days, and the wall.
- Notifications are asked for only when the recap is turned on.
- Every source file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-022:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`; `npm run smoke` too when desktop code changes.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **The iPhone's numbers differing from desktop's for the same takes** (the month's edge, the typical day's window and median, the wall's span, the cost at the rates, rounding). Pinned by `analytics-vectors.test.ts` (Task 2), `AnalyticsVectorTests` (Task 3), and `NumbersTests.theSummaryIsTheTakes` and `timeBackCountsThumbs` (Task 4).
2. **The recap asking for permission at any other moment, arriving with stale words, never arriving after days away, or arriving while off.** Pinned by `NumbersTests.theRecapPlansTheWeek` (Task 4); the permission flow is read in `TimeBackScreen` and checked live.
3. **A typing speed out of the band, or corrupt stored settings.** Pinned by `NumbersTests.theSettingsKeepTheirChoices` (Task 4).
4. **Desktop changing behind the move.** Pinned by the pixel-identical captures above, desktop's tests, and desktop's smoke (Task 1).
5. **The wall laid out differently than desktop's** (weeks from Sunday, a month's name over its first week). Pinned by `NumbersTests.theWallIsLaidOutAsDesktops` (Task 4).

---

### Task 1: Desktop's marks and its typical-day sentence in shared modules

**Files:**
- Create `src/renderer/settings/analyticsPaint.ts`.
- Modify `src/renderer/settings/AnalyticsView.tsx`, `src/renderer/settings/DayStroke.tsx`, `src/renderer/settings/HomeView.tsx`, and `src/shared/timeback.ts`.

**Interfaces:** Produces:
- from `analyticsPaint.ts`: `CHART_H`, `dabHeight(words, maxWords)`, `paintChartDab(ctx, cx, colWidth, day, height, empty, today)`, `HEAT_PCT`, `HEAT_PCT_INVERTED`, `CELL`, `STEP`, `BLEED`, `heatLevel(words, heatMax)`, `blotColor`, `WallMark`, `wallSize(count, rows)`, `paintWallMarks(ctx, marks, rows, base, inverted)`, `DAY_STROKE_H`, and `paintDayStroke(ctx, width, share, day)`;
- from `timeback.ts`: `typicalLine(share, typical)`.

Desktop's behavior does not change: each view sizes its canvas and calls what it used to define itself.

- [ ] **Step 1: Move the marks**

`src/renderer/settings/analyticsPaint.ts`, whole:

```ts
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
```

`src/renderer/settings/AnalyticsView.tsx`, whole:

```tsx
// SPDX-License-Identifier: GPL-3.0-only
// The analytics view: monthly usage card with the live cost estimate,
// lifetime totals, a fourteen-day activity chart, and the activity
// wall. Pure presentation over computed summaries; transcripts never
// enter this view.
import { useEffect, useRef, useState } from 'react'
import type { AnalyticsSummary, HeatDay, HeatmapData } from '../../shared/analytics'
import type { CosmeticsReport } from '../../shared/cosmetics'
import type { Settings } from '../../shared/settings'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle } from './PageTitle'
import { EmptyState } from './EmptyState'
import { type Rgb, parseColor, tokenColor } from '../brush'
import { CHART_H, HEAT_PCT, type WallMark, dabHeight, heatLevel, paintChartDab, paintWallMarks, wallSize } from './analyticsPaint'

const bridge = (): SettingsApi => window.murmur

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function money(usd: number): string {
  if (usd < 0.01 && usd > 0) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function monthOf(day: string): number {
  return Number(day.slice(5, 7)) - 1
}

function prettyDay(day: string): string {
  return `${MONTHS[monthOf(day)]} ${Number(day.slice(8, 10))}`
}

function hexLuminance(color: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return null
  const n = parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function AnalyticsView(props: { hotkey: string }): React.JSX.Element {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [wall, setWall] = useState<HeatmapData | null>(null)
  // The wall's period (lifetime or one year) stays as you left it until
  // you change it again (US-094).
  const [year, setYear] = useState<number | null>(readWallPeriod)
  const pickYear = (next: number | null): void => {
    setYear(next)
    rememberWallPeriod(next)
  }
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cosmetics, setCosmetics] = useState<CosmeticsReport | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge().getAnalytics().then(setSummary)
      void bridge().getHeatmap(year).then(setWall)
      void bridge().getSettings().then(setSettings)
      void bridge().getCosmetics().then(setCosmetics)
    }
    load()
    return bridge().onHistoryAppended(() => load())
  }, [year])

  // A remembered year with no data left (after Clear all) falls back to
  // lifetime rather than an empty wall.
  useEffect(() => {
    if (wall && year !== null && !wall.years.includes(year)) pickYear(null)
    // pickYear is stable in effect: it sets state and storage only.
  }, [wall, year])

  const title = <PageTitle title="Your numbers" sub="This month and the last two weeks." />
  if (!summary) return <div className="home">{title}</div>
  // Nothing dictated yet: an invitation instead of a page of zeros.
  if (summary.lifetime.sessions === 0) {
    return (
      <div className="home">
        {title}
        <EmptyState
          title="No numbers yet."
          hotkey={props.hotkey}
          after="Your words, minutes, and time back count from your first dictation."
        />
      </div>
    )
  }

  const recent = summary.days.slice(-14)
  const maxWords = Math.max(1, ...recent.map((d) => d.words))

  return (
    <div className="home">
      {title}
      <section className="panel">
        <p className="micro-label">this month</p>
        <div className="stat-row">
          <Stat label="minutes dictated" value={String(summary.month.minutes)} />
          <Stat label="words" value={summary.month.words.toLocaleString()} />
          <Stat label="sessions" value={String(summary.month.sessions)} />
          <Stat label="time back" value={formatMinutesBack(summary.month.minutesBack)} />
          <Stat label="est. cost" value={money(summary.month.estCostUsd)} />
        </div>
        <p className="row-desc rates-note">
          Estimates at current Groq rates (verified 2026-09-05), assuming the cleanup pass runs.
          Your provider bills you directly; murmur never sees it.
        </p>
      </section>

      <section className="panel">
        <p className="micro-label">last 14 days</p>
        <div
          className="chart"
          role="img"
          aria-label={`Words per day, last 14 days: ${recent.map((d) => `${prettyDay(d.day)}, ${d.words.toLocaleString()}`).join('; ')}`}
        >
          {recent.map((day, i) => (
            <div className="chart-col" key={day.day} title={`${day.words} words on ${prettyDay(day.day)}`}>
              <ChartDab
                day={day.day}
                height={dabHeight(day.words, maxWords)}
                empty={day.words === 0}
                today={i === recent.length - 1}
              />
              <span className="chart-tick">{day.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      {wall && (
        <ActivityWall
          wall={wall}
          year={year}
          onYear={pickYear}
          settings={settings}
          cosmetics={cosmetics}
          onSettings={setSettings}
        />
      )}

      <section className="panel">
        <p className="micro-label">lifetime</p>
        <div className="stat-row">
          <Stat label="minutes" value={String(summary.lifetime.minutes)} />
          <Stat label="words" value={summary.lifetime.words.toLocaleString()} />
          <Stat label="sessions" value={String(summary.lifetime.sessions)} />
          <Stat label="avg wpm" value={String(summary.lifetime.avgWpm)} />
          <Stat label="time back" value={formatMinutesBack(summary.lifetime.minutesBack)} />
          <Stat label="est. cost" value={money(summary.lifetime.estCostUsd)} />
        </div>
      </section>
    </div>
  )
}

const WALL_PERIOD_KEY = 'murmur-wall-period'

/** The wall period last chosen: null for lifetime, or a year. */
function readWallPeriod(): number | null {
  try {
    const value = localStorage.getItem(WALL_PERIOD_KEY)
    const year = value === null || value === 'lifetime' ? null : Number(value)
    return year !== null && Number.isInteger(year) && year > 2000 ? year : null
  } catch {
    return null
  }
}

function rememberWallPeriod(year: number | null): void {
  try {
    localStorage.setItem(WALL_PERIOD_KEY, year === null ? 'lifetime' : String(year))
  } catch {
    // Without storage the wall opens on lifetime, as before.
  }
}

/** The screen's pixel density, kept current when the window moves to a
 *  screen of another density, so painted marks repaint sharp. */
function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = (): void => setDpr(window.devicePixelRatio || 1)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [dpr])
  return dpr
}

/**
 * One day of the fourteen as a brush dab (US-087), the ink dabs
 * waveform's mark, exactly as tall as its bar was: today in brand gold,
 * other days in rice, an empty day a faint speck. Seeded by the date.
 */
function ChartDab(props: { day: string; height: number; empty: boolean; today: boolean }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const screenDpr = useDevicePixelRatio()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = (): void => {
      const width = canvas.clientWidth
      if (width === 0) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(CHART_H * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, CHART_H)
      paintChartDab(ctx, width / 2, width, props.day, props.height, props.empty, props.today)
    }
    draw()
    const watch = new ResizeObserver(draw)
    watch.observe(canvas)
    return () => watch.disconnect()
  }, [props.day, props.height, props.empty, props.today, screenDpr])
  return <canvas ref={ref} className="chart-dab" />
}

/** A CSS color the wall uses (a token reference or a hex) as RGB. */
function wallRgb(color: string, fallback: Rgb): Rgb {
  const token = /^var\((--[a-z0-9-]+)\)$/i.exec(color)
  if (token) return tokenColor(token[1], fallback)
  return parseColor(color) ?? fallback
}

/**
 * The activity wall's paint (US-087), sized to its canvas: the blots
 * themselves are analyticsPaint's, shared with the iPhone (IOS-022).
 */
function paintWall(canvas: HTMLCanvasElement, marks: ReadonlyArray<WallMark | null>, rows: number, base: Rgb, inverted: boolean): void {
  const { width, height } = wallSize(marks.length, rows)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  paintWallMarks(ctx, marks, rows, base, inverted)
}

function ActivityWall(props: {
  wall: HeatmapData
  year: number | null
  onYear: (year: number | null) => void
  settings: Settings | null
  cosmetics: CosmeticsReport | null
  onSettings: (s: Settings) => void
}): React.JSX.Element {
  const { wall, settings, cosmetics } = props
  // Outline today whenever the rendered period reaches it (lifetime
  // and the current calendar year both end on today's cell).
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const heatMax = Math.max(1, ...wall.days.map((d) => d.words))

  // Pad so weeks align into columns of seven, Sunday on top.
  const firstDay = wall.days[0]
  const pad = firstDay
    ? new Date(
        Number(firstDay.day.slice(0, 4)),
        Number(firstDay.day.slice(5, 7)) - 1,
        Number(firstDay.day.slice(8, 10))
      ).getDay()
    : 0
  const cells: Array<HeatDay | null> = [...Array.from({ length: pad }, () => null), ...wall.days]
  const weeks: Array<Array<HeatDay | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  // A month label sits over any week containing the first of a month,
  // the way GitHub draws it; the opening partial month goes unlabeled
  // rather than crowd its neighbor.
  const monthLabels = weeks.map((week) => {
    const first = week.find((c) => c && c.day.slice(8, 10) === '01')
    return first ? MONTHS[monthOf(first.day)] : ''
  })

  // Resolve the wall's fill color: the vibrant orange default, the
  // current belt, or any earned belt-color accent. Locked or unknown
  // choices (including the retired cream id) fall back to orange.
  const heatId = settings?.cosmetics.heat ?? 'orange'
  const heatBase = ((): string => {
    if (heatId === 'orange' || !cosmetics) return 'var(--heat-default)'
    if (heatId === 'belt') {
      const belt = cosmetics.accents.find((a) => a.id === 'belt')
      return belt?.unlocked ? cosmetics.beltColor : 'var(--heat-default)'
    }
    const item = cosmetics.accents.find((a) => a.id === heatId)
    return item?.unlocked && item.color ? item.color : 'var(--heat-default)'
  })()
  // Inversion: automatic for dark fills (the black belt would vanish
  // into ink), and a manual option once the black belt is earned. A
  // near-white fill never inverts; it would vanish into the paper.
  const luminance = hexLuminance(heatBase)
  const invertUnlocked = cosmetics?.accents.find((a) => a.id === 'belt-black')?.unlocked ?? false
  const wantsInvert = settings?.cosmetics.heatInverted === true && invertUnlocked
  const inverted = (luminance !== null && luminance < 0.25) || (wantsInvert && (luminance === null || luminance <= 0.85))

  const setHeat = (heat: string): void => {
    if (!settings) return
    void bridge()
      .updateSettings({ cosmetics: { ...settings.cosmetics, heat } })
      .then(props.onSettings)
  }

  const beltUnlocked = cosmetics?.accents.find((a) => a.id === 'belt')?.unlocked ?? false
  const beltChoices = cosmetics?.accents.filter((a) => a.id.startsWith('belt-')) ?? []
  const gold = cosmetics?.accents.find((a) => a.id === 'gold')
  const periodLabel = wall.period === 'lifetime' ? 'lifetime' : `in ${wall.period}`
  const active = wall.days.filter((d) => d.words > 0)
  const busiest = active.reduce<HeatDay | null>((best, d) => (best && best.words >= d.words ? best : d), null)
  const wallLabel = busiest
    ? `Activity wall: ${wall.totalWords.toLocaleString()} words ${periodLabel}, on ${active.length.toLocaleString()} days; the busiest was ${prettyDay(busiest.day)} with ${busiest.words.toLocaleString()} words`
    : `Activity wall: no dictation ${periodLabel} yet`

  // The paint over the cells, redrawn whenever the days, the color, or
  // paper mode change. The legend paints its five levels the same way.
  const wallRef = useRef<HTMLCanvasElement>(null)
  const legendRef = useRef<HTMLCanvasElement>(null)
  const screenDpr = useDevicePixelRatio()
  useEffect(() => {
    const base = wallRgb(heatBase, [249, 115, 22])
    const marks = cells.map((cell) => (cell ? { seed: cell.day, level: heatLevel(cell.words, heatMax) } : null))
    if (wallRef.current) paintWall(wallRef.current, marks, 7, base, inverted)
    // The legend: one row, a mark for each level from none to most.
    const legend = HEAT_PCT.map((_, level) => ({ seed: `legend-${level}`, level }))
    if (legendRef.current) paintWall(legendRef.current, legend, 1, base, inverted)
    // cells and heatLevel are rebuilt every render from wall; each load
    // brings a new wall, so the data itself is the dependency.
  }, [wall, heatBase, inverted, screenDpr])

  return (
    <section className="panel">
      <div className="panel-head">
        <p className="micro-label">getting active</p>
        <div className="heat-controls">
          {settings && (
            <select
              className="field heat-picker"
              value={heatId}
              onChange={(e) => setHeat(e.target.value)}
              aria-label="wall color"
            >
              <option value="orange">vibrant orange</option>
              <option value="belt" disabled={!beltUnlocked}>
                {beltUnlocked ? 'your belt color' : 'your belt color (earn your white belt)'}
              </option>
              {beltChoices.map((a) => (
                <option value={a.id} key={a.id} disabled={!a.unlocked}>
                  {a.unlocked ? a.name : `${a.name} (locked: ${a.hint})`}
                </option>
              ))}
              {gold?.unlocked && <option value="gold">founder gold</option>}
            </select>
          )}
          {settings && (
            <label
              className="heat-invert"
              title={invertUnlocked ? 'paper mode: white squares, any fill' : 'locked: earn your black belt'}
            >
              <input
                type="checkbox"
                checked={settings.cosmetics.heatInverted === true && invertUnlocked}
                disabled={!invertUnlocked}
                onChange={(e) =>
                  void bridge()
                    .updateSettings({ cosmetics: { ...settings.cosmetics, heatInverted: e.target.checked } })
                    .then(props.onSettings)
                }
              />
              invert
            </label>
          )}
          <select
            className="field heat-picker"
            value={props.year === null ? 'lifetime' : String(props.year)}
            onChange={(e) => props.onYear(e.target.value === 'lifetime' ? null : Number(e.target.value))}
            aria-label="period"
          >
            <option value="lifetime">lifetime</option>
            {[...wall.years].reverse().map((y) => (
              <option value={String(y)} key={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="heat-total">
        {wall.totalWords.toLocaleString()} words {periodLabel}
      </p>
      <div className="heat-wrap">
        <div className="heat-daynames" aria-hidden="true">
          {['', 'mon', '', 'wed', '', 'fri', ''].map((name, i) => (
            <span className="chart-tick" key={i}>
              {name}
            </span>
          ))}
        </div>
        <div className="heat-scroll">
          <div className="heat-months" aria-hidden="true">
            {monthLabels.map((name, i) => (
              <span className="chart-tick" key={i}>
                {name}
              </span>
            ))}
          </div>
          <div className="heat heat-ink" role="img" aria-label={wallLabel}>
            {cells.map((cell, i) =>
              cell === null ? (
                <span className="heat-cell heat-pad" key={`pad-${i}`} />
              ) : (
                <span
                  className={`heat-cell ${cell.day === todayKey ? 'heat-today' : ''}`}
                  key={cell.day}
                  style={{ background: inverted ? 'var(--heat-invert-bg)' : 'transparent' }}
                  title={`${cell.words.toLocaleString()} words on ${prettyDay(cell.day)}`}
                />
              )
            )}
            <canvas ref={wallRef} className="heat-paint" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span className="chart-tick">less</span>
        <span className="heat-legend-ink">
          {HEAT_PCT.map((_, level) => (
            <span
              className="heat-cell"
              key={level}
              style={{ background: inverted ? 'var(--heat-invert-bg)' : 'transparent' }}
            />
          ))}
          <canvas ref={legendRef} className="heat-paint" />
        </span>
        <span className="chart-tick">more</span>
      </div>
      <p className="row-desc rates-note">Every mark is a day; deeper paint is more words. Show up and the wall fills.</p>
    </section>
  )
}

function Stat(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stat">
      <div className="stat-value">{props.value}</div>
      <div className="stat-label">{props.label}</div>
    </div>
  )
}
```

`src/renderer/settings/DayStroke.tsx`, whole:

```tsx
// SPDX-License-Identifier: GPL-3.0-only
// One gold brush stroke under Home's back today (US-085): its length is
// today's time back against a typical day, and a dotted pencil line runs
// on for the rest of the typical day. A day past typical fills the
// width. Seeded by the date, so the stroke keeps its shape all day.
import { useEffect, useRef } from 'react'
import { DAY_STROKE_H, paintDayStroke } from './analyticsPaint'

/** Sizes the canvas to its width; the stroke is analyticsPaint's, shared
 *  with the iPhone (IOS-022). */
function paint(canvas: HTMLCanvasElement, share: number, day: string): void {
  const width = Math.max(40, canvas.clientWidth)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(DAY_STROKE_H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, DAY_STROKE_H)
  paintDayStroke(ctx, width, share, day)
}

export function DayStroke(props: { share: number; day: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = (): void => paint(canvas, props.share, props.day)
    draw()
    // Repainted when the card changes width, never stretched.
    const watch = new ResizeObserver(draw)
    watch.observe(canvas)
    return () => watch.disconnect()
  }, [props.share, props.day])
  return <canvas ref={canvasRef} className="day-stroke" aria-hidden="true" />
}
```

- [ ] **Step 2: Move the typical-day sentence**

In `src/shared/timeback.ts`, before `/** The milestone notification body. */`:

```ts
/** Today in words against a typical day (US-085), shared with the iPhone
 *  (IOS-022). Past double, the percentage stops meaning much, so it says
 *  so instead. */
export function typicalLine(share: number, typical: number): string {
  const of = `your typical day (${formatMinutesBack(typical)})`
  return share > 2 ? `More than double ${of}` : `${Math.round(share * 100)}% of ${of}`
}
```

In `src/renderer/settings/HomeView.tsx`, the import becomes:

```ts
import { formatMinutesBack, typicalLine } from '../../shared/timeback'
```

and the file's own `typicalLine` (from `/** Today in words against a typical day (US-085).` through its closing brace) goes.

- [ ] **Step 3: Run the checks**

Run: `npm run typecheck`, `npm run test`, then `npm run smoke`.
Expected: typecheck clean; 1007 pass; `"ok":true` (rerun alone if an audio check flakes under load).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/settings/analyticsPaint.ts src/renderer/settings/AnalyticsView.tsx src/renderer/settings/DayStroke.tsx src/renderer/settings/HomeView.tsx src/shared/timeback.ts
git commit -m "IOS-022: desktop's analytics marks and typical day sentence move into modules both platforms import"
```

### Task 2: Desktop's numbers on shared takes

**Files:** Modify `shared/analytics-vectors.json` and `src/shared/analytics-vectors.test.ts`.

Desktop is the oracle: each answer came from desktop's own `aggregate`, `heatmap`, `typicalDayBack`, `typicalShare`, `ratesFromCatalog`, time back helpers, and `recapBody`, run with its clock at local noon on each case's today.

- [ ] **Step 1: Write the failing test**

`src/shared/analytics-vectors.test.ts`, whole:

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/analytics-vectors.json through the analytics, time back, and
// recap. MurmurCore runs the same file, so the iPhone's share card, numbers,
// Home's stroke, and recap say what desktop's would (ios/prd.json IOS-021,
// IOS-022).
import { describe, expect, it } from 'vitest'
import catalog from '../../shared/provider-catalog.json'
import vectors from '../../shared/analytics-vectors.json'
import { CARD_DAYS } from '../renderer/settings/cardPaint'
import { aggregate, dailyTotals, heatmap, typicalDayBack, typicalShare } from './analytics'
import { type ProviderCatalog, ratesFromCatalog } from './catalog'
import type { SessionEvent } from './history'
import { recapBody } from './recap'
import { clampTypingWpm, formatMinutesBack, formatMinutesBackWords, minutesBack, shownMinutes, typicalLine } from './timeback'

interface Take {
  day: string
  words: number
  durationMs?: number
}

/** Local noon on a day, as desktop's clock would read it that day. */
const noonOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

const event = (t: Take): SessionEvent => ({ at: noonOf(t.day), durationMs: t.durationMs ?? 1000, rawText: '', finalText: '', words: t.words, wpm: 0, day: t.day, hour: 12 })

const rates = (): ReturnType<typeof ratesFromCatalog> => ratesFromCatalog(catalog as unknown as ProviderCatalog)

describe('shared/analytics-vectors.json', () => {
  it("the share card's month is CARD_DAYS long", () => {
    expect((vectors as { cardDays?: number }).cardDays).toBe(CARD_DAYS)
  })

  for (const c of vectors.dailyTotals) {
    it(`daily totals: ${c.name}`, () => {
      expect(dailyTotals(c.takes.map(event), c.count, () => noonOf(c.today))).toEqual(c.expect)
    })
  }

  it('rates, from the bundled catalog', () => {
    expect(rates()).toEqual(vectors.rates)
  })

  it('time back and its words', () => {
    const t = vectors.timeBack
    for (const c of t.minutesBack) expect(minutesBack(c.words, c.durationMs, c.wpm)).toBe(c.minutesBack)
    for (const c of t.clamp) expect(clampTypingWpm(c.value)).toBe(c.clamped)
    for (const c of t.shown) expect(shownMinutes(c.raw)).toBe(c.shown)
    for (const c of t.format) {
      expect(formatMinutesBack(c.minutes)).toBe(c.short)
      expect(formatMinutesBackWords(c.minutes)).toBe(c.words)
    }
    for (const c of t.typicalLine) expect(typicalLine(c.share, c.typical)).toBe(c.line)
  })

  it('the typical day', () => {
    for (const c of vectors.typical.dayBack) expect(typicalDayBack(c.days)).toBe(c.typical)
    for (const c of vectors.typical.share) expect(typicalShare(c.today, c.typical)).toBe(c.share)
  })

  for (const c of vectors.aggregate) {
    it(`aggregate: ${c.name}`, () => {
      const options = { now: () => noonOf(c.today), sttModel: c.sttModel, llmModel: c.llmModel, typingWpm: c.typingWpm }
      expect(aggregate(c.takes.map(event), rates(), options)).toEqual(c.expect)
    })
  }

  for (const c of vectors.heatmap) {
    it(`heat map: ${c.name}`, () => {
      const data = heatmap(c.takes.map(event), { now: () => noonOf(c.today), year: c.year })
      expect({
        first: data.days[0]?.day ?? null,
        last: data.days[data.days.length - 1]?.day ?? null,
        count: data.days.length,
        busy: data.days.filter((d) => d.words > 0),
        totalWords: data.totalWords,
        years: data.years,
        period: data.period
      }).toEqual(c.expect)
    })
  }

  it('the recap', () => {
    for (const c of vectors.recap) expect(recapBody(c)).toBe(c.body)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/shared/analytics-vectors.test.ts`
Expected: it fails: the vectors have no `rates`, `timeBack`, `typical`, `aggregate`, `heatmap`, or `recap`.

- [ ] **Step 3: Add desktop's answers**

`shared/analytics-vectors.json`, whole (cardDays, five months, the rates, time back and its words, the typical day, four summaries, five walls summed up, and five recaps):

```json
{
  "note": "Desktop's analytics (src/shared/analytics.ts), time back (src/shared/timeback.ts), and recap (src/shared/recap.ts) on fixed takes. cardDays: the share card's month, desktop's CARD_DAYS. dailyTotals: words and takes for each of the last count days ending today, oldest first, zero-filled, by each take's stored day, the share card's month (US-078). aggregate: this month, today, lifetime, the last 14 days, and the typical day, with time back at the typing speed and the cost at rates, the rates from shared/provider-catalog.json as ratesFromCatalog reads them. heatmap: the activity wall's days, summed up as their span and the days with words. Desktop runs each case with its clock at local noon on today. Both platforms run these (IOS-021, IOS-022).",
  "cardDays": 30,
  "dailyTotals": [
    {
      "name": "nothing yet",
      "today": "2026-10-13",
      "count": 30,
      "takes": [],
      "expect": [
        { "day": "2026-09-14", "words": 0, "sessions": 0 },
        { "day": "2026-09-15", "words": 0, "sessions": 0 },
        { "day": "2026-09-16", "words": 0, "sessions": 0 },
        { "day": "2026-09-17", "words": 0, "sessions": 0 },
        { "day": "2026-09-18", "words": 0, "sessions": 0 },
        { "day": "2026-09-19", "words": 0, "sessions": 0 },
        { "day": "2026-09-20", "words": 0, "sessions": 0 },
        { "day": "2026-09-21", "words": 0, "sessions": 0 },
        { "day": "2026-09-22", "words": 0, "sessions": 0 },
        { "day": "2026-09-23", "words": 0, "sessions": 0 },
        { "day": "2026-09-24", "words": 0, "sessions": 0 },
        { "day": "2026-09-25", "words": 0, "sessions": 0 },
        { "day": "2026-09-26", "words": 0, "sessions": 0 },
        { "day": "2026-09-27", "words": 0, "sessions": 0 },
        { "day": "2026-09-28", "words": 0, "sessions": 0 },
        { "day": "2026-09-29", "words": 0, "sessions": 0 },
        { "day": "2026-09-30", "words": 0, "sessions": 0 },
        { "day": "2026-10-01", "words": 0, "sessions": 0 },
        { "day": "2026-10-02", "words": 0, "sessions": 0 },
        { "day": "2026-10-03", "words": 0, "sessions": 0 },
        { "day": "2026-10-04", "words": 0, "sessions": 0 },
        { "day": "2026-10-05", "words": 0, "sessions": 0 },
        { "day": "2026-10-06", "words": 0, "sessions": 0 },
        { "day": "2026-10-07", "words": 0, "sessions": 0 },
        { "day": "2026-10-08", "words": 0, "sessions": 0 },
        { "day": "2026-10-09", "words": 0, "sessions": 0 },
        { "day": "2026-10-10", "words": 0, "sessions": 0 },
        { "day": "2026-10-11", "words": 0, "sessions": 0 },
        { "day": "2026-10-12", "words": 0, "sessions": 0 },
        { "day": "2026-10-13", "words": 0, "sessions": 0 }
      ]
    },
    {
      "name": "a month with gaps, two takes on one day, one too old, one tomorrow",
      "today": "2026-10-13",
      "count": 30,
      "takes": [
        { "day": "2026-09-13", "words": 999 },
        { "day": "2026-09-14", "words": 120 },
        { "day": "2026-09-20", "words": 40 },
        { "day": "2026-10-01", "words": 300 },
        { "day": "2026-10-01", "words": 45 },
        { "day": "2026-10-13", "words": 7 },
        { "day": "2026-10-14", "words": 500 }
      ],
      "expect": [
        { "day": "2026-09-14", "words": 120, "sessions": 1 },
        { "day": "2026-09-15", "words": 0, "sessions": 0 },
        { "day": "2026-09-16", "words": 0, "sessions": 0 },
        { "day": "2026-09-17", "words": 0, "sessions": 0 },
        { "day": "2026-09-18", "words": 0, "sessions": 0 },
        { "day": "2026-09-19", "words": 0, "sessions": 0 },
        { "day": "2026-09-20", "words": 40, "sessions": 1 },
        { "day": "2026-09-21", "words": 0, "sessions": 0 },
        { "day": "2026-09-22", "words": 0, "sessions": 0 },
        { "day": "2026-09-23", "words": 0, "sessions": 0 },
        { "day": "2026-09-24", "words": 0, "sessions": 0 },
        { "day": "2026-09-25", "words": 0, "sessions": 0 },
        { "day": "2026-09-26", "words": 0, "sessions": 0 },
        { "day": "2026-09-27", "words": 0, "sessions": 0 },
        { "day": "2026-09-28", "words": 0, "sessions": 0 },
        { "day": "2026-09-29", "words": 0, "sessions": 0 },
        { "day": "2026-09-30", "words": 0, "sessions": 0 },
        { "day": "2026-10-01", "words": 345, "sessions": 2 },
        { "day": "2026-10-02", "words": 0, "sessions": 0 },
        { "day": "2026-10-03", "words": 0, "sessions": 0 },
        { "day": "2026-10-04", "words": 0, "sessions": 0 },
        { "day": "2026-10-05", "words": 0, "sessions": 0 },
        { "day": "2026-10-06", "words": 0, "sessions": 0 },
        { "day": "2026-10-07", "words": 0, "sessions": 0 },
        { "day": "2026-10-08", "words": 0, "sessions": 0 },
        { "day": "2026-10-09", "words": 0, "sessions": 0 },
        { "day": "2026-10-10", "words": 0, "sessions": 0 },
        { "day": "2026-10-11", "words": 0, "sessions": 0 },
        { "day": "2026-10-12", "words": 0, "sessions": 0 },
        { "day": "2026-10-13", "words": 7, "sessions": 1 }
      ]
    },
    {
      "name": "across a new year",
      "today": "2027-01-05",
      "count": 30,
      "takes": [
        { "day": "2026-12-07", "words": 10 },
        { "day": "2026-12-31", "words": 250 },
        { "day": "2027-01-01", "words": 80 },
        { "day": "2027-01-05", "words": 1200 },
        { "day": "2026-12-06", "words": 3 }
      ],
      "expect": [
        { "day": "2026-12-07", "words": 10, "sessions": 1 },
        { "day": "2026-12-08", "words": 0, "sessions": 0 },
        { "day": "2026-12-09", "words": 0, "sessions": 0 },
        { "day": "2026-12-10", "words": 0, "sessions": 0 },
        { "day": "2026-12-11", "words": 0, "sessions": 0 },
        { "day": "2026-12-12", "words": 0, "sessions": 0 },
        { "day": "2026-12-13", "words": 0, "sessions": 0 },
        { "day": "2026-12-14", "words": 0, "sessions": 0 },
        { "day": "2026-12-15", "words": 0, "sessions": 0 },
        { "day": "2026-12-16", "words": 0, "sessions": 0 },
        { "day": "2026-12-17", "words": 0, "sessions": 0 },
        { "day": "2026-12-18", "words": 0, "sessions": 0 },
        { "day": "2026-12-19", "words": 0, "sessions": 0 },
        { "day": "2026-12-20", "words": 0, "sessions": 0 },
        { "day": "2026-12-21", "words": 0, "sessions": 0 },
        { "day": "2026-12-22", "words": 0, "sessions": 0 },
        { "day": "2026-12-23", "words": 0, "sessions": 0 },
        { "day": "2026-12-24", "words": 0, "sessions": 0 },
        { "day": "2026-12-25", "words": 0, "sessions": 0 },
        { "day": "2026-12-26", "words": 0, "sessions": 0 },
        { "day": "2026-12-27", "words": 0, "sessions": 0 },
        { "day": "2026-12-28", "words": 0, "sessions": 0 },
        { "day": "2026-12-29", "words": 0, "sessions": 0 },
        { "day": "2026-12-30", "words": 0, "sessions": 0 },
        { "day": "2026-12-31", "words": 250, "sessions": 1 },
        { "day": "2027-01-01", "words": 80, "sessions": 1 },
        { "day": "2027-01-02", "words": 0, "sessions": 0 },
        { "day": "2027-01-03", "words": 0, "sessions": 0 },
        { "day": "2027-01-04", "words": 0, "sessions": 0 },
        { "day": "2027-01-05", "words": 1200, "sessions": 1 }
      ]
    },
    {
      "name": "a leap day, two weeks",
      "today": "2028-03-10",
      "count": 14,
      "takes": [
        { "day": "2028-02-26", "words": 5 },
        { "day": "2028-02-29", "words": 64 },
        { "day": "2028-03-01", "words": 32 },
        { "day": "2028-02-25", "words": 9 }
      ],
      "expect": [
        { "day": "2028-02-26", "words": 5, "sessions": 1 },
        { "day": "2028-02-27", "words": 0, "sessions": 0 },
        { "day": "2028-02-28", "words": 0, "sessions": 0 },
        { "day": "2028-02-29", "words": 64, "sessions": 1 },
        { "day": "2028-03-01", "words": 32, "sessions": 1 },
        { "day": "2028-03-02", "words": 0, "sessions": 0 },
        { "day": "2028-03-03", "words": 0, "sessions": 0 },
        { "day": "2028-03-04", "words": 0, "sessions": 0 },
        { "day": "2028-03-05", "words": 0, "sessions": 0 },
        { "day": "2028-03-06", "words": 0, "sessions": 0 },
        { "day": "2028-03-07", "words": 0, "sessions": 0 },
        { "day": "2028-03-08", "words": 0, "sessions": 0 },
        { "day": "2028-03-09", "words": 0, "sessions": 0 },
        { "day": "2028-03-10", "words": 0, "sessions": 0 }
      ]
    },
    {
      "name": "the spring clock change",
      "today": "2027-03-20",
      "count": 30,
      "takes": [
        { "day": "2027-03-13", "words": 21 },
        { "day": "2027-03-14", "words": 34 },
        { "day": "2027-03-15", "words": 55 },
        { "day": "2027-02-19", "words": 89 }
      ],
      "expect": [
        { "day": "2027-02-19", "words": 89, "sessions": 1 },
        { "day": "2027-02-20", "words": 0, "sessions": 0 },
        { "day": "2027-02-21", "words": 0, "sessions": 0 },
        { "day": "2027-02-22", "words": 0, "sessions": 0 },
        { "day": "2027-02-23", "words": 0, "sessions": 0 },
        { "day": "2027-02-24", "words": 0, "sessions": 0 },
        { "day": "2027-02-25", "words": 0, "sessions": 0 },
        { "day": "2027-02-26", "words": 0, "sessions": 0 },
        { "day": "2027-02-27", "words": 0, "sessions": 0 },
        { "day": "2027-02-28", "words": 0, "sessions": 0 },
        { "day": "2027-03-01", "words": 0, "sessions": 0 },
        { "day": "2027-03-02", "words": 0, "sessions": 0 },
        { "day": "2027-03-03", "words": 0, "sessions": 0 },
        { "day": "2027-03-04", "words": 0, "sessions": 0 },
        { "day": "2027-03-05", "words": 0, "sessions": 0 },
        { "day": "2027-03-06", "words": 0, "sessions": 0 },
        { "day": "2027-03-07", "words": 0, "sessions": 0 },
        { "day": "2027-03-08", "words": 0, "sessions": 0 },
        { "day": "2027-03-09", "words": 0, "sessions": 0 },
        { "day": "2027-03-10", "words": 0, "sessions": 0 },
        { "day": "2027-03-11", "words": 0, "sessions": 0 },
        { "day": "2027-03-12", "words": 0, "sessions": 0 },
        { "day": "2027-03-13", "words": 21, "sessions": 1 },
        { "day": "2027-03-14", "words": 34, "sessions": 1 },
        { "day": "2027-03-15", "words": 55, "sessions": 1 },
        { "day": "2027-03-16", "words": 0, "sessions": 0 },
        { "day": "2027-03-17", "words": 0, "sessions": 0 },
        { "day": "2027-03-18", "words": 0, "sessions": 0 },
        { "day": "2027-03-19", "words": 0, "sessions": 0 },
        { "day": "2027-03-20", "words": 0, "sessions": 0 }
      ]
    }
  ],
  "rates": {
    "stt": {
      "minimumBillableSeconds": 10,
      "models": {
        "whisper-large-v3-turbo": 0.04,
        "whisper-large-v3": 0.111,
        "gpt-transcribe": 0.27,
        "gpt-4o-mini-transcribe": 0.18,
        "whisper-1": 0.36,
        "voxtral-mini-latest": 0.18
      },
      "fallbackPerHourUsd": 0.04
    },
    "llm": {
      "promptOverheadTokens": 180,
      "tokensPerWord": 1.35,
      "models": {
        "openai/gpt-oss-120b": { "inputPerMTokUsd": 0.15, "outputPerMTokUsd": 0.6 },
        "openai/gpt-oss-20b": { "inputPerMTokUsd": 0.075, "outputPerMTokUsd": 0.3 },
        "gpt-5.6-luna": { "inputPerMTokUsd": 0.2, "outputPerMTokUsd": 1.2 },
        "gpt-5-nano": { "inputPerMTokUsd": 0.05, "outputPerMTokUsd": 0.4 },
        "deepseek-flash": { "inputPerMTokUsd": 0.3, "outputPerMTokUsd": 1.2 },
        "jev-latest": { "inputPerMTokUsd": 0.042, "outputPerMTokUsd": 0 }
      },
      "fallback": { "inputPerMTokUsd": 0.15, "outputPerMTokUsd": 0.6 }
    }
  },
  "timeBack": {
    "defaultWpm": 40,
    "minutesBack": [
      { "words": 100, "durationMs": 60000, "wpm": 40, "minutesBack": 1.5 },
      { "words": 400, "durationMs": 120000, "wpm": 40, "minutesBack": 8 },
      { "words": 400, "durationMs": 120000, "wpm": 36, "minutesBack": 9.11111111111111 },
      { "words": 10, "durationMs": 90000, "wpm": 40, "minutesBack": -1.25 },
      { "words": 250, "durationMs": 30000, "wpm": 5, "minutesBack": 24.5 },
      { "words": 250, "durationMs": 30000, "wpm": 500, "minutesBack": 0.75 },
      { "words": 0, "durationMs": 0, "wpm": 40, "minutesBack": 0 }
    ],
    "clamp": [
      { "value": null, "clamped": 40 },
      { "value": 0, "clamped": 10 },
      { "value": 9, "clamped": 10 },
      { "value": 10, "clamped": 10 },
      { "value": 36, "clamped": 36 },
      { "value": 200, "clamped": 200 },
      { "value": 201, "clamped": 200 },
      { "value": 72.5, "clamped": 72.5 }
    ],
    "shown": [
      { "raw": -3, "shown": 0 },
      { "raw": 0, "shown": 0 },
      { "raw": 0.04, "shown": 0 },
      { "raw": 0.44, "shown": 0 },
      { "raw": 0.45, "shown": 1 },
      { "raw": 0.5, "shown": 1 },
      { "raw": 1.449, "shown": 1 },
      { "raw": 59.96, "shown": 60 },
      { "raw": 125.25, "shown": 125 }
    ],
    "format": [
      { "minutes": -1, "short": "0 min", "words": "0 minutes" },
      { "minutes": 0, "short": "0 min", "words": "0 minutes" },
      { "minutes": 0.3, "short": "under a minute", "words": "under a minute" },
      { "minutes": 0.6, "short": "1 min", "words": "1 minute" },
      { "minutes": 1, "short": "1 min", "words": "1 minute" },
      { "minutes": 12.4, "short": "12 min", "words": "12 minutes" },
      { "minutes": 59.6, "short": "1 h", "words": "1 hour" },
      { "minutes": 60, "short": "1 h", "words": "1 hour" },
      { "minutes": 65, "short": "1 h 5 min", "words": "1 hour 5 minutes" },
      { "minutes": 120, "short": "2 h", "words": "2 hours" },
      { "minutes": 754, "short": "12 h 34 min", "words": "12 hours 34 minutes" }
    ],
    "typicalLine": [
      { "share": 0, "typical": 41, "line": "0% of your typical day (41 min)" },
      { "share": 0.5, "typical": 41, "line": "50% of your typical day (41 min)" },
      { "share": 1, "typical": 41, "line": "100% of your typical day (41 min)" },
      { "share": 1.234, "typical": 12.5, "line": "123% of your typical day (13 min)" },
      { "share": 2, "typical": 7, "line": "200% of your typical day (7 min)" },
      { "share": 2.01, "typical": 7, "line": "More than double your typical day (7 min)" },
      { "share": 0.995, "typical": 90, "line": "100% of your typical day (1 h 30 min)" }
    ]
  },
  "typical": {
    "dayBack": [
      { "days": [], "typical": null },
      { "days": [1, 2], "typical": null },
      { "days": [3, 1, 2], "typical": 2 },
      { "days": [4, 1, 2, 3], "typical": 2.5 },
      { "days": [0.05, 0.04, 0.06], "typical": 0.1 },
      { "days": [10.26, 3.333, 7.1, 7.1], "typical": 7.1 }
    ],
    "share": [
      { "today": 0, "typical": 0, "share": 0 },
      { "today": 3, "typical": 0, "share": 1 },
      { "today": -1, "typical": 0, "share": 0 },
      { "today": 5, "typical": 10, "share": 0.5 },
      { "today": -2, "typical": 10, "share": 0 },
      { "today": 25, "typical": 10, "share": 2.5 }
    ]
  },
  "aggregate": [
    {
      "name": "nothing yet",
      "today": "2026-10-13",
      "typingWpm": 40,
      "sttModel": "whisper-large-v3-turbo",
      "llmModel": "openai/gpt-oss-20b",
      "takes": [],
      "expect": {
        "lifetime": { "sessions": 0, "words": 0, "minutes": 0, "estCostUsd": 0, "avgWpm": 0, "minutesBack": 0 },
        "month": { "sessions": 0, "words": 0, "minutes": 0, "estCostUsd": 0, "avgWpm": 0, "minutesBack": 0 },
        "today": { "sessions": 0, "words": 0, "minutes": 0, "estCostUsd": 0, "avgWpm": 0, "minutesBack": 0 },
        "days": [
          { "day": "2026-09-30", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-01", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-02", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-03", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-04", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-05", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-06", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-07", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-08", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-09", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-10", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-11", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-12", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-13", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 }
        ],
        "typicalBack": null
      }
    },
    {
      "name": "a month with a typical day",
      "today": "2026-10-13",
      "typingWpm": 36,
      "sttModel": "whisper-large-v3-turbo",
      "llmModel": "openai/gpt-oss-20b",
      "takes": [
        { "day": "2026-08-30", "words": 900, "durationMs": 200000 },
        { "day": "2026-09-14", "words": 300, "durationMs": 60000 },
        { "day": "2026-09-20", "words": 120, "durationMs": 40000 },
        { "day": "2026-09-29", "words": 640, "durationMs": 150000 },
        { "day": "2026-09-30", "words": 55, "durationMs": 9000 },
        { "day": "2026-10-01", "words": 400, "durationMs": 120000 },
        { "day": "2026-10-01", "words": 260, "durationMs": 80000 },
        { "day": "2026-10-05", "words": 1200, "durationMs": 300000 },
        { "day": "2026-10-09", "words": 80, "durationMs": 50000 },
        { "day": "2026-10-12", "words": 700, "durationMs": 150000 },
        { "day": "2026-10-13", "words": 330, "durationMs": 75000 },
        { "day": "2026-10-13", "words": 90, "durationMs": 20000 },
        { "day": "2026-10-14", "words": 999, "durationMs": 100000 }
      ],
      "expect": {
        "lifetime": { "sessions": 13, "words": 6074, "minutes": 22.6, "estCostUsd": 0.0183, "avgWpm": 269, "minutesBack": 146.2 },
        "month": { "sessions": 8, "words": 4059, "minutes": 14.9, "estCostUsd": 0.0121, "avgWpm": 272, "minutesBack": 97.8 },
        "today": { "sessions": 2, "words": 420, "minutes": 1.6, "estCostUsd": 0.0013, "avgWpm": 265, "minutesBack": 10.1 },
        "days": [
          { "day": "2026-09-30", "sessions": 1, "words": 55, "minutes": 0.2, "minutesBack": 1.4 },
          { "day": "2026-10-01", "sessions": 2, "words": 660, "minutes": 3.3, "minutesBack": 15 },
          { "day": "2026-10-02", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-03", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-04", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-05", "sessions": 1, "words": 1200, "minutes": 5, "minutesBack": 28.3 },
          { "day": "2026-10-06", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-07", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-08", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-09", "sessions": 1, "words": 80, "minutes": 0.8, "minutesBack": 1.4 },
          { "day": "2026-10-10", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-11", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-10-12", "sessions": 1, "words": 700, "minutes": 2.5, "minutesBack": 16.9 },
          { "day": "2026-10-13", "sessions": 2, "words": 420, "minutes": 1.6, "minutesBack": 10.1 }
        ],
        "typicalBack": 15
      }
    },
    {
      "name": "too few days for a typical day, held longer than typing",
      "today": "2027-01-02",
      "typingWpm": 40,
      "sttModel": "an unknown model",
      "llmModel": "another unknown model",
      "takes": [
        { "day": "2026-12-30", "words": 20, "durationMs": 120000 },
        { "day": "2027-01-01", "words": 400, "durationMs": 100000 },
        { "day": "2027-01-02", "words": 5, "durationMs": 4000 }
      ],
      "expect": {
        "lifetime": { "sessions": 3, "words": 425, "minutes": 3.7, "estCostUsd": 0.0031, "avgWpm": 114, "minutesBack": 6.9 },
        "month": { "sessions": 2, "words": 405, "minutes": 1.7, "estCostUsd": 0.0017, "avgWpm": 234, "minutesBack": 8.4 },
        "today": { "sessions": 1, "words": 5, "minutes": 0.1, "estCostUsd": 0.0001, "avgWpm": 75, "minutesBack": 0.1 },
        "days": [
          { "day": "2026-12-20", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-21", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-22", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-23", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-24", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-25", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-26", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-27", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-28", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-29", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2026-12-30", "sessions": 1, "words": 20, "minutes": 2, "minutesBack": 0 },
          { "day": "2026-12-31", "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0 },
          { "day": "2027-01-01", "sessions": 1, "words": 400, "minutes": 1.7, "minutesBack": 8.3 },
          { "day": "2027-01-02", "sessions": 1, "words": 5, "minutes": 0.1, "minutesBack": 0.1 }
        ],
        "typicalBack": null
      }
    },
    {
      "name": "a slow typist, every day in the window",
      "today": "2026-03-08",
      "typingWpm": 20,
      "sttModel": "whisper-large-v3",
      "llmModel": "llama-3.3-70b-versatile",
      "takes": [
        { "day": "2026-02-07", "words": 50, "durationMs": 20000 },
        { "day": "2026-02-08", "words": 147, "durationMs": 33000 },
        { "day": "2026-02-09", "words": 244, "durationMs": 46000 },
        { "day": "2026-02-10", "words": 341, "durationMs": 59000 },
        { "day": "2026-02-11", "words": 438, "durationMs": 72000 },
        { "day": "2026-02-12", "words": 135, "durationMs": 85000 },
        { "day": "2026-02-13", "words": 232, "durationMs": 28000 },
        { "day": "2026-02-14", "words": 329, "durationMs": 41000 },
        { "day": "2026-02-15", "words": 426, "durationMs": 54000 },
        { "day": "2026-02-16", "words": 123, "durationMs": 67000 },
        { "day": "2026-02-17", "words": 220, "durationMs": 80000 },
        { "day": "2026-02-18", "words": 317, "durationMs": 23000 },
        { "day": "2026-02-19", "words": 414, "durationMs": 36000 },
        { "day": "2026-02-20", "words": 111, "durationMs": 49000 },
        { "day": "2026-02-21", "words": 208, "durationMs": 62000 },
        { "day": "2026-02-22", "words": 305, "durationMs": 75000 },
        { "day": "2026-02-23", "words": 402, "durationMs": 88000 },
        { "day": "2026-02-24", "words": 99, "durationMs": 31000 },
        { "day": "2026-02-25", "words": 196, "durationMs": 44000 },
        { "day": "2026-02-26", "words": 293, "durationMs": 57000 },
        { "day": "2026-02-27", "words": 390, "durationMs": 70000 },
        { "day": "2026-02-28", "words": 87, "durationMs": 83000 },
        { "day": "2026-03-01", "words": 184, "durationMs": 26000 },
        { "day": "2026-03-02", "words": 281, "durationMs": 39000 },
        { "day": "2026-03-03", "words": 378, "durationMs": 52000 },
        { "day": "2026-03-04", "words": 75, "durationMs": 65000 },
        { "day": "2026-03-05", "words": 172, "durationMs": 78000 },
        { "day": "2026-03-06", "words": 269, "durationMs": 21000 },
        { "day": "2026-03-07", "words": 366, "durationMs": 34000 },
        { "day": "2026-03-08", "words": 63, "durationMs": 47000 }
      ],
      "expect": {
        "lifetime": { "sessions": 30, "words": 7295, "minutes": 26.1, "estCostUsd": 0.0565, "avgWpm": 280, "minutesBack": 338.7 },
        "month": { "sessions": 8, "words": 1788, "minutes": 6, "estCostUsd": 0.0132, "avgWpm": 296, "minutesBack": 83.4 },
        "today": { "sessions": 1, "words": 63, "minutes": 0.8, "estCostUsd": 0.0015, "avgWpm": 80, "minutesBack": 2.4 },
        "days": [
          { "day": "2026-02-23", "sessions": 1, "words": 402, "minutes": 1.5, "minutesBack": 18.6 },
          { "day": "2026-02-24", "sessions": 1, "words": 99, "minutes": 0.5, "minutesBack": 4.4 },
          { "day": "2026-02-25", "sessions": 1, "words": 196, "minutes": 0.7, "minutesBack": 9.1 },
          { "day": "2026-02-26", "sessions": 1, "words": 293, "minutes": 1, "minutesBack": 13.7 },
          { "day": "2026-02-27", "sessions": 1, "words": 390, "minutes": 1.2, "minutesBack": 18.3 },
          { "day": "2026-02-28", "sessions": 1, "words": 87, "minutes": 1.4, "minutesBack": 3 },
          { "day": "2026-03-01", "sessions": 1, "words": 184, "minutes": 0.4, "minutesBack": 8.8 },
          { "day": "2026-03-02", "sessions": 1, "words": 281, "minutes": 0.7, "minutesBack": 13.4 },
          { "day": "2026-03-03", "sessions": 1, "words": 378, "minutes": 0.9, "minutesBack": 18 },
          { "day": "2026-03-04", "sessions": 1, "words": 75, "minutes": 1.1, "minutesBack": 2.7 },
          { "day": "2026-03-05", "sessions": 1, "words": 172, "minutes": 1.3, "minutesBack": 7.3 },
          { "day": "2026-03-06", "sessions": 1, "words": 269, "minutes": 0.4, "minutesBack": 13.1 },
          { "day": "2026-03-07", "sessions": 1, "words": 366, "minutes": 0.6, "minutesBack": 17.7 },
          { "day": "2026-03-08", "sessions": 1, "words": 63, "minutes": 0.8, "minutesBack": 2.4 }
        ],
        "typicalBack": 12.3
      }
    }
  ],
  "heatmap": [
    {
      "name": "a new profile, lifetime",
      "today": "2026-10-13",
      "year": null,
      "takes": [],
      "expect": { "first": "2025-10-14", "last": "2026-10-13", "count": 365, "busy": [], "totalWords": 0, "years": [2026], "period": "lifetime" }
    },
    {
      "name": "a recent start, lifetime pads back a year",
      "today": "2026-10-13",
      "year": null,
      "takes": [
        { "day": "2026-09-01", "words": 50, "durationMs": 10000 },
        { "day": "2026-10-13", "words": 70, "durationMs": 10000 },
        { "day": "2026-10-13", "words": 30, "durationMs": 5000 }
      ],
      "expect": {
        "first": "2025-10-14",
        "last": "2026-10-13",
        "count": 365,
        "busy": [
          { "day": "2026-09-01", "words": 50 },
          { "day": "2026-10-13", "words": 100 }
        ],
        "totalWords": 150,
        "years": [2026],
        "period": "lifetime"
      }
    },
    {
      "name": "an old first take, lifetime starts there",
      "today": "2026-10-13",
      "year": null,
      "takes": [
        { "day": "2024-12-25", "words": 10, "durationMs": 5000 },
        { "day": "2026-02-28", "words": 40, "durationMs": 9000 }
      ],
      "expect": {
        "first": "2024-12-25",
        "last": "2026-10-13",
        "count": 658,
        "busy": [
          { "day": "2024-12-25", "words": 10 },
          { "day": "2026-02-28", "words": 40 }
        ],
        "totalWords": 50,
        "years": [2024, 2026],
        "period": "lifetime"
      }
    },
    {
      "name": "a past year",
      "today": "2026-10-13",
      "year": 2025,
      "takes": [
        { "day": "2024-12-25", "words": 10, "durationMs": 5000 },
        { "day": "2025-03-01", "words": 99, "durationMs": 9000 },
        { "day": "2026-01-01", "words": 7, "durationMs": 2000 }
      ],
      "expect": {
        "first": "2025-01-01",
        "last": "2025-12-31",
        "count": 365,
        "busy": [
          { "day": "2025-03-01", "words": 99 }
        ],
        "totalWords": 99,
        "years": [2024, 2025, 2026],
        "period": 2025
      }
    },
    {
      "name": "this year, up to today",
      "today": "2028-03-01",
      "year": 2028,
      "takes": [
        { "day": "2028-02-29", "words": 64, "durationMs": 9000 },
        { "day": "2027-12-31", "words": 3, "durationMs": 1000 }
      ],
      "expect": {
        "first": "2028-01-01",
        "last": "2028-03-01",
        "count": 61,
        "busy": [
          { "day": "2028-02-29", "words": 64 }
        ],
        "totalWords": 64,
        "years": [2027, 2028],
        "period": 2028
      }
    }
  ],
  "recap": [
    { "sessions": 0, "words": 0, "minutes": 0, "minutesBack": 0, "body": "A quiet day: no dictations. Your hotkey misses you." },
    { "sessions": 1, "words": 12, "minutes": 0.3, "minutesBack": 0, "body": "1 session, 0.3 minutes, 12 words today." },
    { "sessions": 4, "words": 1240, "minutes": 12, "minutesBack": 19, "body": "4 sessions, 12 minutes, 1,240 words today. 19 minutes back." },
    { "sessions": 2, "words": 300, "minutes": 2.5, "minutesBack": 0.6, "body": "2 sessions, 2.5 minutes, 300 words today." },
    {
      "sessions": 9,
      "words": 25000,
      "minutes": 61.2,
      "minutesBack": 125,
      "body": "9 sessions, 61.2 minutes, 25,000 words today. 2 hours 5 minutes back."
    }
  ]
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/shared/analytics-vectors.test.ts`
Expected: 19 pass. Then `npm run test` passes 1020.

- [ ] **Step 5: Run the gates and commit**

```bash
git add shared/analytics-vectors.json src/shared/analytics-vectors.test.ts
git commit -m "IOS-022: desktop's month, wall, typical day, time back, cost, and recap on shared takes, for both platforms to run"
```

### Task 3: Time back, the numbers, and the recap in MurmurCore

**Files:**
- Create `ios/MurmurCore/Sources/MurmurCore/TimeBack.swift` and `ios/MurmurCore/Sources/MurmurCore/Recap.swift`.
- Modify `ios/MurmurCore/Sources/MurmurCore/Analytics.swift`.
- Test `ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift`.

**Interfaces:** Produces:
- `TimeBack`: `minWpm`, `maxWpm`, `thumbWpm` (36), `clamp(_:fallback:)`, `minutesBack(words:durationMs:wpm:)`, `shownMinutes`, `format`, `formatWords`, and `typicalLine(share:typical:)`;
- `UsageEvent`, `LlmRate`, `Rates(_ catalog:)`, `UsageTotals`, `DayUsage`, `AnalyticsSummary`, `HeatDay` (Hashable), and `Heatmap`, all with public initializers;
- `Analytics.typicalWindowDays`, `typicalMinDays`, `typicalDayBack`, `typicalShare(today:typical:)`, `sessionCost`, `aggregate(_:rates:today:sttModel:llmModel:dayCount:typingWpm:)`, and `heatmap(_:today:year:)`;
- `RecapSummary` (with `init(_ totals:)`), `RecapWords` (`.desktop`, `.iPhone`), `Recap.body(_:words:locale:)`, and `Recap.number`.

- [ ] **Step 1: Write the failing test**

`ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/analytics-vectors.json: desktop's analytics, time back, and recap
/// on fixed takes.
struct AnalyticsVectors: Decodable {
    struct Take: Decodable {
        let day: String
        let words: Int
        let durationMs: Int?

        var usage: UsageEvent { UsageEvent(day: day, words: words, durationMs: durationMs ?? 1000) }
    }

    struct Day: Decodable, Equatable {
        let day: String
        let words: Int
        let sessions: Int
    }

    struct DailyCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let count: Int
        let takes: [Take]
        let expect: [Day]

        var testDescription: String { name }
    }

    struct RatesJSON: Decodable {
        struct Stt: Decodable {
            let minimumBillableSeconds: Double
            let models: [String: Double]
            let fallbackPerHourUsd: Double
        }

        struct LlmRate: Decodable {
            let inputPerMTokUsd: Double
            let outputPerMTokUsd: Double
        }

        struct Llm: Decodable {
            let promptOverheadTokens: Double
            let tokensPerWord: Double
            let models: [String: LlmRate]
            let fallback: LlmRate
        }

        let stt: Stt
        let llm: Llm
    }

    struct TimeBackCases: Decodable {
        struct Back: Decodable {
            let words: Int
            let durationMs: Int
            let wpm: Double
            let minutesBack: Double
        }

        struct Clamp: Decodable {
            let value: Double?
            let clamped: Double
        }

        struct Shown: Decodable {
            let raw: Double
            let shown: Double
        }

        struct Format: Decodable {
            let minutes: Double
            let short: String
            let words: String
        }

        struct Line: Decodable {
            let share: Double
            let typical: Double
            let line: String
        }

        let defaultWpm: Double
        let minutesBack: [Back]
        let clamp: [Clamp]
        let shown: [Shown]
        let format: [Format]
        let typicalLine: [Line]
    }

    struct TypicalCases: Decodable {
        struct DayBack: Decodable {
            let days: [Double]
            let typical: Double?
        }

        struct Share: Decodable {
            let today: Double
            let typical: Double
            let share: Double
        }

        let dayBack: [DayBack]
        let share: [Share]
    }

    struct Totals: Decodable {
        let sessions, words: Int
        let minutes, estCostUsd: Double
        let avgWpm: Int
        let minutesBack: Double
    }

    struct Usage: Decodable {
        let day: String
        let sessions, words: Int
        let minutes, minutesBack: Double
    }

    struct Summary: Decodable {
        let lifetime, month, today: Totals
        let days: [Usage]
        let typicalBack: Double?
    }

    struct AggregateCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let typingWpm: Double
        let sttModel: String
        let llmModel: String
        let takes: [Take]
        let expect: Summary

        var testDescription: String { name }
    }

    struct HeatSummary: Decodable {
        let first: String?
        let last: String?
        let count: Int
        let busy: [Day2]
        let totalWords: Int
        let years: [Int]
        /// "lifetime", or the year.
        let period: Period

        struct Day2: Decodable, Equatable {
            let day: String
            let words: Int
        }

        enum Period: Decodable, Equatable {
            case lifetime
            case year(Int)

            init(from decoder: any Decoder) throws {
                let container = try decoder.singleValueContainer()
                if let year = try? container.decode(Int.self) { self = .year(year) } else { self = .lifetime }
            }
        }
    }

    struct HeatCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let year: Int?
        let takes: [Take]
        let expect: HeatSummary

        var testDescription: String { name }
    }

    struct RecapCase: Decodable {
        let sessions, words: Int
        let minutes, minutesBack: Double
        let body: String
    }

    /// Desktop's CARD_DAYS: the days the share card paints.
    let cardDays: Int
    let dailyTotals: [DailyCase]
    let rates: RatesJSON
    let timeBack: TimeBackCases
    let typical: TypicalCases
    let aggregate: [AggregateCase]
    let heatmap: [HeatCase]
    let recap: [RecapCase]

    static let file: AnalyticsVectors? = try? SharedData(directory: repoShared).decode(AnalyticsVectors.self, from: "analytics-vectors.json")
    static let catalog: ProviderCatalog? = try? SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")
}

/// Near enough: sums of doubles in the same order, give or take a last bit.
private func near(_ a: Double, _ b: Double) -> Bool {
    abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))
}

private func same(_ got: UsageTotals, _ want: AnalyticsVectors.Totals) -> Bool {
    got.sessions == want.sessions && got.words == want.words && near(got.minutes, want.minutes) && near(got.estCostUsd, want.estCostUsd) && got.avgWpm == want.avgWpm && near(got.minutesBack, want.minutesBack)
}

@Suite struct AnalyticsVectorTests {
    @Test func theVectorsLoad() throws {
        #expect(try #require(AnalyticsVectors.file).dailyTotals.count >= 5)
    }

    /// The card's month is desktop's length, so its strokes and its words
    /// ("in the last 30 days", painted by desktop's code) always agree.
    @Test func theCardsMonthIsDesktops() throws {
        #expect(try #require(AnalyticsVectors.file).cardDays == Analytics.cardDays)
    }

    @Test(arguments: AnalyticsVectors.file?.dailyTotals ?? [])
    func eachMonthTotalsAsOnDesktop(_ vector: AnalyticsVectors.DailyCase) {
        let events = vector.takes.map { RankEvent(at: 0, words: $0.words, day: $0.day) }
        let days = Analytics.dailyTotals(events, count: vector.count, today: vector.today)
        #expect(days.map { AnalyticsVectors.Day(day: $0.day, words: $0.words, sessions: $0.sessions) } == vector.expect)
    }

    /// No days asked for is no days, and a take with no day key is left out.
    @Test func edges() {
        #expect(Analytics.dailyTotals([], count: 0, today: "2026-10-13").isEmpty)
        let odd = [RankEvent(at: 0, words: 9, day: "")]
        #expect(Analytics.dailyTotals(odd, count: 2, today: "2026-10-13").map(\.words) == [0, 0])
    }

    /// The rates read from the bundled catalog as desktop's ratesFromCatalog reads them.
    @Test func ratesAreDesktops() throws {
        let want = try #require(AnalyticsVectors.file).rates
        let rates = Rates(try #require(AnalyticsVectors.catalog))
        #expect(rates.sttMinimumBillableSeconds == want.stt.minimumBillableSeconds)
        #expect(rates.sttModels == want.stt.models)
        #expect(rates.sttFallbackPerHourUsd == want.stt.fallbackPerHourUsd)
        #expect(rates.promptOverheadTokens == want.llm.promptOverheadTokens && rates.tokensPerWord == want.llm.tokensPerWord)
        #expect(rates.llmModels == want.llm.models.mapValues { LlmRate(inputPerMTokUsd: $0.inputPerMTokUsd, outputPerMTokUsd: $0.outputPerMTokUsd) })
        #expect(rates.llmFallback == LlmRate(inputPerMTokUsd: want.llm.fallback.inputPerMTokUsd, outputPerMTokUsd: want.llm.fallback.outputPerMTokUsd))
    }

    @Test func timeBackIsDesktops() throws {
        let t = try #require(AnalyticsVectors.file).timeBack
        for c in t.minutesBack {
            #expect(TimeBack.minutesBack(words: c.words, durationMs: c.durationMs, wpm: c.wpm) == c.minutesBack, "\(c.words) \(c.durationMs) \(c.wpm)")
        }
        for c in t.clamp {
            #expect(TimeBack.clamp(c.value, fallback: t.defaultWpm) == c.clamped, "\(String(describing: c.value))")
        }
        for c in t.shown { #expect(TimeBack.shownMinutes(c.raw) == c.shown, "\(c.raw)") }
        for c in t.format {
            #expect(TimeBack.format(c.minutes) == c.short, "\(c.minutes)")
            #expect(TimeBack.formatWords(c.minutes) == c.words, "\(c.minutes)")
        }
        for c in t.typicalLine { #expect(TimeBack.typicalLine(share: c.share, typical: c.typical) == c.line) }
    }

    @Test func theTypicalDayIsDesktops() throws {
        let t = try #require(AnalyticsVectors.file).typical
        for c in t.dayBack { #expect(Analytics.typicalDayBack(c.days) == c.typical, "\(c.days)") }
        for c in t.share { #expect(Analytics.typicalShare(today: c.today, typical: c.typical) == c.share, "\(c.today) \(c.typical)") }
    }

    @Test(arguments: AnalyticsVectors.file?.aggregate ?? [])
    func eachSummaryIsDesktops(_ vector: AnalyticsVectors.AggregateCase) throws {
        let rates = Rates(try #require(AnalyticsVectors.catalog))
        let got = Analytics.aggregate(vector.takes.map(\.usage), rates: rates, today: vector.today, sttModel: vector.sttModel, llmModel: vector.llmModel, typingWpm: vector.typingWpm)
        let want = vector.expect
        #expect(same(got.lifetime, want.lifetime), "lifetime \(got.lifetime)")
        #expect(same(got.month, want.month), "month \(got.month)")
        #expect(same(got.today, want.today), "today \(got.today)")
        #expect(got.days.map(\.day) == want.days.map(\.day))
        for (g, w) in zip(got.days, want.days) {
            #expect(g.sessions == w.sessions && g.words == w.words && near(g.minutes, w.minutes) && near(g.minutesBack, w.minutesBack), "\(g.day)")
        }
        #expect(got.typicalBack == want.typicalBack)
    }

    @Test(arguments: AnalyticsVectors.file?.heatmap ?? [])
    func eachWallIsDesktops(_ vector: AnalyticsVectors.HeatCase) {
        let wall = Analytics.heatmap(vector.takes.map(\.usage), today: vector.today, year: vector.year)
        let want = vector.expect
        #expect(wall.days.first?.day == want.first && wall.days.last?.day == want.last && wall.days.count == want.count)
        #expect(wall.days.filter { $0.words > 0 }.map { AnalyticsVectors.HeatSummary.Day2(day: $0.day, words: $0.words) } == want.busy)
        #expect(wall.totalWords == want.totalWords && wall.years == want.years)
        #expect(wall.year.map { AnalyticsVectors.HeatSummary.Period.year($0) } ?? .lifetime == want.period)
    }

    /// Desktop's recap sentence, with desktop's words for its takes.
    @Test func theRecapIsDesktops() throws {
        for c in try #require(AnalyticsVectors.file).recap {
            let summary = RecapSummary(sessions: c.sessions, words: c.words, minutes: c.minutes, minutesBack: c.minutesBack)
            #expect(Recap.body(summary, words: .desktop, locale: Locale(identifier: "en_US")) == c.body)
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find type 'UsageEvent' in scope`.

- [ ] **Step 3: Port the numbers**

`ios/MurmurCore/Sources/MurmurCore/TimeBack.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Time back (ios/prd.json IOS-022): the minutes a dictation did not spend
// typing, desktop's src/shared/timeback.ts held to it by
// shared/analytics-vectors.json. Nothing is stored per take; the number
// derives from words and duration at the typing speed, so a speed edit
// restates every day honestly. On iPhone the speed is thumbs on glass.
import Foundation

public enum TimeBack {
    public static let minWpm = 10.0
    public static let maxWpm = 200.0

    /// Typing on a phone: 36.17 words a minute on average across 37,370
    /// people (Palin, Feit, Kim, Kristensson, and Oulasvirta, "How do People
    /// Type on Mobile Devices? Observations from a Study with 37,000
    /// Volunteers", MobileHCI 2019, https://doi.org/10.1145/3338286.3340120;
    /// checked 2026-10-13). Desktop measures against 40 at a keyboard.
    public static let thumbWpm = 36.0

    /// A usable typing speed: the fallback for nothing or anything not
    /// finite, otherwise clamped into the band, so a corrupt setting can
    /// never divide by zero or invent hours.
    public static func clamp(_ wpm: Double?, fallback: Double = thumbWpm) -> Double {
        guard let wpm, wpm.isFinite else { return fallback }
        return min(maxWpm, max(minWpm, wpm))
    }

    /// Minutes back for one take: typing time at the speed minus the time
    /// spoken. Negative when speaking cost more than typing would have;
    /// callers floor the display, never the arithmetic.
    public static func minutesBack(words: Int, durationMs: Int, wpm: Double) -> Double {
        let typing: Double = Double(words) / clamp(wpm)
        let spoken: Double = Double(durationMs) / 60_000
        return typing - spoken
    }

    /// The whole minutes a surface shows for a raw total: floored at zero,
    /// rounded to a tenth the way the analytics are, then to the minute.
    public static func shownMinutes(_ raw: Double) -> Double {
        guard raw.isFinite else { return 0 }
        return JS.round(JS.round(max(0, raw) * 10) / 10)
    }

    /// "0 min", "under a minute", "12 min", "1 h 5 min", "2 h".
    public static func format(_ minutes: Double) -> String {
        guard minutes.isFinite, minutes > 0 else { return "0 min" }
        let whole = Int(JS.round(minutes))
        if whole == 0 { return "under a minute" }
        if whole < 60 { return "\(whole) min" }
        let hours = whole / 60
        let rest = whole % 60
        return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
    }

    /// "30 minutes", "1 hour 5 minutes", "2 hours": the spoken form, for a
    /// notification's sentence.
    public static func formatWords(_ minutes: Double) -> String {
        guard minutes.isFinite, minutes > 0 else { return "0 minutes" }
        let whole = Int(JS.round(minutes))
        if whole == 0 { return "under a minute" }
        let hours = whole / 60
        let rest = whole % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) \(hours == 1 ? "hour" : "hours")") }
        if rest > 0 { parts.append("\(rest) \(rest == 1 ? "minute" : "minutes")") }
        return parts.joined(separator: " ")
    }

    /// Today in words against a typical day. Past double, the percentage
    /// stops meaning much, so it says so instead.
    public static func typicalLine(share: Double, typical: Double) -> String {
        let of = "your typical day (\(format(typical)))"
        let percent = Int(JS.round(share * 100))
        return share > 2 ? "More than double \(of)" : "\(percent)% of \(of)"
    }
}
```

`ios/MurmurCore/Sources/MurmurCore/Analytics.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The analytics (ios/prd.json IOS-021, IOS-022): desktop's
// src/shared/analytics.ts over the iPhone's takes, held to it by
// shared/analytics-vectors.json: the share card's month, this month, today,
// the lifetime, the last fourteen days, the typical day, the activity
// wall, and the estimated cost at the catalog's rates. Days are the keys
// each take stored, so a time zone change never re-buckets the past.
import Foundation

/// One day's words and takes.
public struct DayTotal: Sendable, Hashable {
    public let day: String
    public let words: Int
    public let sessions: Int

    public init(day: String, words: Int, sessions: Int) {
        self.day = day
        self.words = words
        self.sessions = sessions
    }
}

/// One take as the numbers see it: its day, its words, how long it ran.
public struct UsageEvent: Sendable, Equatable {
    public let day: String
    public let words: Int
    public let durationMs: Int

    public init(day: String, words: Int, durationMs: Int) {
        self.day = day
        self.words = words
        self.durationMs = durationMs
    }
}

/// A chat model's price, US dollars per million tokens.
public struct LlmRate: Sendable, Equatable {
    public let inputPerMTokUsd: Double
    public let outputPerMTokUsd: Double

    public init(inputPerMTokUsd: Double, outputPerMTokUsd: Double) {
        self.inputPerMTokUsd = inputPerMTokUsd
        self.outputPerMTokUsd = outputPerMTokUsd
    }
}

/// The rates the estimate prices takes at, as desktop's ratesFromCatalog
/// reads them from shared/provider-catalog.json: US dollar rates only, the
/// first provider listing a model setting its price.
public struct Rates: Sendable, Equatable {
    public let sttMinimumBillableSeconds: Double
    public let sttModels: [String: Double]
    public let sttFallbackPerHourUsd: Double
    public let promptOverheadTokens: Double
    public let tokensPerWord: Double
    public let llmModels: [String: LlmRate]
    public let llmFallback: LlmRate

    public init(_ catalog: ProviderCatalog) {
        var stt: [String: Double] = [:]
        var llm: [String: LlmRate] = [:]
        var minimum = 0.0
        for provider in catalog.providers {
            for model in provider.sttModels {
                if let perHour = model.perHourUsd, (model.currency ?? "USD") == "USD", stt[model.id] == nil {
                    stt[model.id] = perHour
                    minimum = max(minimum, model.minimumBillableSeconds ?? 0)
                }
            }
            for model in provider.llmModels {
                if let input = model.inputPerMTok, let output = model.outputPerMTok, (model.currency ?? "USD") == "USD", llm[model.id] == nil {
                    llm[model.id] = LlmRate(inputPerMTokUsd: input, outputPerMTokUsd: output)
                }
            }
        }
        sttMinimumBillableSeconds = minimum
        sttModels = stt
        sttFallbackPerHourUsd = stt["whisper-large-v3-turbo"] ?? 0.04
        promptOverheadTokens = catalog.estimate.promptOverheadTokens
        tokensPerWord = catalog.estimate.tokensPerWord
        llmModels = llm
        llmFallback = llm["openai/gpt-oss-120b"] ?? LlmRate(inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6)
    }
}

/// Totals over a span of takes, rounded the way desktop shows them.
public struct UsageTotals: Sendable, Equatable {
    public var sessions = 0
    public var words = 0
    /// Minutes spoken, to a tenth.
    public var minutes = 0.0
    /// Estimated cost, US dollars to a hundredth of a cent.
    public var estCostUsd = 0.0
    /// Words per spoken minute across the span.
    public var avgWpm = 0
    /// Minutes not spent typing, to a tenth, never below zero.
    public var minutesBack = 0.0

    public init(sessions: Int = 0, words: Int = 0, minutes: Double = 0, estCostUsd: Double = 0, avgWpm: Int = 0, minutesBack: Double = 0) {
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.estCostUsd = estCostUsd
        self.avgWpm = avgWpm
        self.minutesBack = minutesBack
    }
}

/// One day of the chart.
public struct DayUsage: Sendable, Equatable {
    public let day: String
    public var sessions = 0
    public var words = 0
    public var minutes = 0.0
    public var minutesBack = 0.0

    public init(day: String, sessions: Int = 0, words: Int = 0, minutes: Double = 0, minutesBack: Double = 0) {
        self.day = day
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.minutesBack = minutesBack
    }
}

/// Everything the numbers screen and Home show.
public struct AnalyticsSummary: Sendable, Equatable {
    public let lifetime: UsageTotals
    public let month: UsageTotals
    public let today: UsageTotals
    /// The chart's days, oldest first, ending today.
    public let days: [DayUsage]
    /// The typical day's time back, or nil with too few days to call one typical.
    public let typicalBack: Double?

    public init(lifetime: UsageTotals, month: UsageTotals, today: UsageTotals, days: [DayUsage], typicalBack: Double?) {
        self.lifetime = lifetime
        self.month = month
        self.today = today
        self.days = days
        self.typicalBack = typicalBack
    }
}

/// One day on the activity wall.
public struct HeatDay: Sendable, Hashable {
    public let day: String
    public let words: Int

    public init(day: String, words: Int) {
        self.day = day
        self.words = words
    }
}

/// The activity wall's days.
public struct Heatmap: Sendable, Equatable {
    /// Oldest first, zero-filled, covering the whole period.
    public let days: [HeatDay]
    public let totalWords: Int
    /// Calendar years holding a take, oldest first.
    public let years: [Int]
    /// The year shown, or nil for the lifetime.
    public let year: Int?

    public init(days: [HeatDay], totalWords: Int, years: [Int], year: Int?) {
        self.days = days
        self.totalWords = totalWords
        self.years = years
        self.year = year
    }
}

public enum Analytics {
    /// The days the share card paints (desktop's CARD_DAYS).
    public static let cardDays = 30
    /// A typical day is measured over this many days before today.
    public static let typicalWindowDays = 28
    /// Fewer active days than this in the window and there is no typical day.
    public static let typicalMinDays = 3

    /// Words and takes for each of the last `count` days ending `today`
    /// (a yyyy-MM-dd key), oldest first, zero-filled, by each take's stored
    /// day, as desktop's dailyTotals counts them.
    public static func dailyTotals(_ events: [RankEvent], count: Int, today: String) -> [DayTotal] {
        guard count > 0 else { return [] }
        let keys = (0..<count).map { Paintings.shiftDay(today, $0 - (count - 1)) }
        var words: [String: Int] = [:]
        var sessions: [String: Int] = [:]
        let wanted = Set(keys)
        for event in events where wanted.contains(event.day) {
            words[event.day, default: 0] += event.words
            sessions[event.day, default: 0] += 1
        }
        return keys.map { DayTotal(day: $0, words: words[$0] ?? 0, sessions: sessions[$0] ?? 0) }
    }

    /// The median time back across the active days given (each day's
    /// total), or nil when there are too few to call any of them typical.
    public static func typicalDayBack(_ days: [Double]) -> Double? {
        guard days.count >= typicalMinDays else { return nil }
        let sorted = days.sorted()
        let mid = sorted.count / 2
        let median = sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
        return roundBack(median)
    }

    /// Today as a share of a typical day: 1 is typical, above 1 a bigger
    /// day. A typical day with no time back counts any time back as full.
    public static func typicalShare(today: Double, typical: Double) -> Double {
        if typical <= 0 { return today > 0 ? 1 : 0 }
        return max(0, today) / typical
    }

    /// The estimated cost of one take: its audio at the speech model's
    /// hourly rate (billed at least the minimum), and the cleanup pass's
    /// tokens in and out at the chat model's.
    public static func sessionCost(words: Int, durationMs: Int, rates: Rates, sttModel: String, llmModel: String) -> Double {
        let seconds: Double = max(Double(durationMs) / 1000, rates.sttMinimumBillableSeconds)
        let perHour: Double = rates.sttModels[sttModel] ?? rates.sttFallbackPerHourUsd
        let stt: Double = seconds / 3600 * perHour
        let llm = rates.llmModels[llmModel] ?? rates.llmFallback
        let content: Double = Double(words) * rates.tokensPerWord
        let input: Double = content + rates.promptOverheadTokens
        let inCost: Double = input / 1_000_000 * llm.inputPerMTokUsd
        let outCost: Double = content / 1_000_000 * llm.outputPerMTokUsd
        return stt + (inCost + outCost)
    }

    /// The numbers for these takes as of `today`, at the typing speed and
    /// rates given, with `dayCount` days in the chart.
    public static func aggregate(_ events: [UsageEvent], rates: Rates, today: String, sttModel: String, llmModel: String, dayCount: Int = 14, typingWpm: Double) -> AnalyticsSummary {
        let monthPrefix = String(today.prefix(7))
        var lifetime = Raw()
        var month = Raw()
        var todays = Raw()
        var days = (0..<dayCount).map { DayUsage(day: Paintings.shiftDay(today, $0 - (dayCount - 1))) }
        var dayIndex: [String: Int] = [:]
        for (index, day) in days.enumerated() { dayIndex[day.day] = index }
        let window = Set((1...typicalWindowDays).map { Paintings.shiftDay(today, -$0) })
        var backByDay: [String: Double] = [:]
        for event in events {
            let cost = sessionCost(words: event.words, durationMs: event.durationMs, rates: rates, sttModel: sttModel, llmModel: llmModel)
            let back = TimeBack.minutesBack(words: event.words, durationMs: event.durationMs, wpm: typingWpm)
            lifetime.add(event, cost: cost, back: back)
            if event.day.hasPrefix(monthPrefix) { month.add(event, cost: cost, back: back) }
            if event.day == today { todays.add(event, cost: cost, back: back) }
            if window.contains(event.day) { backByDay[event.day, default: 0] += back }
            if let index = dayIndex[event.day] {
                days[index].sessions += 1
                days[index].words += event.words
                // Raw sums; rounded once after the loop, so rounding never compounds.
                days[index].minutes += Double(event.durationMs) / 60_000
                days[index].minutesBack += back
            }
        }
        for index in days.indices {
            days[index].minutes = JS.round(days[index].minutes * 10) / 10
            days[index].minutesBack = roundBack(days[index].minutesBack)
        }
        // Each day as it is shown (never below zero) before the median, in
        // the order desktop met them.
        let typical = typicalDayBack(backByDay.values.map(roundBack))
        return AnalyticsSummary(lifetime: lifetime.rounded, month: month.rounded, today: todays.rounded, days: days, typicalBack: typical)
    }

    /// The activity wall's days: with no year, the lifetime, from the first
    /// take through today, padded back to at least a full year; with a
    /// year, that calendar year alone, clipped at today.
    public static func heatmap(_ events: [UsageEvent], today: String, year: Int?) -> Heatmap {
        var wordsByDay: [String: Int] = [:]
        var years = Set<Int>()
        for event in events where Paintings.isDayKey(event.day) {
            wordsByDay[event.day, default: 0] += event.words
            if let y = Int(event.day.prefix(4)) { years.insert(y) }
        }
        let start: String
        let end: String
        if let year {
            let first = String(format: "%04d-01-01", year)
            let last = String(format: "%04d-12-31", year)
            start = first
            end = min(last, today)
        } else {
            end = today
            let yearAgo = Paintings.shiftDay(today, -364)
            let firstTake = wordsByDay.keys.min() ?? yearAgo
            start = min(firstTake, yearAgo)
        }
        var days: [HeatDay] = []
        var total = 0
        var day = start
        while day <= end {
            let words = wordsByDay[day] ?? 0
            days.append(HeatDay(day: day, words: words))
            total += words
            day = Paintings.shiftDay(day, 1)
        }
        // A brand new history still gets this year as a destination.
        if years.isEmpty, let y = Int(today.prefix(4)) { years.insert(y) }
        return Heatmap(days: days, totalWords: total, years: years.sorted(), year: year)
    }

    /// Display rounding for time back: a total never reads below zero.
    static func roundBack(_ minutes: Double) -> Double {
        JS.round(max(0, minutes) * 10) / 10
    }

    /// Unrounded running totals.
    private struct Raw {
        var sessions = 0
        var words = 0
        var minutes = 0.0
        var cost = 0.0
        var back = 0.0

        mutating func add(_ event: UsageEvent, cost: Double, back: Double) {
            sessions += 1
            words += event.words
            minutes += Double(event.durationMs) / 60_000
            self.cost += cost
            self.back += back
        }

        var rounded: UsageTotals {
            let wpm = minutes > 0 ? Int(JS.round(Double(words) / minutes)) : 0
            return UsageTotals(
                sessions: sessions,
                words: words,
                minutes: JS.round(minutes * 10) / 10,
                estCostUsd: JS.round(cost * 10_000) / 10_000,
                avgWpm: wpm,
                minutesBack: roundBack(back)
            )
        }
    }
}
```

`ios/MurmurCore/Sources/MurmurCore/Recap.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The daily recap's sentence (ios/prd.json IOS-022): desktop's recapBody
// (src/shared/recap.ts), held to it by shared/analytics-vectors.json. The
// iPhone says takes where desktop says sessions (a session on iPhone is the
// listening window), one minute where desktop says 1 minutes, and its quiet
// day misses the pill, not a hotkey.
import Foundation

/// A day as the recap reads it.
public struct RecapSummary: Sendable, Equatable {
    public let sessions: Int
    public let words: Int
    /// Minutes spoken, to a tenth.
    public let minutes: Double
    /// Time back, already floored for display.
    public let minutesBack: Double

    public init(sessions: Int, words: Int, minutes: Double, minutesBack: Double) {
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.minutesBack = minutesBack
    }

    /// Today's line of the numbers.
    public init(_ totals: UsageTotals) {
        self.init(sessions: totals.sessions, words: totals.words, minutes: totals.minutes, minutesBack: totals.minutesBack)
    }
}

/// The words a platform's recap uses for its takes, its minutes, and its
/// quiet day.
public struct RecapWords: Sendable, Equatable {
    public let one: String
    public let many: String
    /// Exactly one minute spoken.
    public let minute: String
    public let quiet: String

    public static let desktop = RecapWords(one: "session", many: "sessions", minute: "minutes", quiet: "A quiet day: no dictations. Your hotkey misses you.")
    public static let iPhone = RecapWords(one: "take", many: "takes", minute: "minute", quiet: "A quiet day: no dictations. The pill misses you.")
}

public enum Recap {
    /// The notification's sentence. The time back clause joins once the day
    /// has at least a minute back, so a quiet day keeps its sentence.
    public static func body(_ day: RecapSummary, words: RecapWords = .iPhone, locale: Locale = .current) -> String {
        guard day.sessions > 0 else { return words.quiet }
        let noun = day.sessions == 1 ? words.one : words.many
        let minutes = day.minutes == 1 ? words.minute : "minutes"
        let base = "\(day.sessions) \(noun), \(number(day.minutes)) \(minutes), \(day.words.formatted(.number.locale(locale))) words today."
        return day.minutesBack >= 1 ? "\(base) \(TimeBack.formatWords(day.minutesBack)) back." : base
    }

    /// A number as JavaScript writes it: whole numbers without a point,
    /// others in their shortest form.
    public static func number(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : "\(value)"
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 144 tests pass (1 known issue on purpose).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/TimeBack.swift ios/MurmurCore/Sources/MurmurCore/Recap.swift ios/MurmurCore/Sources/MurmurCore/Analytics.swift ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift
git commit -m "IOS-022: MurmurCore counts the numbers, time back, and the recap as desktop does, on every shared case"
```

### Task 4: Your numbers, Back today, and the recap on iPhone

**Files:**
- Create `ios/App/Numbers/Numbers.swift`, `ios/App/Numbers/NumbersScreen.swift`, and `ios/App/Numbers/TimeBackScreen.swift`.
- Modify `ios/Web/journey.ts`, `ios/App/Journey/JourneyPainter.swift`, `ios/App/Home/HomeScreen.swift`, `ios/App/Home/SettingsScreen.swift`, `ios/App/History/History.swift`, and `ios/App/ContentView.swift`.
- Test `ios/AppTests/NumbersTests.swift`.

**Interfaces:**
- Consumes Task 1's `analyticsPaint.ts` and Task 3's MurmurCore types.
- Produces:
  - the page's `dabs`, `wall`, `legend`, and `stroke` pictures;
  - `JourneyArtwork.dabs(days:width:)`, `.wall(days:)`, `.legend`, and `.stroke(share:day:width:)`, plus `HeatDay.fields`;
  - `NumbersSettings` (`load`, `save`; 36 words a minute, recap off at 17:30);
  - `NumbersRules` (`live`, `models`);
  - `Numbers` (`usage`, `summary`, `money`, `prettyDay`);
  - `RecapPlan` (`plan`, `prefix`, `days`) and `RecapNotifications` (`apply`, `refresh`, `ask`, `sendNow`);
  - `NumbersCopy`;
  - the views `NumbersRoute`, `NumbersScreen`, `Stat`, `WallStrip` (`pad`, `months`), `BackToday`, and `TimeBackScreen`.

- [ ] **Step 1: Write the failing test**

`ios/AppTests/NumbersTests.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// Your numbers, time back, and the recap (IOS-022).
@MainActor @Suite(.serialized) struct NumbersTests {
    /// UTC days, so no clock change or midnight moves a take.
    static let utc: Calendar = {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc
    }()

    func scratch() throws -> UserDefaults {
        try #require(UserDefaults(suiteName: "murmur.numbers.\(UUID().uuidString)"))
    }

    func rules() throws -> NumbersRules {
        try #require(NumbersRules.live)
    }

    /// A take at `at`, `words` words long, spoken for `seconds`.
    func take(_ at: Date, words: Int, seconds: Int) -> HistoryEntry {
        HistoryEntry(at: at, durationMs: seconds * 1000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: Self.utc)
    }

    /// Noon in UTC, `days` days from today.
    func noon(_ days: Int) -> Date {
        let today = Self.utc.date(bySettingHour: 12, minute: 0, second: 0, of: .now) ?? .now
        return today.addingTimeInterval(Double(days) * 86_400)
    }

    @Test func theSettingsKeepTheirChoices() throws {
        let defaults = try scratch()
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 36, recapOn: false, recapHour: 17, recapMinute: 30))
        NumbersSettings(typingWpm: 52, recapOn: true, recapHour: 21, recapMinute: 5).save(defaults)
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 52, recapOn: true, recapHour: 21, recapMinute: 5))
        defaults.set(0.0, forKey: NumbersSettings.wpmKey)
        defaults.set(30, forKey: NumbersSettings.hourKey)
        defaults.set(-4, forKey: NumbersSettings.minuteKey)
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 10, recapOn: true, recapHour: 17, recapMinute: 30))
    }

    /// Time back counts against thumbs: 100 words in a minute at 36 words a
    /// minute is 1.8 minutes back, where desktop's 40 gives 1.5.
    @Test func timeBackCountsThumbs() throws {
        let defaults = try scratch()
        let today = HistoryEntry.dayKey(noon(0), calendar: Self.utc)
        let entries = [take(noon(0), words: 100, seconds: 60)]
        let thumbs = Numbers.summary(entries, rules: try rules(), settings: .load(defaults), today: today, defaults: defaults)
        #expect(thumbs.today.minutesBack == 1.8)
        var desk = NumbersSettings.load(defaults)
        desk.typingWpm = 40
        #expect(Numbers.summary(entries, rules: try rules(), settings: desk, today: today, defaults: defaults).today.minutesBack == 1.5)
    }

    /// The numbers screen's month, lifetime, and fourteen days, priced at the
    /// models the takes ran through.
    @Test func theSummaryIsTheTakes() throws {
        let defaults = try scratch()
        let today = HistoryEntry.dayKey(noon(0), calendar: Self.utc)
        let entries = [take(noon(0), words: 300, seconds: 90), take(noon(-1), words: 120, seconds: 40), take(noon(-20), words: 900, seconds: 200)]
        let summary = Numbers.summary(entries, rules: try rules(), settings: .load(defaults), today: today, defaults: defaults)
        #expect(summary.lifetime.sessions == 3 && summary.lifetime.words == 1320)
        #expect(summary.today.sessions == 1 && summary.today.words == 300)
        #expect(summary.days.count == 14 && summary.days.last?.day == today)
        #expect(summary.days.map(\.words).reduce(0, +) == 420)
        #expect(summary.lifetime.estCostUsd > 0)
        #expect(summary.typicalBack == nil)
    }

    /// The recap lays down the coming week at the time picked: today's with
    /// today's takes so far, the rest quiet until their takes land, nothing
    /// before now, and nothing at all when it is off.
    @Test func theRecapPlansTheWeek() throws {
        let defaults = try scratch()
        let entries = [take(noon(0), words: 1240, seconds: 300)]
        let on = NumbersSettings(typingWpm: 36, recapOn: true, recapHour: 17, recapMinute: 30)
        let morning = Self.utc.date(bySettingHour: 9, minute: 0, second: 0, of: noon(0)) ?? .now
        let plan = RecapPlan.plan(entries, rules: try rules(), settings: on, now: morning, calendar: Self.utc, locale: Locale(identifier: "en_US"), defaults: defaults)
        let today = HistoryEntry.dayKey(morning, calendar: Self.utc)
        #expect(plan.items.count == 7)
        #expect(plan.items.first?.day == today && plan.items.first?.id == RecapPlan.prefix + today)
        #expect(plan.items.first?.body == "1 take, 5 minutes, 1,240 words today. 29 minutes back.")
        #expect(plan.items.dropFirst().allSatisfy { $0.body == RecapWords.iPhone.quiet })
        #expect(plan.items.first?.fire.hour == 17 && plan.items.first?.fire.minute == 30)
        let evening = Self.utc.date(bySettingHour: 18, minute: 0, second: 0, of: noon(0)) ?? .now
        let later = RecapPlan.plan(entries, rules: try rules(), settings: on, now: evening, calendar: Self.utc, defaults: defaults)
        #expect(later.items.count == 6 && later.items.first?.day == Paintings.shiftDay(today, 1))
        var off = on
        off.recapOn = false
        #expect(RecapPlan.plan(entries, rules: try rules(), settings: off, now: morning, calendar: Self.utc, defaults: defaults).items.isEmpty)
    }

    /// The page paints the dabs, the wall, its legend, and the stroke at
    /// desktop's sizes, and none of them blank.
    @Test func theMarksArePainted() async throws {
        let painter = try await JourneyPainter.started()
        let days = (0..<14).map { HeatDay(day: Paintings.shiftDay("2026-10-13", $0 - 13), words: $0 % 4 == 0 ? 0 : 50 + $0 * 40) }
        let dabs = try await painter.picture(.dabs(days: days, width: 320), scale: 2).image
        #expect(dabs.size == CGSize(width: 320, height: 76))
        let wallDays = (0..<365).map { HeatDay(day: Paintings.shiftDay("2026-10-13", $0 - 364), words: $0 % 3 == 0 ? $0 * 7 : 0) }
        let wall = try await painter.picture(.wall(days: wallDays), scale: 2).image
        let pad = WallStrip.pad(wallDays.first?.day)
        let columns = (wallDays.count + pad + 6) / 7
        #expect(wall.size == CGSize(width: Double(columns) * 14 - 3 + 4, height: 7 * 14 - 3 + 4))
        let legend = try await painter.picture(.legend, scale: 2).image
        #expect(legend.size == CGSize(width: 5 * 14 - 3 + 4, height: 11 + 4))
        let stroke = try await painter.picture(.stroke(share: 0.6, day: "2026-10-13", width: 300), scale: 2).image
        #expect(stroke.size == CGSize(width: 300, height: 24))
        for image in [dabs, wall, legend, stroke] {
            #expect(PaintingDifference.bytes(image).enumerated().contains { $0.offset % 4 == 3 && $0.element > 40 })
        }
    }

    /// The wall's weeks start on Sunday, and each month's name sits over the
    /// week holding its first day, as on desktop.
    @Test func theWallIsLaidOutAsDesktops() {
        #expect(WallStrip.pad("2026-10-11") == 0)
        #expect(WallStrip.pad("2026-10-13") == 2)
        let wall = Heatmap(days: (0..<40).map { HeatDay(day: Paintings.shiftDay("2026-09-20", $0), words: 0) }, totalWords: 0, years: [2026], year: nil)
        let months = WallStrip.months(wall, pad: WallStrip.pad("2026-09-20"))
        #expect(months.map(\.name) == ["Oct"] && months.first?.column == 1)
    }

    @Test func theWordsAreDesktops() throws {
        #expect(Recap.body(RecapSummary(sessions: 0, words: 0, minutes: 0, minutesBack: 0)) == "A quiet day: no dictations. The pill misses you.")
        #expect(Recap.body(RecapSummary(sessions: 2, words: 300, minutes: 2.5, minutesBack: 0.6), locale: Locale(identifier: "en_US")) == "2 takes, 2.5 minutes, 300 words today.")
        #expect(Recap.body(RecapSummary(sessions: 1, words: 100, minutes: 1, minutesBack: 1.8), locale: Locale(identifier: "en_US")) == "1 take, 1 minute, 100 words today. 2 minutes back.")
        let none = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: UsageTotals(), days: [], typicalBack: nil)
        #expect(NumbersCopy.typical(none) == NumbersCopy.noTypical)
        let zero = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: UsageTotals(), days: [], typicalBack: 0)
        #expect(NumbersCopy.typical(zero) == NumbersCopy.zeroTypical)
        var today = UsageTotals()
        today.minutesBack = 20.5
        let half = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: today, days: [], typicalBack: 41)
        #expect(NumbersCopy.typical(half) == "50% of your typical day (41 min)")
        #expect(Numbers.money(0) == "$0.00" && Numbers.money(0.004) == "<$0.01" && Numbers.money(1.234) == "$1.23")
        let wall = Heatmap(days: [HeatDay(day: "2026-10-01", words: 90), HeatDay(day: "2026-10-02", words: 90)], totalWords: 180, years: [2026], year: nil)
        #expect(NumbersCopy.wallLabel(wall) == "Activity wall: 180 words lifetime, on 2 days; the busiest was Oct 1 with 90 words")
        for line in [NumbersCopy.typingFooter, NumbersCopy.recapFooter, NumbersCopy.denied, NumbersCopy.noTypical, NumbersCopy.zeroTypical, NumbersCopy.ratesNote("2026-10-01"), NumbersCopy.wallNote, NumbersCopy.emptyLine] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app's tests fail to build: `cannot find 'NumbersRules' in scope`.

- [ ] **Step 3: The page paints the marks**

In `ios/Web/journey.ts`, the header comment gains its last sentence, `tokenColor` joins the brush import, the marks' import follows the card's, the four requests join `PictureRequest` (with `DayWords`, the wall's color, and its Sunday padding after it), and their cases follow the share card's:

```ts
// share card (IOS-021) is desktop's too (settings/cardPaint.ts): the last
// thirty days as strokes, the rank in the display face. So are the numbers'
// marks (IOS-022, settings/analyticsPaint.ts): the fourteen days as dabs,
// the activity wall as blots, and Home's gold stroke for today.
```

```ts
import { animateScene, paintScene, type Surface, tokenColor } from '../../src/renderer/brush'
```

```ts
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
```

```ts
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
```

```ts
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
```

In `ios/App/Journey/JourneyPainter.swift`, `JourneyArtwork` gains the marks after `.share`, their fields after the share card's, and the days' fields before `extension PaintingRecord`:

```swift
    /// The fourteen days as brush dabs, 76 points high (IOS-022).
    case dabs(days: [HeatDay], width: Double)
    /// The activity wall as blots, a column a week, Sunday on top.
    case wall(days: [HeatDay])
    /// The wall's five levels, from none to most.
    case legend
    /// Home's gold stroke for today against a typical day, 24 points high.
    case stroke(share: Double, day: String, width: Double)
```

```swift
        case let .dabs(days, width):
            return ["kind": "dabs", "days": days.map(\.fields), "width": width]
        case let .wall(days):
            return ["kind": "wall", "days": days.map(\.fields)]
        case .legend:
            return ["kind": "legend"]
        case let .stroke(share, day, width):
            return ["kind": "stroke", "share": share, "day": day, "width": width]
```

```swift
extension HeatDay {
    /// The day as the page reads it.
    var fields: [String: Any] { ["day": day, "words": words] }
}
```

- [ ] **Step 4: Build the numbers, the screens, and the recap**

`ios/App/Numbers/Numbers.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Your numbers (ios/prd.json IOS-022): desktop's analytics, time back, and
// recap over this iPhone's takes (MurmurCore's Analytics, TimeBack, and
// Recap, held to desktop by shared/analytics-vectors.json). Time back is
// counted against typing with your thumbs. The daily recap is one local
// notification at the time you pick, off until you turn it on.
import Foundation
import MurmurCore
import UserNotifications

/// Time back and recap choices, kept on this iPhone.
struct NumbersSettings: Equatable {
    static let wpmKey = "numbers.typingWpm"
    static let recapKey = "numbers.recap"
    static let hourKey = "numbers.recapHour"
    static let minuteKey = "numbers.recapMinute"

    /// Words a minute your thumbs type, clamped to 10 through 200.
    var typingWpm: Double
    var recapOn: Bool
    /// When the recap arrives, desktop's 17:30 until you pick.
    var recapHour: Int
    var recapMinute: Int

    static func load(_ defaults: UserDefaults = .standard) -> NumbersSettings {
        let wpm = defaults.object(forKey: wpmKey) as? Double
        let hour = defaults.object(forKey: hourKey) as? Int ?? 17
        let minute = defaults.object(forKey: minuteKey) as? Int ?? 30
        return NumbersSettings(
            typingWpm: TimeBack.clamp(wpm),
            recapOn: defaults.bool(forKey: recapKey),
            recapHour: (0...23).contains(hour) ? hour : 17,
            recapMinute: (0...59).contains(minute) ? minute : 30
        )
    }

    func save(_ defaults: UserDefaults = .standard) {
        defaults.set(TimeBack.clamp(typingWpm), forKey: Self.wpmKey)
        defaults.set(recapOn, forKey: Self.recapKey)
        defaults.set(recapHour, forKey: Self.hourKey)
        defaults.set(recapMinute, forKey: Self.minuteKey)
    }
}

/// What the numbers are priced and dated with, read once from the bundle.
struct NumbersRules: Sendable {
    let catalog: ProviderCatalog
    let rates: Rates

    static let live: NumbersRules? = (try? BundledRules.catalog()).map { NumbersRules(catalog: $0, rates: Rates($0)) }

    /// The models your takes ran through: the estimate prices those.
    func models(_ defaults: UserDefaults = .standard) -> (stt: String, llm: String) {
        let connection = ConnectionStore(defaults: defaults).load(catalog: catalog)
        return (connection.transcription.sttModel, connection.cleanupModel)
    }
}

enum Numbers {
    /// The takes as the numbers see them, each on the day it stored.
    static func usage(_ entries: [HistoryEntry]) -> [UsageEvent] {
        entries.map { entry in
            UsageEvent(day: entry.rankEvent.day, words: entry.wordCount, durationMs: entry.durationMs)
        }
    }

    /// Everything the numbers screen, Home, and the recap show, as of `today`.
    static func summary(_ entries: [HistoryEntry], rules: NumbersRules, settings: NumbersSettings, today: String = HistoryEntry.dayKey(.now), defaults: UserDefaults = .standard) -> AnalyticsSummary {
        let models = rules.models(defaults)
        return Analytics.aggregate(usage(entries), rates: rules.rates, today: today, sttModel: models.stt, llmModel: models.llm, typingWpm: settings.typingWpm)
    }

    /// Desktop's money: under a cent reads as under a cent.
    static func money(_ usd: Double) -> String {
        if usd > 0, usd < 0.01 { return "<$0.01" }
        return String(format: "$%.2f", usd)
    }

    /// "Oct 3", for a day key.
    static func prettyDay(_ day: String) -> String {
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let month = Int(day.dropFirst(5).prefix(2)) ?? 1
        let date = Int(day.suffix(2)) ?? 1
        return "\(months[max(0, min(11, month - 1))]) \(date)"
    }
}

/// The recap's pending notifications: one for each of the next days at the
/// recap time, today's with today's numbers so far and the rest quiet until
/// their takes land. Every take, every return to murmur, and every change of
/// setting plans them again, so a recap always says the day as it stood at
/// the last take, and a week away still gets its quiet recaps.
struct RecapPlan: Equatable {
    struct Item: Equatable {
        /// The request's id: the prefix and the day.
        let id: String
        let day: String
        let fire: DateComponents
        let body: String
    }

    static let prefix = "murmur.recap."
    /// How many days ahead are kept pending.
    static let days = 7

    let items: [Item]

    /// The plan for these takes at `now`, or nothing with the recap off.
    static func plan(_ entries: [HistoryEntry], rules: NumbersRules, settings: NumbersSettings, now: Date = .now, calendar: Calendar = .current, locale: Locale = .current, defaults: UserDefaults = .standard) -> RecapPlan {
        guard settings.recapOn else { return RecapPlan(items: []) }
        let today = HistoryEntry.dayKey(now, calendar: calendar)
        let summary = Numbers.summary(entries, rules: rules, settings: settings, today: today, defaults: defaults)
        var items: [Item] = []
        for offset in 0..<days {
            let day = Paintings.shiftDay(today, offset)
            let parts = day.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { continue }
            let fire = DateComponents(calendar: calendar, timeZone: calendar.timeZone, year: parts[0], month: parts[1], day: parts[2], hour: settings.recapHour, minute: settings.recapMinute)
            guard let at = calendar.date(from: fire), at > now else { continue }
            let body = offset == 0 ? Recap.body(RecapSummary(summary.today), locale: locale) : RecapWords.iPhone.quiet
            items.append(Item(id: prefix + day, day: day, fire: fire, body: body))
        }
        return RecapPlan(items: items)
    }
}

/// The notifications themselves, through the system's notification center.
@MainActor enum RecapNotifications {
    static let title = "murmur recap"

    /// Lays the plan down: every pending recap replaced, none with the recap off.
    static func apply(_ plan: RecapPlan, center: UNUserNotificationCenter = .current()) async {
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(RecapPlan.prefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard !plan.items.isEmpty else { return }
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        for item in plan.items {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = item.body
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: item.fire, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: item.id, content: content, trigger: trigger))
        }
    }

    /// Plans the recap again from the takes kept now.
    static func refresh(_ entries: [HistoryEntry]) async {
        guard let rules = NumbersRules.live else { return }
        await apply(RecapPlan.plan(entries, rules: rules, settings: .load()))
    }

    /// Asks once, when the recap is turned on: true when it may arrive.
    static func ask(center: UNUserNotificationCenter = .current()) async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    /// Today's recap, two seconds from now, to see how it reads.
    static func sendNow(_ entries: [HistoryEntry], center: UNUserNotificationCenter = .current()) async {
        guard let rules = NumbersRules.live else { return }
        let summary = Numbers.summary(entries, rules: rules, settings: .load())
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = Recap.body(RecapSummary(summary.today))
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: RecapPlan.prefix + "now", content: content, trigger: trigger))
    }
}

/// The numbers' words.
enum NumbersCopy {
    static let title = "Your numbers"
    static let row = "Your numbers"
    static let emptyTitle = "No numbers yet."
    static let emptyLine = "Your words, minutes, and time back count from your first dictation."
    static let thisMonth = "This month"
    static let lastDays = "Last 14 days"
    static let wall = "Getting active"
    static let lifetime = "Lifetime"
    static let minutesDictated = "Minutes dictated"
    static let minutes = "Minutes"
    static let words = "Words"
    static let takes = "Takes"
    static let timeBack = "Time back"
    static let cost = "Est. cost"
    static let avgWpm = "Avg wpm"
    static let less = "less"
    static let more = "more"
    static let wallNote = "Every mark is a day; deeper paint is more words. Show up and the wall fills."

    /// The estimate's footnote, with the date murmur's rates were checked.
    static func ratesNote(_ checked: String) -> String {
        "Estimates at the rates murmur knows for your models (checked \(checked)), assuming the cleanup pass runs. Your provider bills you directly; murmur never sees it."
    }

    static func wallTotal(_ words: Int) -> String {
        "\(words.formatted(.number)) words lifetime"
    }

    /// What VoiceOver reads for the fourteen days.
    static func chartLabel(_ days: [DayUsage]) -> String {
        "Words per day, last 14 days: " + days.map { "\(Numbers.prettyDay($0.day)), \($0.words.formatted(.number))" }.joined(separator: "; ")
    }

    /// What VoiceOver reads for the wall.
    static func wallLabel(_ wall: Heatmap) -> String {
        let active = wall.days.filter { $0.words > 0 }
        guard let busiest = active.max(by: { $0.words < $1.words || ($0.words == $1.words && $0.day > $1.day) }) else {
            return "Activity wall: no dictation lifetime yet"
        }
        return "Activity wall: \(wall.totalWords.formatted(.number)) words lifetime, on \(active.count.formatted(.number)) days; the busiest was \(Numbers.prettyDay(busiest.day)) with \(busiest.words.formatted(.number)) words"
    }

    // Home.
    static let backToday = "Back today"
    static let noTypical = "Today is measured against your typical day once you have \(Analytics.typicalMinDays) days of dictation in the last four weeks, not counting today."
    static let zeroTypical = "Your typical day has no time back yet, so today stands on its own."

    static func spans(month: Double, lifetime: Double) -> String {
        "\(TimeBack.format(month)) this month · \(TimeBack.format(lifetime)) lifetime"
    }

    /// The line under today's time back.
    static func typical(_ summary: AnalyticsSummary) -> String {
        guard let typical = summary.typicalBack else { return noTypical }
        guard typical > 0 else { return zeroTypical }
        return TimeBack.typicalLine(share: Analytics.typicalShare(today: summary.today.minutesBack, typical: typical), typical: typical)
    }

    // Settings.
    static let screen = "Time back and recap"
    static let typing = "Typing speed"
    static func wpm(_ value: Double) -> String { "\(Int(value)) words a minute" }
    static let typingFooter = "Time back counts the minutes you would have spent typing your words with your thumbs, minus the time you spent speaking. 36 words a minute is the average on a phone across 37,370 people (Palin and others, MobileHCI 2019, checked 2026-10-13). Set your own speed if you type faster or slower; every day is counted again at the new speed."
    static let recap = "Daily recap"
    static let recapTime = "Time"
    static let recapFooter = "One notification a day at the time you pick: the day's takes, minutes, words, and time back. Off until you turn it on; murmur asks to send notifications only then."
    static let denied = "Notifications are off for murmur, so the recap cannot arrive. Turn them on in Settings."
    static let openSettings = "Open Settings"
    static let sendNow = "Send one now"
}
```

`ios/App/Numbers/NumbersScreen.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Your numbers (ios/prd.json IOS-022): this month, the last fourteen days as
// brush dabs, the activity wall as blots, and the lifetime, the numbers
// desktop's math gives and the marks desktop's paint makes; Home's Back
// today with its one gold stroke for today against a typical day.
import MurmurCore
import SwiftUI
import UIKit

/// Your numbers, made as the screen opens: a link's destination is made
/// whenever Home draws.
struct NumbersRoute: View {
    let history: History

    var body: some View {
        if let rules = NumbersRules.live {
            NumbersScreen(history: history, rules: rules)
        } else {
            Tokens.ink.ignoresSafeArea()
        }
    }
}

struct NumbersScreen: View {
    let history: History
    let rules: NumbersRules
    @Environment(\.displayScale) private var scale
    @State private var settings = NumbersSettings.load()
    @State private var width: Double = 0
    @State private var dabs: UIImage?
    @State private var wallImage: UIImage?
    @State private var legend: UIImage?

    private let stats = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]

    var body: some View {
        let summary = Numbers.summary(history.entries, rules: rules, settings: settings)
        let wall = Analytics.heatmap(Numbers.usage(history.entries), today: HistoryEntry.dayKey(.now), year: nil)
        List {
            if history.entries.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 14) {
                        DryMark()
                            .frame(width: 120, height: 30)
                            .accessibilityHidden(true)
                        Text(NumbersCopy.emptyTitle).font(.headline)
                        Text(NumbersCopy.emptyLine).foregroundStyle(Tokens.textDim)
                    }
                    .padding(.vertical, 12)
                }
                .listRowBackground(Tokens.panel)
            } else {
                Section {
                    LazyVGrid(columns: stats, alignment: .leading, spacing: 16) {
                        Stat(label: NumbersCopy.minutesDictated, value: Recap.number(summary.month.minutes))
                        Stat(label: NumbersCopy.words, value: summary.month.words.formatted(.number))
                        Stat(label: NumbersCopy.takes, value: summary.month.sessions.formatted(.number))
                        Stat(label: NumbersCopy.timeBack, value: TimeBack.format(summary.month.minutesBack))
                        Stat(label: NumbersCopy.cost, value: Numbers.money(summary.month.estCostUsd))
                    }
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.thisMonth)
                } footer: {
                    Text(NumbersCopy.ratesNote(rules.catalog.verifiedOn)).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)

                Section {
                    VStack(spacing: 4) {
                        Group {
                            if let dabs {
                                Image(uiImage: dabs).resizable()
                            } else {
                                Color.clear
                            }
                        }
                        .frame(height: 76)
                        HStack(spacing: 0) {
                            ForEach(summary.days, id: \.day) { day in
                                Text(String(day.day.suffix(2)))
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(Tokens.textDim)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(NumbersCopy.chartLabel(summary.days))
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.lastDays)
                }
                .listRowBackground(Tokens.panel)
                .task(id: DabsKey(days: summary.days.map { HeatDay(day: $0.day, words: $0.words) }, width: width, scale: scale)) {
                    guard width > 0 else { return }
                    let days = summary.days.map { HeatDay(day: $0.day, words: $0.words) }
                    dabs = try? await JourneyPainter.shared.picture(.dabs(days: days, width: width), scale: scale).image
                }

                Section {
                    Text(NumbersCopy.wallTotal(wall.totalWords))
                        .font(.subheadline)
                    WallStrip(wall: wall, image: wallImage)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(NumbersCopy.wallLabel(wall))
                    HStack(spacing: 8) {
                        Text(NumbersCopy.less)
                        Group {
                            if let legend { Image(uiImage: legend) } else { Color.clear.frame(width: 70, height: 15) }
                        }
                        Text(NumbersCopy.more)
                    }
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Tokens.textDim)
                    .accessibilityHidden(true)
                } header: {
                    SectionTitle(NumbersCopy.wall)
                } footer: {
                    Text(NumbersCopy.wallNote).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
                .task(id: WallKey(days: wall.days, scale: scale)) {
                    wallImage = try? await JourneyPainter.shared.picture(.wall(days: wall.days), scale: scale).image
                    if legend == nil {
                        legend = try? await JourneyPainter.shared.picture(.legend, scale: scale).image
                    }
                }

                Section {
                    LazyVGrid(columns: stats, alignment: .leading, spacing: 16) {
                        Stat(label: NumbersCopy.minutes, value: Recap.number(summary.lifetime.minutes))
                        Stat(label: NumbersCopy.words, value: summary.lifetime.words.formatted(.number))
                        Stat(label: NumbersCopy.takes, value: summary.lifetime.sessions.formatted(.number))
                        Stat(label: NumbersCopy.avgWpm, value: summary.lifetime.avgWpm.formatted(.number))
                        Stat(label: NumbersCopy.timeBack, value: TimeBack.format(summary.lifetime.minutesBack))
                        Stat(label: NumbersCopy.cost, value: Numbers.money(summary.lifetime.estCostUsd))
                    }
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.lifetime)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NumbersCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { settings = NumbersSettings.load() }
    }

    private struct DabsKey: Hashable {
        let days: [HeatDay]
        let width: Double
        let scale: CGFloat
    }

    private struct WallKey: Hashable {
        let days: [HeatDay]
        let scale: CGFloat
    }
}

/// One number and its label.
struct Stat: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.title3.weight(.semibold).monospacedDigit())
            Text(label)
                .font(.footnote)
                .foregroundStyle(Tokens.textDim)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The wall, scrolled to today, with its month and day names, as desktop
/// lays them out: Sunday on top, a column a week.
struct WallStrip: View {
    let wall: Heatmap
    let image: UIImage?

    /// Desktop's cell step and bleed (settings/analyticsPaint.ts).
    static let step = 14.0
    static let bleed = 2.0

    var body: some View {
        let pad = Self.pad(wall.days.first?.day)
        let columns = (wall.days.count + pad + 6) / 7
        let width = Double(columns) * Self.step - 3 + 2 * Self.bleed
        let height = 7 * Self.step - 3 + 2 * Self.bleed
        HStack(alignment: .top, spacing: 6) {
            VStack(alignment: .trailing, spacing: 0) {
                Color.clear.frame(width: 0, height: 14)
                ForEach(0..<7, id: \.self) { row in
                    Text(row == 1 ? "mon" : row == 3 ? "wed" : row == 5 ? "fri" : "")
                        .frame(height: Self.step)
                }
            }
            .font(.system(.caption2, design: .monospaced))
            .foregroundStyle(Tokens.textDim)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        ZStack(alignment: .topLeading) {
                            Color.clear.frame(width: width, height: 14)
                            ForEach(Self.months(wall, pad: pad), id: \.column) { label in
                                Text(label.name)
                                    .offset(x: Self.bleed + Double(label.column) * Self.step)
                            }
                        }
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(Tokens.textDim)
                        Group {
                            if let image {
                                Image(uiImage: image)
                            } else {
                                Color.clear
                            }
                        }
                        .frame(width: width, height: height)
                        .id("today")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .onAppear { proxy.scrollTo("today", anchor: .trailing) }
                .onChange(of: image == nil) { proxy.scrollTo("today", anchor: .trailing) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Blank cells before the first day, so weeks start on Sunday.
    static func pad(_ first: String?) -> Int {
        guard let first else { return 0 }
        let parts = first.split(separator: "-").compactMap { Int($0) }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        guard parts.count == 3, let date = gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return 0 }
        return gregorian.component(.weekday, from: date) - 1
    }

    /// A month's name over the week holding its first day, as desktop does.
    static func months(_ wall: Heatmap, pad: Int) -> [(column: Int, name: String)] {
        wall.days.enumerated().compactMap { index, day in
            guard day.day.hasSuffix("-01") else { return nil }
            let name = Numbers.prettyDay(day.day).split(separator: " ").first.map(String.init) ?? ""
            return ((index + pad) / 7, name)
        }
    }
}

/// Home's Back today: today's time back, the gold stroke for it against a
/// typical day, and the month and lifetime, as desktop's Home shows them.
struct BackToday: View {
    let history: History
    let rules: NumbersRules
    @Environment(\.displayScale) private var scale
    @State private var width: Double = 0
    @State private var stroke: UIImage?

    var body: some View {
        let settings = NumbersSettings.load()
        let summary = Numbers.summary(history.entries, rules: rules, settings: settings)
        let today = HistoryEntry.dayKey(.now)
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text(TimeBack.format(summary.today.minutesBack))
                    .font(.largeTitle.weight(.semibold).monospacedDigit())
                if let typical = summary.typicalBack {
                    Group {
                        if let stroke { Image(uiImage: stroke).resizable() } else { Color.clear }
                    }
                    .frame(height: 24)
                    .frame(maxWidth: .infinity)
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    .accessibilityHidden(true)
                    .task(id: StrokeKey(share: Analytics.typicalShare(today: summary.today.minutesBack, typical: typical), day: today, width: width, scale: scale)) {
                        guard width > 0 else { return }
                        let share = Analytics.typicalShare(today: summary.today.minutesBack, typical: typical)
                        stroke = try? await JourneyPainter.shared.picture(.stroke(share: share, day: today, width: width), scale: scale).image
                    }
                }
                Text(NumbersCopy.typical(summary))
                    .foregroundStyle(Tokens.textDim)
                Text(NumbersCopy.spans(month: summary.month.minutesBack, lifetime: summary.lifetime.minutesBack))
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
            }
            .padding(.vertical, 6)
            .accessibilityElement(children: .combine)
            NavigationLink {
                NumbersRoute(history: history)
            } label: {
                Text(NumbersCopy.row)
                    .foregroundStyle(Tokens.brand)
                    .frame(minHeight: 44)
            }
        } header: {
            SectionTitle(NumbersCopy.backToday)
        }
        .listRowBackground(Tokens.panel)
    }

    private struct StrokeKey: Hashable {
        let share: Double
        let day: String
        let width: Double
        let scale: CGFloat
    }
}
```

`ios/App/Numbers/TimeBackScreen.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Time back and recap (ios/prd.json IOS-022): your thumb typing speed, which
// time back is counted against, and the daily recap, off until you turn it
// on. Turning it on is the only moment murmur asks to send notifications.
import MurmurCore
import SwiftUI
import UIKit
import UserNotifications

struct TimeBackScreen: View {
    let history: History
    @State private var settings = NumbersSettings.load()
    @State private var time = Date.now
    @State private var denied = false
    @State private var asking = false
    /// Set while a refusal turns the switch back off, so that change is
    /// not taken as you turning it off.
    @State private var reverting = false

    var body: some View {
        Form {
            Section {
                Stepper(value: $settings.typingWpm, in: TimeBack.minWpm...TimeBack.maxWpm, step: 1) {
                    Text(NumbersCopy.wpm(settings.typingWpm))
                }
            } header: {
                SectionTitle(NumbersCopy.typing)
            } footer: {
                Text(NumbersCopy.typingFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Toggle(NumbersCopy.recap, isOn: $settings.recapOn)
                    .tint(Tokens.brand)
                    .disabled(asking)
                if settings.recapOn {
                    DatePicker(NumbersCopy.recapTime, selection: $time, displayedComponents: .hourAndMinute)
                    Button(NumbersCopy.sendNow) {
                        Task { await RecapNotifications.sendNow(history.entries) }
                    }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
                }
                if denied {
                    Text(NumbersCopy.denied)
                        .foregroundStyle(Tokens.textDim)
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        Link(NumbersCopy.openSettings, destination: url)
                            .buttonStyle(RowAction())
                            .frame(minHeight: 44)
                    }
                }
            } header: {
                SectionTitle(NumbersCopy.recap)
            } footer: {
                Text(NumbersCopy.recapFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NumbersCopy.screen)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            settings = NumbersSettings.load()
            time = Self.date(hour: settings.recapHour, minute: settings.recapMinute)
        }
        .task {
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            denied = settings.recapOn && status == .denied
        }
        .onChange(of: settings.typingWpm) {
            settings.save()
            replan()
        }
        .onChange(of: time) {
            let parts = Calendar.current.dateComponents([.hour, .minute], from: time)
            settings.recapHour = parts.hour ?? 17
            settings.recapMinute = parts.minute ?? 30
            settings.save()
            replan()
        }
        .onChange(of: settings.recapOn) { _, on in
            guard !reverting else {
                reverting = false
                return
            }
            Task { await turned(on) }
        }
    }

    /// Turning the recap on asks once; refused, it stays off and says where
    /// to turn notifications on.
    private func turned(_ on: Bool) async {
        if on {
            asking = true
            let allowed = await RecapNotifications.ask()
            asking = false
            denied = !allowed
            if !allowed {
                reverting = true
                settings.recapOn = false
            }
        } else {
            denied = false
        }
        settings.save()
        replan()
    }

    private func replan() {
        let entries = history.entries
        Task { await RecapNotifications.refresh(entries) }
    }

    static func date(hour: Int, minute: Int) -> Date {
        Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: .now) ?? .now
    }
}
```

- [ ] **Step 5: Wire them in**

In `ios/App/Home/HomeScreen.swift`, the header comment, the numbers' rules, and Back today before the painting and Journey section:

```swift
// Journey row shows the belt this iPhone's takes have earned (IOS-017),
// the painting row today's painting (IOS-019), and Back today the time
// back today against a typical day, with the way to your numbers (IOS-022).
```

```swift
    /// The rates and catalog the numbers use; nil only if the app's own files could not be read.
    var numbers: NumbersRules? = NumbersRules.live
```

```swift
            if let numbers, !history.entries.isEmpty {
                BackToday(history: history, rules: numbers)
            }
```

In `ios/App/Home/SettingsScreen.swift`, after Look:

```swift
                NavigationLink(NumbersCopy.screen) { TimeBackScreen(history: History.live()) }
```

In `ios/App/History/History.swift`, `History.live()`'s hook plans the recap again after every change:

```swift
        } changed: { change in
            PaintingStore.live()?.apply(change)
            Looks.refresh(change.kept)
            // The recap says the day as it stands after this take.
            let kept = change.kept
            Task { await RecapNotifications.refresh(kept) }
        }
```

In `ios/App/ContentView.swift`, returning to murmur plans it again too:

```swift
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            setup.refresh()
            // A day or more away: the coming days' recaps are laid down again.
            let entries = history.entries
            Task { await RecapNotifications.refresh(entries) }
        }
```

- [ ] **Step 6: Run it to see it pass**

Run: `npm run ios:test`
Expected: MurmurCore 144; 342 app tests pass, `NumbersTests` among them.

- [ ] **Step 7: Run the gates and commit**

```bash
git add ios/Web/journey.ts ios/App/Journey/JourneyPainter.swift ios/App/Numbers ios/App/Home/HomeScreen.swift ios/App/Home/SettingsScreen.swift ios/App/History/History.swift ios/App/ContentView.swift ios/AppTests/NumbersTests.swift
git commit -m "IOS-022: Your numbers, Back today with its gold stroke, and the daily recap on iPhone, counted against thumbs"
```

### Task 5: The smoke, the docs, and the live check

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`, `ios/docs/iphone.md`, `HANDOFF.md`, and `ios/prd.json`.

- [ ] **Step 1: Add the smoke check**

In `SmokeRunner`'s list, after `("shareCard", checkShareCard),`:

```swift
            ("analytics", checkAnalytics),
```

Before `/// Runs main-actor work to the end from the smoke's synchronous start`:

```swift
    /// Your numbers (IOS-022): a seeded history (in UTC, so no clock change
    /// moves a take) gives the time back thumbs earn (100 words in a minute
    /// at 36 words a minute is 1.8 minutes back), a typical day once three
    /// days have takes, the month and lifetime, the wall, and a recap plan
    /// that says today's takes; the page paints the fourteen days.
    static func checkAnalytics() throws {
        if let failure = onMain({ await analyticsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func analyticsFailure() async -> String? {
        guard let rules = NumbersRules.live else { return "the catalog did not load" }
        guard let defaults = UserDefaults(suiteName: "murmur.smoke.numbers.\(UUID().uuidString)") else { return "no scratch defaults" }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let noon = utc.date(bySettingHour: 12, minute: 0, second: 0, of: .now) ?? .now
        let today = HistoryEntry.dayKey(noon, calendar: utc)
        func take(_ days: Int, _ words: Int, _ seconds: Int) -> HistoryEntry {
            HistoryEntry(at: noon.addingTimeInterval(Double(days) * 86_400), durationMs: seconds * 1000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: utc)
        }
        let entries = [take(0, 100, 60), take(-1, 360, 120), take(-2, 720, 300), take(-3, 180, 60), take(-40, 50, 10)]
        let settings = NumbersSettings.load(defaults)
        guard settings.typingWpm == TimeBack.thumbWpm else { return "the typing speed starts at \(settings.typingWpm), not \(TimeBack.thumbWpm)" }
        let summary = Numbers.summary(entries, rules: rules, settings: settings, today: today, defaults: defaults)
        guard summary.today.minutesBack == 1.8 else { return "100 words in a minute gave \(summary.today.minutesBack) minutes back, not 1.8" }
        guard summary.typicalBack == 8 else { return "the typical day is \(String(describing: summary.typicalBack)), not 8" }
        guard summary.lifetime.sessions == 5, summary.lifetime.words == 1410, summary.days.count == 14 else { return "the lifetime or the chart is off" }
        let wall = Analytics.heatmap(Numbers.usage(entries), today: today, year: nil)
        guard wall.days.last?.day == today, wall.totalWords == 1410 else { return "the wall ends on \(wall.days.last?.day ?? "nothing") with \(wall.totalWords) words" }
        var on = settings
        on.recapOn = true
        let morning = utc.date(bySettingHour: 6, minute: 0, second: 0, of: noon) ?? noon
        let plan = RecapPlan.plan(entries, rules: rules, settings: on, now: morning, calendar: utc, locale: Locale(identifier: "en_US"), defaults: defaults)
        guard plan.items.count == RecapPlan.days, plan.items.first?.body == "1 take, 1 minute, 100 words today. 2 minutes back." else {
            return "the recap plan reads \(plan.items.first?.body ?? "nothing")"
        }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        let days = summary.days.map { HeatDay(day: $0.day, words: $0.words) }
        guard let dabs = try? await painter.picture(.dabs(days: days, width: 300), scale: 2), inked(dabs.image) > 200 else { return "the page painted no dabs" }
        return nil
    }
```

- [ ] **Step 2: See it catch wrong time back, then pass**

Temporarily make `TimeBack.thumbWpm` 40. Run: `npm run ios:smoke`. Expected: `"analytics":false`, failing with `100 words in a minute gave 1.5 minutes back, not 1.8`. Restore it and run again. Expected: twenty-four true checks.

- [ ] **Step 3: Write the docs and the live check**

In `ios/docs/iphone.md`, before `## How does the painting a day work on iPhone?`:

```markdown
## How does murmur count time back on iPhone?

Time back is the time you did not spend typing: for every take, the minutes typing its words would have taken with your thumbs, minus the minutes you spoke. They add up into today, this month, and lifetime, shown on Home under Back today and in Your numbers.

The formula for one take is `words / typing speed - minutes spoken`, the same as on the Mac. On iPhone the speed is thumbs on glass: murmur starts at 36 words a minute, the average typing speed on phones across 37,370 people in the largest study of mobile typing (Palin, Feit, Kim, Kristensson, and Oulasvirta, "How do People Type on Mobile Devices?", MobileHCI 2019; checked 2026-10-13). The Mac starts at 40, for a keyboard. At 36, a 400-word take spoken in two minutes is about eleven minutes of typing minus two of speaking: about nine minutes back.

The speed is yours to set: in murmur, tap the gear, then Time back and recap, then Typing speed, anywhere from 10 to 200 words a minute. Nothing is stored per take, so a new speed counts every day again, past ones included. A take where you spoke longer than typing its words would have taken counts against the day, but a day never shows below zero.

Home also sets today against your typical day: one gold brush stroke, as long as today's time back is against the middle day of the four weeks before today, with a dotted line for the rest of a typical day. It needs three days with takes in those four weeks, and says so until then.

## What do my numbers show on iPhone?

On Home, tap Your numbers under Back today. It shows, as the Mac's analytics do and from the same math:

- **This month:** minutes dictated, words, takes, time back, and the estimated cost at the rates murmur knows for your models, assuming the cleanup pass runs. Your provider bills you directly; murmur never sees it.
- **The last 14 days** as brush dabs, one for each day, as tall as its words against your biggest day, today in gold.
- **The activity wall,** getting active: a blot for every day you dictated, deeper paint for more words, a column a week from Sunday, since your first take or a year back, whichever is earlier. Swipe it sideways for earlier months.
- **Lifetime:** minutes, words, takes, average words a minute, time back, and the estimated cost.

Your iPhone counts the takes it keeps. VoiceOver reads each number, every day of the fourteen, and the wall's total and busiest day.

## How do I get a daily recap on iPhone?

In murmur, tap the gear, then Time back and recap, and turn on Daily recap. murmur asks to send notifications only then; if you say no, the recap stays off and the screen says where to turn notifications on. Pick the time it arrives (5:30 PM until you change it). Each day at that time one notification reads your day: "4 takes, 12 minutes, 1,240 words today. 19 minutes back." A day with no takes gets a quiet one. Send one now shows how it reads right away.

The recap's words are set when your last take of the day lands, so a take after the recap time counts toward tomorrow's day only if it is tomorrow. murmur keeps the coming week's recaps ready, so they still arrive on days you do not open it. Turn Daily recap off and none arrive.
```

In `HANDOFF.md`, after the IOS-021 live check:

```markdown
- [ ] IOS-022 live check, once a TestFlight build with it is on your iPhone (added 2026-10-13). (1) Dictate a few takes, then open murmur. On Home, Back today shows how much time your takes saved you today, and under it how this month and your lifetime add up. (2) Tap Your numbers. You should see this month, a row of 14 brush dabs (today in gold), a wall of orange blots you can swipe sideways, and your lifetime, with a cost estimate. (3) Tap the gear, then Time back and recap. Typing speed should read 36 words a minute. Turn on Daily recap; iPhone asks to let murmur send notifications: allow it. Tap Send one now, leave murmur, and a "murmur recap" notification should arrive in a couple of seconds. (4) Set the time a few minutes ahead, wait, and the real recap should arrive with your day's numbers. (5) Tell Claude what you saw, and whether 36 words a minute feels right for your thumbs.
```

In `ios/prd.json`, IOS-022's `notes` say how each criterion was verified: the vectors and test counts, the smoke, the pixel-identical desktop captures, the iPhone's numbers against desktop's for the same takes, the screens, these rulings, and the live check that waits on LaBroi (`passes` stays false). Run `npm run roadmap`.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift ios/docs/iphone.md HANDOFF.md ios/prd.json ROADMAP.md
git commit -m "IOS-022: the smoke runs the numbers and time back on a seeded history; the docs answer how murmur counts time back on iPhone"
```
