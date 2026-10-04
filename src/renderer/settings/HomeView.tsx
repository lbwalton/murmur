// SPDX-License-Identifier: GPL-3.0-only
// The home view: takes waiting to retry, today's time back, then your
// transcription log, grouped by day, newest first, updating live as
// dictations land.
import { useEffect, useState } from 'react'
import changelogRaw from '../../../CHANGELOG.md?raw'
import type { AnalyticsSummary } from '../../shared/analytics'
import { sectionFor } from '../../shared/changelog'
import { type SessionEvent, countsTowardStats, groupByDay } from '../../shared/history'
import { type LastNote, receiptWhere, revealLabel } from '../../shared/receipt'
import { formatMinutesBack } from '../../shared/timeback'
import type { SettingsApi } from '../../preload/settings'
import type { WaitingTake } from '../../main/transcribe/recovery'
import type { Settings } from '../../shared/settings'
import { PageTitle, useToday } from './PageTitle'
import { EmptyState } from './EmptyState'

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

/**
 * Takes that were recorded but not transcribed (US-068). Retry runs the
 * saved audio through the normal pipeline with today's settings; the
 * words land in the log, and a dictation also on the clipboard, where
 * paste-last finds it. Discard asks once, then deletes the audio.
 */
function WaitingTakes(props: { pasteLastBinding: string }): React.JSX.Element | null {
  const [takes, setTakes] = useState<WaitingTake[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      void bridge().listWaitingTakes().then(setTakes)
    }
    load()
    return bridge().onWaitingTakesChanged(load)
  }, [])

  const retry = async (ids: string[]): Promise<void> => {
    setMessage(null)
    setConfirming(null)
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
      setConfirming(id)
      return
    }
    setConfirming(null)
    setTakes(await bridge().discardTake(id))
  }

  if (takes.length === 0 && !message) return null

  return (
    <section className="panel waiting">
      <div className="waiting-head">
        <p className="micro-label">waiting to retry</p>
        {takes.length > 1 && (
          <button className="btn quiet-btn" disabled={busy !== null} onClick={() => void retry(takes.map((t) => t.id))}>
            retry all
          </button>
        )}
      </div>
      {takes.length > 0 && (
        <p className="dim waiting-intro">
          Recorded but not transcribed. The audio stays on this computer until you retry or discard it.
        </p>
      )}
      {message && <p className="waiting-message">{message}</p>}
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
                <button className="btn quiet-btn" disabled={busy !== null} onClick={() => void discard(take.id)}>
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
  const typingWpm = props.settings.timeBack.typingWpm

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
  }, [typingWpm])

  const copy = async (event: SessionEvent): Promise<void> => {
    await bridge().copyText(event.finalText)
    setCopiedAt(event.at)
    setTimeout(() => setCopiedAt((c) => (c === event.at ? null : c)), 1500)
  }

  const grouped = groupByDay(events)
  const today = useToday()
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
