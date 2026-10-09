// SPDX-License-Identifier: GPL-3.0-only
// The wrap-up: today's dictation in one quiet page. The recap
// notification lands here. The day is a painting (US-098): every take
// adds its next stroke, and the newest paints itself in.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyticsSummary } from '../../shared/analytics'
import { countsTowardStats, dayKey, eventDay, type SessionEvent } from '../../shared/history'
import { type PaintingBook, type PaintingRecord, SUBJECT_NAMES, sealBelt, shiftDay } from '../../shared/painting'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import { PageTitle, useToday } from './PageTitle'
import cosmeticsFile from '../../../shared/cosmetics.json'
import ranksFile from '../../../shared/ranks.json'
import type { RankSpec } from '../../shared/ranks'
import { tokenColor } from '../brush'
import { PaintCanvas } from './PaintCanvas'
import { daySummary } from './dayPaint'
import { beltOnInk, journeyColors } from './journeyPaint'
import { EmptyState } from './EmptyState'
import { DISPLAY, loadDisplayFace } from './ShareCard'
import {
  CARD,
  type Gesture,
  MAX_EXTRA,
  type PaintingColors,
  type SealColor,
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

/** How far a painting has got: its strokes so far (past its size, the
 *  strokes a finished painting keeps adding) and whether it is finished. */
function progressOf(record: PaintingRecord): { done: number; finished: boolean } {
  return { done: Math.min(record.words.length, record.target + MAX_EXTRA), finished: record.words.length >= record.target }
}

/** A day's whole plan: its strokes, then what each take past its size
 *  added, from that take's words. */
function planFor(record: PaintingRecord): Gesture[] {
  const { subject, seed, target, tier, level } = record
  return planPainting({ subject, seed, target, tier, level }, record.words.slice(target, target + MAX_EXTRA))
}

const LADDER = (ranksFile as { ranks: RankSpec[] }).ranks

/** The rank and level a day was painted at, for its card: white belt,
 *  one stripe, level 1. Records from before ranks were kept name the level. */
function painterOf(record: PaintingRecord): string {
  if (record.rank === 'none') return `painted before the first belt, level ${record.level}`
  const rank = LADDER.find((r) => r.id === record.rank)
  return rank ? `painted at ${rank.label}, level ${record.level}` : `painted at level ${record.level}`
}

/** The seal's color (US-101): the belt the day was painted at, as paint
 *  on the night ground, the coral belts in their two colors; undefined
 *  keeps the ember seal (before the first belt, or a record from before
 *  ranks were kept). */
function sealOf(record: PaintingRecord): SealColor | undefined {
  const belt = sealBelt(record.rank, LADDER)
  if (!belt) return undefined
  const c = journeyColors(BELT_HEX)
  if (belt === 'coral-black') return [beltOnInk('coral-black', c), beltOnInk('black', c)]
  if (belt === 'coral-white') return [beltOnInk('coral-black', c), beltOnInk('white', c)]
  return beltOnInk(belt, c)
}

/** A day's key as words: Friday, October 9. */
function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * Saves a day's portrait card (1080 by 1350): the painting as it stands,
 * its name, how far it got, the date, and the wordmark. Drawn and saved
 * here, nothing sent. True when it was saved.
 */
async function saveDayCard(day: string, record: PaintingRecord, colors: PaintingColors, longestMs: number | null): Promise<boolean> {
  const { subject, seed, target } = record
  const plan = planFor(record)
  const { done, finished } = progressOf(record)
  const hasFace = await loadDisplayFace()
  const canvas = document.createElement('canvas')
  canvas.width = CARD.W * 2
  canvas.height = CARD.H * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  const css = getComputedStyle(document.documentElement)
  const body = css.getPropertyValue('--font-body').trim() || 'sans-serif'
  const fonts = {
    display: hasFace ? `"${DISPLAY}", ${body}` : `"Arial Narrow", "Helvetica Neue", ${body}`,
    body,
    mono: css.getPropertyValue('--font-mono').trim() || 'monospace'
  }
  const c = journeyColors(BELT_HEX)
  const more = done - target
  paintPaintingCard(
    ctx,
    plan,
    record.words,
    colors,
    { text: c.text, dim: c.dim },
    fonts,
    {
      date: longDate(day),
      // The subject stays a surprise until its third stroke here too.
      title: done < 3 ? 'a painting' : SUBJECT_NAMES[subject],
      caption: finished
        ? `finished in ${target} strokes${more > 0 ? `, and ${more} more` : ''}`
        : `${done} of ${target} strokes so far`,
      line: finished ? paintingLine(record.words, longestMs) : null,
      painter: painterOf(record)
    },
    { done, finished, seed, sealColor: sealOf(record) }
  )
  return bridge().saveShareCard(canvas.toDataURL('image/png'), 'day', day)
}

/** An earlier day's painting, opened large from the strip, with its own
 *  Save card. A modal dialog: Escape or Close returns to the strip. */
function PaintingViewer(props: { day: string; record: PaintingRecord; colors: PaintingColors; onClose: () => void }): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [returnTo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const [status, setStatus] = useState('')
  const { subject, seed, target } = props.record
  const plan = useMemo(() => planFor(props.record), [props.record])
  const sealColor = useMemo(() => sealOf(props.record), [props.record])
  const { done, finished } = progressOf(props.record)
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // Close takes focus, so Enter right after opening never saves.
    closeRef.current?.focus()
  }, [])
  const close = (): void => {
    dialogRef.current?.close()
    returnTo?.focus({ preventScroll: true })
    props.onClose()
  }
  const save = async (): Promise<void> => {
    setStatus('Saving…')
    const saved = await saveDayCard(props.day, props.record, props.colors, null).catch(() => false)
    setStatus(saved ? 'Saved.' : '')
  }
  return (
    <dialog
      ref={dialogRef}
      className="share-dialog painting-viewer"
      aria-labelledby="viewer-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="share-head">
        <h2 id="viewer-title">{longDate(props.day)}</h2>
        <p className="dim">
          {paintingCaption(subject, done, target)}. {finished ? paintingLine(props.record.words, null) : 'Kept as it stood that day.'}
        </p>
      </div>
      <PaintCanvas
        className="viewer-canvas"
        label={`${longDate(props.day)}: ${paintingCaption(subject, done, target)}`}
        paintKey={`${props.day}|${done}`}
        paint={(ctx, w, h) => paintPainting(ctx, w, h, plan, props.record.words, props.colors, { done, seal: finished ? 1 : 0, seed, ground: false, sealColor })}
      />
      <div className="share-actions">
        <span className="dim" aria-live="polite">
          {status}
        </span>
        <button className="btn" onClick={() => void save()}>
          Save card
        </button>
        <button className="btn quiet-btn" onClick={close} ref={closeRef}>
          Close
        </button>
      </div>
    </dialog>
  )
}

/** An earlier day's painting in the strip, finished or not, still. A
 *  button: clicking it opens the painting large. */
function PastPainting(props: { day: string; today: string; record: PaintingRecord; colors: PaintingColors; onOpen: () => void }): React.JSX.Element {
  const { subject, seed, target, tier, level } = props.record
  const extraKey = props.record.words.slice(target, target + MAX_EXTRA).join(',')
  const plan = useMemo(() => planFor(props.record), [subject, seed, target, tier, level, extraKey])
  const sealColor = useMemo(() => sealOf(props.record), [props.record.rank])
  const { done, finished } = progressOf(props.record)
  const [y, m, d] = props.day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // Weekdays name the last week; older days get their date, so two
  // Mondays never look alike.
  const recent = props.day >= shiftDay(props.today, -6)
  const weekday = date.toLocaleDateString([], recent ? { weekday: 'short' } : { month: 'short', day: 'numeric' })
  const caption = finished ? SUBJECT_NAMES[props.record.subject] : `${done} of ${props.record.target}`
  return (
    <button type="button" className="past-painting" onClick={props.onOpen} aria-label={`${weekday}: ${paintingCaption(subject, done, target)}. Open it large.`}>
      <PaintCanvas
        className="past-canvas"
        paintKey={`${props.day}|${done}`}
        paint={(ctx, w, h) => paintPainting(ctx, w, h, plan, props.record.words, props.colors, { done, seal: finished ? 1 : 0, seed, ground: false, sealColor })}
      />
      <span className="past-day">{weekday}</span>
      <span className="past-caption dim" title={caption}>
        {caption}
      </span>
    </button>
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
  const extraKey = record ? record.words.slice(record.target, record.target + MAX_EXTRA).join(',') : ''
  const plan = useMemo(() => (record ? planFor(record) : []), [record?.subject, record?.seed, record?.target, record?.tier, record?.level, extraKey])
  const { done, finished } = record ? progressOf(record) : { done: 0, finished: false }
  const sealColor = useMemo(() => (record ? sealOf(record) : undefined), [record?.rank])
  // The painting open in the viewer, kept as it was opened, so a reload
  // underneath never pulls it away.
  const [viewing, setViewing] = useState<{ day: string; record: PaintingRecord } | null>(null)
  const longest = events.reduce((ms, e) => Math.max(ms, e.durationMs), 0)
  // The newest stroke paints in when it is new since the last look; the
  // seal stamps in with the stroke that finishes the painting.
  const seenNow = `${today}|${done}`
  // What the last look showed today, read before this look is remembered:
  // the newest stroke paints in when it is new, and the seal stamps in
  // when the painting finished since then, however many strokes ago.
  const before = useMemo(() => readSeen(), [seenNow, record !== null])
  const fresh = record !== null && before !== seenNow
  const doneBefore = before?.startsWith(`${today}|`) ? Number(before.split('|')[1]) || 0 : 0
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

  const saveCard = async (): Promise<void> => {
    if (!record) return
    if (await saveDayCard(today, record, colors, longest).catch(() => false)) {
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
                // The seal stamps in with the stroke that finishes it.
                seal: finished ? (fresh && doneBefore < record.target ? Math.max(0, k * 4 - 3) : 1) : 0,
                seed: record.seed,
                ground: false,
                sealColor
              })
            }
          />
          <div className="painting-words">
            <p className="painting-caption">{paintingCaption(record.subject, done, record.target)}</p>
            <p className="painting-line dim">
              {finished
                ? `${paintingLine(record.words, longest)}${done < record.target + MAX_EXTRA ? ' Every take from here adds to it.' : ''}`
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

      {viewing && <PaintingViewer day={viewing.day} record={viewing.record} colors={colors} onClose={() => setViewing(null)} />}
      {past.length > 0 && (
        <section className="panel">
          <p className="micro-label">your paintings</p>
          <div className="past-paintings">
            {past.map((day) => (
              <PastPainting key={day} day={day} today={today} record={book[day]} colors={colors} onOpen={() => setViewing({ day, record: book[day] })} />
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
