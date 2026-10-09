// SPDX-License-Identifier: GPL-3.0-only
// The home view: takes waiting to retry, today's time back, then your
// transcription log, grouped by day, newest first, updating live as
// dictations land.
import { useEffect, useRef, useState } from 'react'
import changelogRaw from '../../../CHANGELOG.md?raw'
import { type AnalyticsSummary, TYPICAL_MIN_DAYS, typicalShare } from '../../shared/analytics'
import { sectionFor } from '../../shared/changelog'
import { type SessionEvent, countsTowardStats, dayKey, groupByDay } from '../../shared/history'
import { type LastNote, receiptWhere, revealLabel } from '../../shared/receipt'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import type { WaitingTake } from '../../main/transcribe/recovery'
import type { Settings } from '../../shared/settings'
import { PageTitle, useToday } from './PageTitle'
import { DayStroke } from './DayStroke'
import { EmptyState } from './EmptyState'
import { AskFirst } from './AskFirst'

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

/** Why a take is waiting, in plain words (US-068). */
function reasonText(take: WaitingTake): string {
  const f = take.failure
  if (!f) return 'saved before murmur kept reasons'
  if (f.kind === 'auth') {
    return f.detail === 'no API key configured' ? 'no API key was saved' : 'the provider did not accept the key'
  }
  if (f.kind === 'network') return 'murmur could not reach the provider'
  if (f.kind === 'timeout') return 'the provider did not answer in time'
  if (f.kind === 'server') return 'the provider had a problem on its end'
  if (f.kind === 'badrequest') return 'the provider refused the audio or the model name'
  if (f.kind === 'nospeech') return 'no speech was heard in it'
  return 'something went wrong'
}

function whenOf(at: number): string {
  const date = new Date(at)
  if (date.toDateString() === new Date().toDateString()) return `today ${timeOf(at)}`
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeOf(at)}`
}

function lengthOf(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** The note receipt's Home half (US-082): the newest note, where it
 *  landed, and the two ways back to it. Opening goes through main's
 *  note opener, which refuses anything that is not a note file. */
function LastNoteRow(): React.JSX.Element | null {
  const [note, setNote] = useState<LastNote | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge().getLastNote().then(setNote)
    }
    load()
    return bridge().onLastNoteChanged(load)
  }, [])

  if (!note) return null
  const reveal = revealLabel(navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32')
  const act = async (what: 'open' | 'reveal'): Promise<void> => {
    const outcome = what === 'open' ? await bridge().openLastNote() : await bridge().revealLastNote()
    setSaid(
      outcome === 'refused' || outcome === 'none'
        ? 'That file is not there anymore, or it is no longer a note.'
        : outcome === 'failed'
          ? 'Your computer could not open it. Try the other button.'
          : null
    )
  }

  return (
    <section className="panel last-note">
      <p className="micro-label">last note</p>
      <div className="last-note-row">
        <div className="last-note-text">
          <p className="last-note-line">{note.line !== '' ? note.line : 'An empty note'}</p>
          <p className="mono-inline dim">
            {receiptWhere(note)} · {whenOf(note.at)}
          </p>
        </div>
        <button className="btn quiet-btn" onClick={() => void act('open')}>
          open
        </button>
        <button className="btn quiet-btn" onClick={() => void act('reveal')}>
          {reveal.charAt(0).toLowerCase() + reveal.slice(1)}
        </button>
      </div>
      {said && <p className="dim last-note-said">{said}</p>}
    </section>
  )
}

/** Today in words against a typical day (US-085). Past double, the
 *  percentage stops meaning much, so it says so instead. */
function typicalLine(share: number, typical: number): string {
  const of = `your typical day (${formatMinutesBack(typical)})`
  return share > 2 ? `More than double ${of}` : `${Math.round(share * 100)}% of ${of}`
}

/** Told to the rest of the window when Clear all empties the log, so the
 *  header's belt and anything else counted from history reloads. */
export const HISTORY_CLEARED = 'murmur:history-cleared'

/** The how-to's one-way switch (US-086): set once five dictations exist. */
const HOW_TO_KEY = 'murmur-howto-done'
function howToDone(): boolean {
  try {
    return localStorage.getItem(HOW_TO_KEY) === '1'
  } catch {
    return false
  }
}
function rememberHowToDone(): void {
  try {
    if (!howToDone()) localStorage.setItem(HOW_TO_KEY, '1')
  } catch {
    // Without storage the history count still decides.
  }
}

/** What Clear all asks before it empties the log (US-099). */
export function clearAllQuestion(count: number): string {
  const what = count === 1 ? 'Clear the 1 entry in your history?' : `Clear all ${count.toLocaleString()} entries from your history?`
  return `${what} This cannot be undone. Your stats, time back, and belt progress are counted from your history, so they start over. Note files stay in your notes folder.`
}

/** Two clicks closer together than this are one double click. */
const DOUBLE_CLICK_MS = 500

/** What Discard all asks before it deletes (US-096). */
export function discardAllQuestion(count: number): string {
  return `Discard all ${count} recordings waiting to retry? Their audio is deleted from this computer, and they cannot be retried.`
}

/** What Home says once Discard all is done: how many went, and how many
 *  could not be deleted and are still listed. */
export function discardedMessage(gone: number, asked: number): string {
  const recordings = (n: number): string => (n === 1 ? '1 recording' : `${n} recordings`)
  if (gone === asked) return `Discarded ${recordings(gone)}.`
  if (gone === 0) return `Could not discard ${recordings(asked)}. They are still listed below; try again in a moment.`
  return `Discarded ${gone} of ${asked}. ${recordings(asked - gone)} could not be deleted and ${asked - gone === 1 ? 'is' : 'are'} still listed below.`
}

/**
 * Takes that were recorded but not transcribed (US-068). Retry runs the
 * saved audio through the normal pipeline with today's settings; the
 * words land in the log, and a dictation also on the clipboard, where
 * paste-last finds it. Discard asks once, then deletes the audio.
 * Discard all (US-096) asks in place, with the count, before deleting:
 * the question counts the takes listed when it opened, and only those
 * are deleted, so a take that fails while it is open is kept. Keep them
 * has focus, so a double press never deletes. One question at a time.
 */
function WaitingTakes(props: { pasteLastBinding: string }): React.JSX.Element | null {
  const [takes, setTakes] = useState<WaitingTake[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  // The takes Discard all asked about, fixed when the question opened.
  const [counted, setCounted] = useState<string[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const discardAllRef = useRef<HTMLButtonElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)
  // When a take's discard was armed: a second click this soon is the
  // same double click, not an answer to delete audio? (US-099).
  const armedAt = useRef(0)
  // Focus moves to the message once Discard all is done, so keyboard and
  // screen reader users are not dropped at the window's top.
  const focusMessage = useRef(false)

  useEffect(() => {
    const load = (): void => {
      void bridge().listWaitingTakes().then(setTakes)
    }
    load()
    return bridge().onWaitingTakesChanged(load)
  }, [])

  // The counted takes still listed: the count can shrink (one retried or
  // gone), never grow.
  const asked = counted ? counted.filter((id) => takes.some((t) => t.id === id)) : []
  const deleting = busy === 'all'
  const questionOpen = counted !== null && (deleting || asked.length >= 2)
  // While deleting, the question holds its count rather than counting down.
  const shownCount = deleting && counted ? counted.length : asked.length

  useEffect(() => {
    if (focusMessage.current && message) {
      focusMessage.current = false
      messageRef.current?.focus()
    }
  }, [message])

  // Nothing left to ask about (the counted ones were retried or gone).
  useEffect(() => {
    if (counted !== null && !questionOpen) setCounted(null)
  }, [counted, questionOpen])

  const retry = async (ids: string[]): Promise<void> => {
    setMessage(null)
    setConfirming(null)
    setCounted(null)
    const done: Array<{ kind: WaitingTake['kind']; location: string }> = []
    let failed = 0
    for (const id of ids) {
      setBusy(id)
      const result = await bridge().retryTake(id)
      if (result.ok) done.push({ kind: result.kind, location: result.location })
      else failed += 1
    }
    setBusy(null)
    const paste = props.pasteLastBinding
      ? ` Press ${props.pasteLastBinding} in any app to paste it there.`
      : ' Paste it wherever it belongs.'
    if (done.length === 1 && failed === 0) {
      const { kind, location } = done[0]
      setMessage(
        kind === 'note'
          ? location === 'history'
            ? 'Transcribed, but the note could not be written to your notes folder or murmur\'s data folder. The words are safe in your log.'
            : 'Done: the note is filed under the time you spoke it, and it is in your log.'
          : kind === 'transform'
            ? 'Done: your instruction is in the log. The text it was for is gone, so nothing was changed.'
            : `Done: the words are in your log and on your clipboard.${paste}`
      )
    } else if (done.length > 0) {
      setMessage(`${done.length} delivered to your log${failed > 0 ? `, ${failed} still waiting` : ''}.`)
    } else {
      setMessage('Still could not transcribe. The reason is updated below; the audio stays until you retry or discard it.')
    }
  }

  const discard = async (id: string): Promise<void> => {
    if (confirming !== id) {
      setCounted(null)
      setConfirming(id)
      armedAt.current = performance.now()
      return
    }
    if (performance.now() - armedAt.current < DOUBLE_CLICK_MS) return
    setConfirming(null)
    setTakes(await bridge().discardTake(id))
  }

  const openAll = (): void => {
    if (questionOpen) {
      setCounted(null)
      return
    }
    setMessage(null)
    setConfirming(null)
    setCounted(takes.map((t) => t.id))
  }

  const keepAll = (): void => {
    setCounted(null)
    discardAllRef.current?.focus()
  }

  // Deletes exactly the takes the question counted, one by one, and says
  // how many went; a delete that fails leaves its take listed.
  const discardAll = async (ids: string[]): Promise<void> => {
    setBusy('all')
    let gone = 0
    try {
      for (const id of ids) {
        const left = await bridge().discardTake(id)
        if (!left.some((t) => t.id === id)) gone += 1
      }
    } catch (error) {
      console.error('[murmur] discard all stopped:', error)
    } finally {
      const left = await bridge()
        .listWaitingTakes()
        .catch(() => null)
      if (left) setTakes(left)
      setBusy(null)
      setCounted(null)
      focusMessage.current = true
      setMessage(discardedMessage(gone, ids.length))
    }
  }

  if (takes.length === 0 && !message) return null

  return (
    <section className="panel waiting">
      <div className="waiting-head">
        <p className="micro-label">waiting to retry</p>
        {takes.length > 1 && (
          <span className="waiting-actions">
            <button className="btn quiet-btn" disabled={busy !== null} onClick={() => void retry(takes.map((t) => t.id))}>
              retry all
            </button>
            <button
              ref={discardAllRef}
              className="btn quiet-btn"
              disabled={busy !== null}
              aria-expanded={questionOpen}
              aria-controls={questionOpen ? 'discard-all-confirm' : undefined}
              onClick={openAll}
            >
              discard all
            </button>
          </span>
        )}
      </div>
      {questionOpen && counted && (
        <AskFirst
          id="discard-all-confirm"
          question={discardAllQuestion(shownCount)}
          confirm={deleting ? 'discarding' : `discard ${shownCount}`}
          busy={busy !== null}
          onConfirm={() => void discardAll(asked)}
          onKeep={keepAll}
        />
      )}
      {takes.length > 0 && (
        <p className="dim waiting-intro">
          Recorded but not transcribed. The audio stays on this computer until you retry or discard it.
        </p>
      )}
      {/* Always mounted, so screen readers hear a new message. */}
      <p className={message ? 'waiting-message' : 'visually-hidden'} ref={messageRef} tabIndex={-1} role="status">
        {message}
      </p>
      <div className="log-list">
        {takes.map((take) => (
          <div className="log-entry" key={take.id}>
            <div className="log-meta">
              <span className="mono-inline dim">{whenOf(take.savedAt)}</span>
              <span className="mono-inline note-tag">{take.kind}</span>
              <span className="mono-inline dim">{lengthOf(take.audioMs)}</span>
              <span className="waiting-actions">
                <button className="btn quiet-btn" disabled={busy !== null} onClick={() => void retry([take.id])}>
                  {busy === take.id ? 'retrying' : 'retry'}
                </button>
                <button
                  className={`btn ${confirming === take.id ? 'danger-btn' : 'quiet-btn'}`}
                  disabled={busy !== null}
                  // The second click of a double click never answers
                  // delete audio?, and neither does a held Enter.
                  onClick={(e) => {
                    if (e.detail > 1 && confirming === take.id) return
                    void discard(take.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.repeat) e.preventDefault()
                  }}
                >
                  {confirming === take.id ? 'delete audio?' : 'discard'}
                </button>
              </span>
            </div>
            <p className="waiting-reason dim">not transcribed: {reasonText(take)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function HomeView(props: {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => Promise<void>
}): React.JSX.Element {
  const [events, setEvents] = useState<SessionEvent[]>([])
  // The empty state waits for the list, so a full history never flashes
  // the first-run invitation while it loads.
  const [loaded, setLoaded] = useState(false)
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  // Clear all asks first (US-099): the whole log's count while the
  // question is open, null while it is closed.
  const [clearAsk, setClearAsk] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState<string | null>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const clearedRef = useRef<HTMLParagraphElement>(null)
  // While the count is on its way, and when the question opened: a
  // second click of a double click never closes it again.
  const counting = useRef(false)
  const askedAt = useRef(0)
  useEffect(() => {
    if (cleared) clearedRef.current?.focus()
  }, [cleared])
  const askClear = (): void => {
    if (counting.current) return
    if (clearAsk !== null) {
      if (performance.now() - askedAt.current >= DOUBLE_CLICK_MS) setClearAsk(null)
      return
    }
    setCleared(null)
    counting.current = true
    void bridge()
      .countHistory()
      .then(async (count) => {
        if (count > 0) {
          askedAt.current = performance.now()
          setClearAsk(count)
          return
        }
        // Retention already emptied it: show that instead of asking.
        setEvents(await bridge().listHistory())
      })
      .catch((error: unknown) => console.error('[murmur] could not count history:', error))
      .finally(() => {
        counting.current = false
      })
  }
  const keepHistory = (): void => {
    setClearAsk(null)
    clearRef.current?.focus()
  }
  const clearAll = async (): Promise<void> => {
    setClearing(true)
    try {
      const removed = await bridge().clearHistory()
      setEvents([])
      window.dispatchEvent(new Event(HISTORY_CLEARED))
      setCleared(removed === 1 ? 'Cleared 1 entry.' : `Cleared ${removed.toLocaleString()} entries.`)
    } catch (error) {
      console.error('[murmur] clear all failed:', error)
      setCleared('Could not clear your history. Try again in a moment.')
    } finally {
      setClearing(false)
      setClearAsk(null)
    }
  }
  const typingWpm = props.settings.timeBack.typingWpm
  const today = useToday()

  useEffect(() => {
    void bridge()
      .listHistory()
      .then((list) => {
        setEvents(list)
        setLoaded(true)
      })
    // Unsubscribe on unmount, and cap live growth to match the list
    // handler so a long-running hidden window never accumulates state.
    return bridge().onHistoryAppended((event) => {
      setEvents((prev) => [...prev, event].slice(-500))
      // Clear all clears what lands while it asks too, so it counts it.
      setClearAsk((count) => (count === null ? count : count + 1))
      setCleared(null)
    })
  }, [])

  // Time back is computed in main from the whole log at the typing
  // speed in settings, so a speed edit restates the card at once.
  useEffect(() => {
    const load = (): void => {
      void bridge().getAnalytics().then(setSummary)
    }
    load()
    return bridge().onHistoryAppended(() => load())
    // A new day (the window left open past midnight) reloads too, so
    // back today and the typical day never belong to yesterday.
  }, [typingWpm, today])

  const copy = async (event: SessionEvent): Promise<void> => {
    await bridge().copyText(event.finalText)
    setCopiedAt(event.at)
    setTimeout(() => setCopiedAt((c) => (c === event.at ? null : c)), 1500)
  }

  const grouped = groupByDay(events)
  // The how-to teaches the first few dictations, then gets out of the
  // way for good (US-086): once five exist it is remembered, so a Clear
  // all or a retention cut never brings it back. An empty log already
  // says how to start.
  const dictated = events.filter(countsTowardStats).length
  if (dictated >= 5) rememberHowToDone()
  const showHowTo = grouped.length > 0 && dictated < 5 && !howToDone()

  return (
    <div className="home">
      <PageTitle title="Today" sub={today} />
      {showHowTo && (
        <section className="panel howto">
          <p className="dim">
            Hold <span className="kbd">{props.settings.hotkey.binding}</span>, speak, release. Text lands at your
            cursor.
          </p>
        </section>
      )}
      <WhatsNew settings={props.settings} onUpdateSettings={props.onUpdateSettings} />
      <WaitingTakes pasteLastBinding={props.settings.hotkey.pasteLastBinding} />
      {events.some(countsTowardStats) && summary && (
        <section className="panel">
          <p className="micro-label">back today</p>
          <div
            className="timeback-value"
            title={`Typing at ${typingWpm} wpm, minus the time you spent speaking`}
          >
            {formatMinutesBack(summary.today.minutesBack)}
          </div>
          {summary.typicalBack !== null && (
            <DayStroke share={typicalShare(summary.today.minutesBack, summary.typicalBack)} day={dayKey(Date.now())} />
          )}
          <p className="timeback-typical">
            {summary.typicalBack === null
              ? `Today is measured against your typical day once you have ${TYPICAL_MIN_DAYS} days of dictation in the last four weeks, not counting today.`
              : summary.typicalBack > 0
                ? typicalLine(typicalShare(summary.today.minutesBack, summary.typicalBack), summary.typicalBack)
                : 'Your typical day has no time back yet, so today stands on its own.'}
          </p>
          <p className="timeback-spans">
            {formatMinutesBack(summary.month.minutesBack)} this month ·{' '}
            {formatMinutesBack(summary.lifetime.minutesBack)} lifetime
          </p>
        </section>
      )}
      <LastNoteRow />
      {loaded && grouped.length === 0 && (
        <EmptyState title="Nothing here yet." hotkey={props.settings.hotkey.binding} after="Every dictation lands here." />
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
                  {event.retried && <span className="mono-inline dim">retried</span>}
                  <button className="btn quiet-btn log-copy" onClick={() => void copy(event)}>
                    {copiedAt === event.at ? 'copied' : 'copy'}
                  </button>
                </div>
                {event.kind === 'transform' && !event.unsent && (
                  <p className="log-instruction dim">you said: {event.rawText}</p>
                )}
                {event.kind === 'transform' && event.unsent && (
                  <p className="log-instruction dim">
                    {event.retried
                      ? 'retried after the text it was for was gone; your instruction is kept below'
                      : 'the selection was too long to send; your words are kept below'}
                  </p>
                )}
                {event.kind === 'transform' && !event.unsent && <p className="micro-label log-original">original</p>}
                <p className="log-text">{event.finalText}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {(events.length > 0 || cleared) && (
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
                ref={clearRef}
                className="btn quiet-btn"
                disabled={clearing || events.length === 0}
                aria-expanded={clearAsk !== null}
                aria-controls={clearAsk !== null ? 'clear-all-confirm' : undefined}
                onClick={askClear}
              >
                Clear all
              </button>
            </div>
          </div>
          {clearAsk !== null && (
            <AskFirst
              id="clear-all-confirm"
              question={clearAllQuestion(clearAsk)}
              confirm={clearing ? 'clearing' : `clear ${clearAsk.toLocaleString()}`}
              keep={clearAsk === 1 ? 'keep it' : undefined}
              busy={clearing}
              onConfirm={() => void clearAll()}
              onKeep={keepHistory}
            />
          )}
          {/* Always mounted, so screen readers hear the result. */}
          <p className={cleared ? 'waiting-message' : 'visually-hidden'} ref={clearedRef} tabIndex={-1} role="status">
            {cleared}
          </p>
        </section>
      )}
    </div>
  )
}
