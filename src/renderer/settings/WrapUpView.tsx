// SPDX-License-Identifier: GPL-3.0-only
// The wrap-up: today's dictation in one quiet page. The recap
// notification lands here. The day is a painting (US-098): every take
// adds its next stroke, and the newest paints itself in.
import { useEffect, useMemo, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import { countsTowardStats, dayKey, eventDay, type SessionEvent } from '../../shared/history'
import { type PaintingBook, type PaintingRecord, SUBJECT_NAMES, shiftDay } from '../../shared/painting'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, useToday } from './PageTitle'
import cosmeticsFile from '../../../shared/cosmetics.json'
import { tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'
import { daySummary } from './dayPaint'
import { journeyColors } from './journeyPaint'
import { EmptyState } from './EmptyState'
import { DISPLAY, loadDisplayFace } from './ShareCard'
import {
  CARD,
  type PaintingColors,
  paintPainting,
  paintPaintingCard,
  paintingCaption,
  paintingColors,
  paintingLine,
  planPainting
} from './painting'

const bridge = (): SettingsApi => window.murmur
const BELT_HEX = (cosmeticsFile as { beltColors: Record<string, string> }).beltColors

/** The stroke count the wrap-up last showed for a day: the newest stroke
 *  paints itself in only when it is new since then. */
const SEEN_KEY = 'murmur-painting-seen'
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
function rememberSeen(value: string): void {
  try {
    localStorage.setItem(SEEN_KEY, value)
  } catch {
    // Without storage the newest stroke simply paints in on each open.
  }
}

function colorsNow(): PaintingColors {
  const c = journeyColors(BELT_HEX)
  return paintingColors(tokenColor('--panel', [23, 22, 27]), c.rice, c.ember, c.gold)
}

/** An earlier day's painting in the strip, finished or not, still. */
function PastPainting(props: { day: string; today: string; record: PaintingRecord; colors: PaintingColors }): React.JSX.Element {
  const { subject, seed, target, tier, level } = props.record
  const plan = useMemo(() => planPainting({ subject, seed, target, tier, level }), [subject, seed, target, tier, level])
  const done = Math.min(props.record.words.length, props.record.target)
  const [y, m, d] = props.day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // Weekdays name the last week; older days get their date, so two
  // Mondays never look alike.
  const recent = props.day >= shiftDay(props.today, -6)
  const weekday = date.toLocaleDateString([], recent ? { weekday: 'short' } : { month: 'short', day: 'numeric' })
  const caption = done >= props.record.target ? SUBJECT_NAMES[props.record.subject] : `${done} of ${props.record.target}`
  return (
    <div className="past-painting">
      <PaintCanvas
        className="past-canvas"
        label={`${weekday}: ${paintingCaption(props.record.subject, done, props.record.target)}`}
        paintKey={`${props.day}|${done}`}
        paint={(ctx, w, h) =>
          paintPainting(ctx, w, h, plan, props.record.words, props.colors, { done, seal: done >= props.record.target ? 1 : 0, seed: props.record.seed })
        }
      />
      <span className="past-day">{weekday}</span>
      <span className="past-caption dim" title={caption}>
        {caption}
      </span>
    </div>
  )
}

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
  const [book, setBook] = useState<PaintingBook>({})
  // The day the takes belong to, set with them, so the painting and a
  // saved card's name always agree; a new day reloads.
  const [shownDay, setShownDay] = useState(() => dayKey(Date.now()))
  const dayName = useToday()

  useEffect(() => {
    const load = (): void => {
      // A painting that cannot load leaves the rest of the wrap-up be.
      const paintings = bridge()
        .listPaintings()
        .catch((): PaintingBook => ({}))
      void Promise.all([bridge().listHistory(), paintings]).then(([all, paintings]) => {
        const day = dayKey(Date.now())
        setEvents(all.filter((e) => countsTowardStats(e) && eventDay(e) === day))
        setBook(paintings)
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
  const colors = useMemo(colorsNow, [])

  const record: PaintingRecord | null = book[today] ?? null
  const plan = useMemo(() => (record ? planPainting(record) : []), [record?.subject, record?.seed, record?.target, record?.tier, record?.level])
  const done = record ? Math.min(record.words.length, record.target) : 0
  const finished = record !== null && done >= record.target
  const longest = events.reduce((ms, e) => Math.max(ms, e.durationMs), 0)
  // The newest stroke paints in when it is new since the last look; the
  // seal stamps in with the stroke that finishes the painting.
  const seenNow = `${today}|${done}`
  const fresh = useMemo(() => record !== null && readSeen() !== seenNow, [seenNow, record !== null])
  useEffect(() => {
    if (record) rememberSeen(seenNow)
  }, [seenNow, record !== null])
  const past = Object.keys(book)
    .filter((day) => day < today)
    .sort()
    .slice(-6)

  const copySummary = async (): Promise<void> => {
    await bridge().copyText(said.text)
    setNote('Copied.')
    window.setTimeout(() => setNote(''), 1500)
  }

  // The saved card: the painting as it stands, portrait, 1080 by 1350,
  // with its name, the date, and the wordmark. Drawn and saved here.
  const saveCard = async (): Promise<void> => {
    if (!record) return
    const hasFace = await loadDisplayFace()
    const canvas = document.createElement('canvas')
    canvas.width = CARD.W * 2
    canvas.height = CARD.H * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    const css = getComputedStyle(document.documentElement)
    const body = css.getPropertyValue('--font-body').trim() || 'sans-serif'
    const fonts = {
      display: hasFace ? `"${DISPLAY}", ${body}` : `"Arial Narrow", "Helvetica Neue", ${body}`,
      body,
      mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
    }
    const [y, m, d] = today.split('-').map(Number)
    const date = new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    const c = journeyColors(BELT_HEX)
    paintPaintingCard(
      ctx,
      plan,
      record.words,
      colors,
      { text: c.text, dim: c.dim },
      fonts,
      {
        date,
        // The subject stays a surprise until its third stroke here too.
        title: done < 3 ? 'a painting' : SUBJECT_NAMES[record.subject],
        caption: finished ? `finished in ${record.target} strokes` : `${done} of ${record.target} strokes so far`,
        line: finished ? paintingLine(record.words, longest) : null
      },
      { done, finished, seed: record.seed }
    )
    const saved = await bridge().saveShareCard(canvas.toDataURL('image/png'), 'day', today)
    if (saved) {
      setNote('Saved.')
      window.setTimeout(() => setNote(''), 1500)
    }
  }

  return (
    <div className="home">
      <PageTitle title="Today, wrapped" sub="How the day went, ready to copy." />
      {loaded && !record && events.length === 0 && (
        <EmptyState title="No dictations yet today." hotkey={props.hotkey} after="Your first one starts today's painting." />
      )}
      {record && (
        <section className="panel painting-card">
          <PaintCanvas
            className="painting-canvas"
            label={`Today's painting: ${paintingCaption(record.subject, done, record.target)}`}
            paintKey={`${today}|${done}|${record.seed}`}
            paintInMs={fresh ? 900 : 0}
            replay
            paint={(ctx, w, h, k) =>
              paintPainting(ctx, w, h, plan, record.words, colors, {
                done,
                live: fresh ? Math.min(1, k * 1.25) : undefined,
                seal: finished ? (fresh ? Math.max(0, k * 4 - 3) : 1) : 0,
                seed: record.seed
              })
            }
          />
          <div className="painting-words">
            <p className="painting-caption">{paintingCaption(record.subject, done, record.target)}</p>
            <p className="painting-line dim">
              {finished
                ? paintingLine(record.words, longest)
                : `Every take adds the next stroke. ${record.target - done} more to finish it.`}
            </p>
          </div>
          <div className="day-summary">
            <div className="day-words">
              {events.length > 0 && (
                <>
                  <p className="day-headline">{said.headline}</p>
                  <p className="day-detail">{said.detail}</p>
                </>
              )}
            </div>
            <span className="dim day-note" aria-live="polite">
              {note}
            </span>
            {events.length > 0 && (
              <button className="btn quiet-btn" onClick={() => void copySummary()} disabled={!summary}>
                Copy summary
              </button>
            )}
            <button className="btn quiet-btn" onClick={() => void saveCard()}>
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

      {past.length > 0 && (
        <section className="panel">
          <p className="micro-label">your paintings</p>
          <div className="past-paintings">
            {past.map((day) => (
              <PastPainting key={day} day={day} today={today} record={book[day]} colors={colors} />
            ))}
          </div>
        </section>
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
