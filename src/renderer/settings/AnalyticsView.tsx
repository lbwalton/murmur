// SPDX-License-Identifier: GPL-3.0-only
// The analytics view: monthly usage card with the live cost estimate,
// lifetime totals, and a fourteen-day activity chart. Pure presentation
// over the computed summary; transcripts never enter this view.
import { useEffect, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import type { CosmeticsReport } from '../../shared/cosmetics'
import type { Settings } from '../../shared/settings'
import type { SettingsApi } from '../../preload/settings'

const bridge = (): SettingsApi => window.murmur

function money(usd: number): string {
  if (usd < 0.01 && usd > 0) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

// Fill strength per heat level. Level 0 keeps the resting cell color;
// the rest mix the chosen base color over transparency so the ladder
// reads the same whether the base is cream or a belt color.
const HEAT_PCT = [0, 20, 40, 65, 95]

function heatFill(level: number, base: string): string | undefined {
  if (level === 0) return undefined
  return `color-mix(in srgb, ${base} ${HEAT_PCT[level]}%, transparent)`
}

export function AnalyticsView(): React.JSX.Element {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cosmetics, setCosmetics] = useState<CosmeticsReport | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge().getAnalytics().then(setSummary)
      void bridge().getSettings().then(setSettings)
      void bridge().getCosmetics().then(setCosmetics)
    }
    load()
    return bridge().onHistoryAppended(() => load())
  }, [])

  if (!summary) return <div className="home" />

  const recent = summary.days.slice(-14)
  const maxWords = Math.max(1, ...recent.map((d) => d.words))
  const heatMax = Math.max(1, ...summary.days.map((d) => d.words))
  const todayKey = summary.days.at(-1)?.day
  // Pad the heat grid so weeks align into columns of seven.
  const firstDay = summary.days[0]
  const pad = firstDay
    ? new Date(
        Number(firstDay.day.slice(0, 4)),
        Number(firstDay.day.slice(5, 7)) - 1,
        Number(firstDay.day.slice(8, 10))
      ).getDay()
    : 0
  const heatCells: Array<(typeof summary.days)[number] | null> = [
    ...Array.from({ length: pad }, () => null),
    ...summary.days
  ]
  const heatLevel = (words: number): number => {
    if (words === 0) return 0
    const r = words / heatMax
    if (r > 0.75) return 4
    if (r > 0.5) return 3
    if (r > 0.25) return 2
    return 1
  }
  const beltUnlocked = cosmetics?.accents.find((a) => a.id === 'belt')?.unlocked ?? false
  const useBelt = settings?.cosmetics.heat === 'belt' && beltUnlocked && cosmetics
  const heatBase = useBelt ? cosmetics.beltColor : 'var(--text)'
  const setHeat = (heat: Settings['cosmetics']['heat']): void => {
    if (!settings) return
    void bridge()
      .updateSettings({ cosmetics: { ...settings.cosmetics, heat } })
      .then(setSettings)
  }

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
            <div className="chart-col" key={day.day} title={`${day.day}: ${day.words} words`}>
              <div
                className={`chart-bar ${day.words > 0 ? 'chart-bar-live' : ''}`}
                style={{ height: `${Math.max(3, Math.round((day.words / maxWords) * 72))}px` }}
              />
              <span className="chart-tick">{day.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <p className="micro-label">getting active · last 18 weeks</p>
          {settings && (
            <select
              className="field heat-picker"
              value={settings.cosmetics.heat}
              onChange={(e) => setHeat(e.target.value as Settings['cosmetics']['heat'])}
              aria-label="heatmap color"
            >
              <option value="cream">cream</option>
              <option value="belt" disabled={!beltUnlocked}>
                {beltUnlocked ? 'your belt color' : 'your belt color (earn your white belt)'}
              </option>
            </select>
          )}
        </div>
        <div className="heat" aria-hidden="true">
          {heatCells.map((cell, i) =>
            cell === null ? (
              <span className="heat-cell heat-pad" key={`pad-${i}`} />
            ) : (
              <span
                className={`heat-cell ${cell.day === todayKey ? 'heat-today' : ''}`}
                key={cell.day}
                style={{ background: heatFill(heatLevel(cell.words), heatBase) }}
                title={`${cell.day}: ${cell.words.toLocaleString()} words`}
              />
            )
          )}
        </div>
        <div className="heat-legend" aria-hidden="true">
          <span className="chart-tick">less</span>
          {HEAT_PCT.map((_, level) => (
            <span className="heat-cell" key={level} style={{ background: heatFill(level, heatBase) }} />
          ))}
          <span className="chart-tick">more</span>
        </div>
        <p className="row-desc rates-note">Every square is a day; depth is words. Show up and the wall fills.</p>
      </section>

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

function Stat(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stat">
      <div className="stat-value">{props.value}</div>
      <div className="stat-label">{props.label}</div>
    </div>
  )
}
