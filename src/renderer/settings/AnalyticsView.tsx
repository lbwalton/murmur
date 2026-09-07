// SPDX-License-Identifier: GPL-3.0-only
// The analytics view: monthly usage card with the live cost estimate,
// lifetime totals, a fourteen-day activity chart, and the activity
// wall. Pure presentation over computed summaries; transcripts never
// enter this view.
import { useEffect, useState } from 'react'
import type { AnalyticsSummary, HeatDay, HeatmapData } from '../../shared/analytics'
import type { CosmeticsReport } from '../../shared/cosmetics'
import type { Settings } from '../../shared/settings'
import type { SettingsApi } from '../../preload/settings'

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

function isDarkHex(color: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return false
  const n = parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.25
}

function heatFill(level: number, base: string, inverted: boolean): string | undefined {
  if (inverted) {
    if (level === 0) return 'var(--cream-60)'
    return `color-mix(in srgb, ${base} ${HEAT_PCT_INVERTED[level]}%, var(--text))`
  }
  if (level === 0) return undefined
  return `color-mix(in srgb, ${base} ${HEAT_PCT[level]}%, transparent)`
}

export function AnalyticsView(): React.JSX.Element {
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

  if (!summary) return <div className="home" />

  const recent = summary.days.slice(-14)
  const maxWords = Math.max(1, ...recent.map((d) => d.words))

  return (
    <div className="home">
      <section className="panel">
        <p className="micro-label">this month</p>
        <div className="stat-row">
          <Stat label="minutes dictated" value={String(summary.month.minutes)} />
          <Stat label="words" value={summary.month.words.toLocaleString()} />
          <Stat label="sessions" value={String(summary.month.sessions)} />
          <Stat label="est. cost" value={money(summary.month.estCostUsd)} />
        </div>
        <p className="row-desc rates-note">
          Estimates at current Groq rates (verified 2026-09-05), assuming the cleanup pass runs.
          Your provider bills you directly; murmur never sees it.
        </p>
      </section>

      <section className="panel">
        <p className="micro-label">last 14 days</p>
        <div className="chart" aria-hidden="true">
          {recent.map((day) => (
            <div className="chart-col" key={day.day} title={`${day.words} words on ${prettyDay(day.day)}`}>
              <div
                className={`chart-bar ${day.words > 0 ? 'chart-bar-live' : ''}`}
                style={{ height: `${Math.max(3, Math.round((day.words / maxWords) * 72))}px` }}
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
          <Stat label="est. cost" value={money(summary.lifetime.estCostUsd)} />
        </div>
      </section>
    </div>
  )
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
  const inverted = isDarkHex(heatBase)

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
          <div className="heat" aria-hidden="true">
            {cells.map((cell, i) =>
              cell === null ? (
                <span className="heat-cell heat-pad" key={`pad-${i}`} />
              ) : (
                <span
                  className={`heat-cell ${cell.day === todayKey ? 'heat-today' : ''}`}
                  key={cell.day}
                  style={{ background: heatFill(heatLevel(cell.words), heatBase, inverted) }}
                  title={`${cell.words.toLocaleString()} words on ${prettyDay(cell.day)}`}
                />
              )
            )}
          </div>
        </div>
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span className="chart-tick">less</span>
        {HEAT_PCT.map((_, level) => (
          <span className="heat-cell" key={level} style={{ background: heatFill(level, heatBase, inverted) }} />
        ))}
        <span className="chart-tick">more</span>
      </div>
      <p className="row-desc rates-note">Every square is a day; depth is words. Show up and the wall fills.</p>
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
