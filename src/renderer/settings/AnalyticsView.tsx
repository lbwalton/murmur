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

  const maxWords = Math.max(1, ...summary.days.map((d) => d.words))

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
          {summary.days.map((day) => (
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
        <p className="micro-label">lifetime</p>
        <div className="stat-row">
          <Stat label="minutes" value={String(summary.lifetime.minutes)} />
          <Stat label="words" value={summary.lifetime.words.toLocaleString()} />
          <Stat label="sessions" value={String(summary.lifetime.sessions)} />
          <Stat label="est. cost" value={money(summary.lifetime.estCostUsd)} />
        </div>
      </section>
    </div>
  )
}
