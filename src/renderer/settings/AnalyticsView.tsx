// SPDX-License-Identifier: GPL-3.0-only
// The analytics view: monthly usage card with the live cost estimate,
// lifetime totals, and a fourteen-day activity chart. Pure presentation
// over the computed summary; transcripts never enter this view.
import { useEffect, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import type { SettingsApi } from '../../preload/settings'

const bridge = (): SettingsApi => window.murmur

function money(usd: number): string {
  if (usd < 0.01 && usd > 0) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function Stat(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stat">
      <div className="stat-value">{props.value}</div>
      <div className="stat-label">{props.label}</div>
    </div>
  )
}

export function AnalyticsView(): React.JSX.Element {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)

  useEffect(() => {
    void bridge().getAnalytics().then(setSummary)
    return bridge().onHistoryAppended(() => {
      void bridge().getAnalytics().then(setSummary)
    })
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
        <p className="micro-label">the mat · last 18 weeks</p>
        <div className="heat" aria-hidden="true">
          {heatCells.map((cell, i) =>
            cell === null ? (
              <span className="heat-cell heat-pad" key={`pad-${i}`} />
            ) : (
              <span
                className={`heat-cell heat-${heatLevel(cell.words)} ${cell.day === todayKey ? 'heat-today' : ''}`}
                key={cell.day}
                title={`${cell.day}: ${cell.words.toLocaleString()} words`}
              />
            )
          )}
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
