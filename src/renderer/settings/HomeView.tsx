// SPDX-License-Identifier: GPL-3.0-only
// The home view: your transcription log, grouped by day, newest first,
// updating live as dictations land.
import { useEffect, useState } from 'react'
import changelogRaw from '../../../CHANGELOG.md?raw'
import { sectionFor } from '../../shared/changelog'
import { type SessionEvent, groupByDay } from '../../shared/history'
import type { SettingsApi } from '../../preload/settings'
import type { Settings } from '../../shared/settings'

const bridge = (): SettingsApi => window.murmur

function WhatsNew(props: {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element | null {
  const [version, setVersion] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void bridge().appVersion().then(setVersion)
  }, [])

  const section = version ? sectionFor(changelogRaw, version) : null
  if (!section) return null
  const unseen = props.settings.whatsNewSeenVersion !== version

  return (
    <section className="panel whats-new">
      <button
        className="whats-new-head"
        onClick={() => {
          setOpen((o) => !o)
          if (unseen) void props.onUpdateSettings({ whatsNewSeenVersion: version })
        }}
      >
        <span className="micro-label">
          what&apos;s new in {version}
          {unseen && <span className="whats-new-dot" aria-label="unread" />}
        </span>
        <span className="dim">{open ? 'hide' : 'show'}</span>
      </button>
      {open && <pre className="whats-new-body">{section}</pre>}
    </section>
  )
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'today'
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday'
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

export function HomeView(props: {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [copiedAt, setCopiedAt] = useState<number | null>(null)

  useEffect(() => {
    void bridge().listHistory().then(setEvents)
    // Unsubscribe on unmount, and cap live growth to match the list
    // handler so a long-running hidden window never accumulates state.
    return bridge().onHistoryAppended((event) => {
      setEvents((prev) => [...prev, event].slice(-500))
    })
  }, [])

  const copy = async (event: SessionEvent): Promise<void> => {
    await bridge().copyText(event.finalText)
    setCopiedAt(event.at)
    setTimeout(() => setCopiedAt((c) => (c === event.at ? null : c)), 1500)
  }

  const grouped = groupByDay(events)

  return (
    <div className="home">
      <WhatsNew settings={props.settings} onUpdateSettings={props.onUpdateSettings} />
      {grouped.length === 0 && (
        <section className="panel empty-log">
          <p className="micro-label">transcriptions</p>
          <p className="dim">
            Nothing yet. Hold <span className="kbd">{props.settings.hotkey.binding}</span> anywhere
            and speak; every dictation lands here.
          </p>
        </section>
      )}

      {grouped.map((group) => (
        <section className="panel" key={group.day}>
          <p className="micro-label">{dayLabel(group.day)}</p>
          <div className="log-list">
            {group.events.map((event) => (
              <div className="log-entry" key={event.at}>
                <div className="log-meta">
                  <span className="mono-inline dim">{timeOf(event.at)}</span>
                  {event.kind === 'note' && <span className="mono-inline note-tag">note</span>}
                  {event.kind === 'transform' && (
                    <span className="mono-inline note-tag">{event.unsent ? 'transform · not sent' : 'transform'}</span>
                  )}
                  {event.kind !== 'transform' && (
                    <span className="mono-inline dim">{event.words}w · {event.wpm}wpm</span>
                  )}
                  <button className="btn quiet-btn log-copy" onClick={() => void copy(event)}>
                    {copiedAt === event.at ? 'copied' : 'copy'}
                  </button>
                </div>
                {event.kind === 'transform' && !event.unsent && (
                  <p className="log-instruction dim">you said: {event.rawText}</p>
                )}
                {event.kind === 'transform' && event.unsent && (
                  <p className="log-instruction dim">the selection was too long to send; your words are kept below</p>
                )}
                {event.kind === 'transform' && !event.unsent && <p className="micro-label log-original">original</p>}
                <p className="log-text">{event.finalText}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {events.length > 0 && (
        <section className="panel">
          <p className="micro-label">retention</p>
          <div className="row">
            <div className="row-text">
              <div className="row-label">Keep history for</div>
              <div className="row-desc">Older entries are pruned automatically. Everything stays on this machine.</div>
            </div>
            <div className="row-control inline">
              <select
                className="field"
                value={props.settings.history.retentionDays}
                onChange={(e) =>
                  void props.onUpdateSettings({
                    history: { retentionDays: Number(e.target.value) }
                  })
                }
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>a year</option>
                <option value={0}>forever</option>
              </select>
              <button
                className="btn quiet-btn"
                onClick={() => void bridge().clearHistory().then(setEvents)}
              >
                Clear all
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
