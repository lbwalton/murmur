// SPDX-License-Identifier: GPL-3.0-only
// The wrap-up: today's dictation in one quiet page. The recap
// notification lands here.
import { useEffect, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import { countsTowardStats, dayKey, eventDay, type SessionEvent } from '../../shared/history'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'

const bridge = (): SettingsApi => window.murmur

export function WrapUpView(props: {
  /** The speed time back is measured against, from the settings App
   *  already holds, so the sentence never flashes a placeholder. */
  typingWpm: number
}): React.JSX.Element {
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge()
        .listHistory()
        .then((all) => setEvents(all.filter((e) => countsTowardStats(e) && eventDay(e) === dayKey(Date.now()))))
      // Time back comes from main at the typing speed in settings, the
      // same number the home card reads.
      void bridge().getAnalytics().then(setSummary)
    }
    load()
    return bridge().onHistoryAppended(() => load())
  }, [props.typingWpm])

  const typingWpm = props.typingWpm
  const words = events.reduce((n, e) => n + e.words, 0)
  const minutes = Math.round(events.reduce((n, e) => n + e.durationMs / 60_000, 0) * 10) / 10
  const bestWpm = events.reduce((n, e) => Math.max(n, e.wpm), 0)
  const back = summary?.today.minutesBack ?? 0

  return (
    <div className="home">
      <section className="panel">
        <p className="micro-label">today, wrapped</p>
        {events.length === 0 ? (
          <p className="dim empty-log">A quiet day so far: no dictations yet.</p>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-value">{events.length}</div>
                <div className="stat-label">sessions</div>
              </div>
              <div className="stat">
                <div className="stat-value">{minutes}</div>
                <div className="stat-label">minutes spoken</div>
              </div>
              <div className="stat">
                <div className="stat-value">{words.toLocaleString()}</div>
                <div className="stat-label">words</div>
              </div>
              <div className="stat">
                <div className="stat-value">{bestWpm}</div>
                <div className="stat-label">best wpm</div>
              </div>
              {summary && (
                <div className="stat">
                  <div className="stat-value">{formatMinutesBack(back)}</div>
                  <div className="stat-label">time back</div>
                </div>
              )}
            </div>
            {back >= 1 && (
              <p className="row-desc rates-note">
                At your typing speed of {typingWpm} wpm, that is roughly {formatMinutesBack(back)} you
                did not spend typing.
              </p>
            )}
          </>
        )}
      </section>

      {events.length > 0 && (
        <section className="panel">
          <p className="micro-label">the takes</p>
          <div className="log-list">
            {[...events].reverse().map((event) => (
              <div className="log-entry" key={event.at}>
                <div className="log-meta">
                  <span className="mono-inline dim">
                    {new Date(event.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="mono-inline dim">{event.words}w · {event.wpm}wpm</span>
                </div>
                <p className="log-text">{event.finalText}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
