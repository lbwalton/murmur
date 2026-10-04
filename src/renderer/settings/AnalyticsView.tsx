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
import { type Rgb, mix, parseColor, rgba, tokenColor } from '../brush'
import { daySeed, paintBlot, paintDab } from './inkMarks'

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

// Fill strength per heat level. Level 0 keeps the resting cell color;
// the rest mix the chosen base color over transparency so the ladder
// reads the same for any bright base. Dark bases (the black belt)
// invert instead: empty squares go light and activity darkens them,
// so the fill never vanishes into the ink.
const HEAT_PCT = [0, 20, 40, 65, 95]
const HEAT_PCT_INVERTED = [0, 35, 55, 75, 95]

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
  const [year, setYear] = useState<number | null>(null)
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
                height={Math.max(3, Math.round((day.words / maxWords) * 72))}
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
          onYear={setYear}
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

const CHART_H = 76

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
      const rgb = props.today && !props.empty ? tokenColor('--brand', [217, 164, 65]) : tokenColor('--rice', [233, 227, 214])
      const dabWidth = Math.min(props.empty ? 8 : 18, width * 0.72)
      paintDab(ctx, width / 2, CHART_H - 1, props.height, dabWidth, rgb, daySeed(props.day), props.empty ? 0.22 : 0.92)
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

const CELL = 11
const STEP = 14
/** Room around the cells for the biggest blots' ragged edges. */
const BLEED = 2

/** The color a heat level paints, on the same scale as the old squares. */
function blotColor(level: number, base: Rgb, inverted: boolean, paper: Rgb): { rgb: Rgb; alpha: number } {
  if (inverted) return { rgb: mix(paper, base, HEAT_PCT_INVERTED[level] / 100), alpha: 1 }
  return { rgb: base, alpha: HEAT_PCT[level] / 100 }
}

/**
 * The activity wall's paint (US-087): each active day a small blot in
 * the wall's color at its heat level, each empty day a faint dot (paper
 * mode keeps its white squares, painted by the cells underneath).
 * Seeded by the date, so the wall paints the same on every open.
 */
interface Mark {
  /** Seeds the blot's edge: the day it stands for. */
  seed: string
  level: number
}

function paintWall(canvas: HTMLCanvasElement, marks: ReadonlyArray<Mark | null>, rows: number, base: Rgb, inverted: boolean): void {
  const cols = Math.ceil(marks.length / rows)
  const width = Math.max(1, cols * STEP - (STEP - CELL)) + 2 * BLEED
  const height = rows * STEP - (STEP - CELL) + 2 * BLEED
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
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
  const heatLevel = (words: number): number => {
    if (words === 0) return 0
    const r = words / heatMax
    if (r > 0.75) return 4
    if (r > 0.5) return 3
    if (r > 0.25) return 2
    return 1
  }

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
    const marks = cells.map((cell) => (cell ? { seed: cell.day, level: heatLevel(cell.words) } : null))
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
