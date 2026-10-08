// SPDX-License-Identifier: GPL-3.0-only
// The wrap-up: today's dictation in one quiet page. The recap
// notification lands here.
import { useEffect, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import { countsTowardStats, dayKey, eventDay, type SessionEvent } from '../../shared/history'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, useToday } from './PageTitle'
import cosmeticsFile from '../../../shared/cosmetics.json'
import { tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'
import { daySummary, paintDay, paintDayCard } from './dayPaint'
import { journeyColors } from './journeyPaint'
import { EmptyState } from './EmptyState'

const bridge = (): SettingsApi => window.murmur
const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors
const CARD_W = 760
const CARD_H = 300

export function WrapUpView(props: {
  /** The speed time back is measured against, from the settings App
   *  already holds, so the sentence never flashes a placeholder. */
  typingWpm: number
  /** The dictation hotkey, for the empty state's sentence. */
  hotkey: string
}): React.JSX.Element {
  const [events, setEvents] = useState<SessionEvent[]>([])
  // Nothing renders until the list arrives, so a full day never flashes
  // the empty state.
  const [loaded, setLoaded] = useState(false)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  // The day the takes belong to, set with them, so the painting, its seed,
  // and a saved card's name always agree; a new day reloads (US-088).
  const [shownDay, setShownDay] = useState(() => dayKey(Date.now()))
  const dayName = useToday()

  useEffect(() => {
    const load = (): void => {
      void bridge()
        .listHistory()
        .then((all) => {
          const day = dayKey(Date.now())
          setEvents(all.filter((e) => countsTowardStats(e) && eventDay(e) === day))
          setShownDay(day)
          setLoaded(true)
        })
      // Time back comes from main at the typing speed in settings, the
      // same number the home card reads.
      void bridge().getAnalytics().then(setSummary)
    }
    load()
    return bridge().onHistoryAppended(() => load())
  }, [props.typingWpm, dayName])

  const typingWpm = props.typingWpm
  const back = summary?.today.minutesBack ?? 0
  const today = shownDay
  const said = daySummary(events, back)
  const [note, setNote] = useState('')

  const copySummary = async (): Promise<void> => {
    await bridge().copyText(said.text)
    setNote('Copied.')
    window.setTimeout(() => setNote(''), 1500)
  }

  // The saved card: the same painting at a fixed size, with the summary,
  // wordmark, and date written onto it. Drawn and saved on this machine.
  const saveCard = async (): Promise<void> => {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_W * 2
    canvas.height = CARD_H * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    const css = getComputedStyle(document.documentElement)
    const fonts = {
      body: css.getPropertyValue('--font-body').trim() || 'sans-serif',
      mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
    }
    const [y, m, d] = today.split('-').map(Number)
    const date = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    paintDayCard(ctx, CARD_W, CARD_H, events, today, date, said, journeyColors(BELT_HEX), tokenColor('--panel', [23, 22, 27]), fonts)
    const saved = await bridge().saveShareCard(canvas.toDataURL('image/png'), 'day', today)
    if (saved) {
      setNote('Saved.')
      window.setTimeout(() => setNote(''), 1500)
    }
  }

  return (
    <div className="home">
      <PageTitle title="Today, wrapped" sub="How the day went, ready to copy." />
      {loaded && events.length === 0 && (
        <EmptyState title="No dictations yet today." hotkey={props.hotkey} after="Your first one lands here." />
      )}
      {events.length > 0 && (
        <section className="panel day-card">
          <PaintCanvas
            className="day-canvas"
            label={`Today painted: one stroke for each of ${events.length} ${events.length === 1 ? 'dictation' : 'dictations'}, the biggest in ember`}
            paintKey={`${today}|${events.map((e) => e.words).join(',')}`}
            paint={(ctx, w, h) => paintDay(ctx, w, h, events, today, journeyColors(BELT_HEX), tokenColor('--panel', [23, 22, 27]))}
          />
          <div className="day-summary">
            <div className="day-words">
              <p className="day-headline">{said.headline}</p>
              <p className="day-detail">{said.detail}</p>
            </div>
            <span className="dim day-note" aria-live="polite">
              {note}
            </span>
            <button className="btn quiet-btn" onClick={() => void copySummary()} disabled={!summary}>
              Copy summary
            </button>
            <button className="btn quiet-btn" onClick={() => void saveCard()} disabled={!summary}>
              Save card
            </button>
          </div>
        </section>
      )}
      {events.length > 0 && back >= 1 && (
        <p className="row-desc rates-note">
          At your typing speed of {typingWpm} wpm, that is roughly {formatMinutesBack(back)} you did not spend typing.
        </p>
      )}

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
