// SPDX-License-Identifier: GPL-3.0-only
// The home view (US-147): a rail beside the page, then takes waiting to
// retry, today's time back beside the last note, and your dictations
// under their own heading, a day at a time, newest first, updating live
// as dictations land.
import { useEffect, useRef, useState } from 'react'
import changelogRaw from '../../../CHANGELOG.md?raw'
import { type AnalyticsSummary, TYPICAL_MIN_DAYS, typicalShare } from '../../shared/analytics'
import { sectionFor } from '../../shared/changelog'
import {
  KEEP_24_HOURS,
  KEEP_FOREVER,
  KEEP_NO_TEXT,
  type SealStatus,
  type SessionEvent,
  WORDS_HIDDEN,
  countsTowardStats,
  dayKey,
  groupByDay,
  hasText
} from '../../shared/history'
import { type LastNote, lastNoteLine, receiptWhere, revealLabel } from '../../shared/receipt'
import { formatMinutesBack } from '../../shared/timeback'
import { heardWords, offersWhatYouSaid } from '../../shared/word-diff'
import { type ProFacts, shouldOfferPro, thanksDue } from '../../shared/proMark'
import type { SettingsApi } from '../../preload/settings'
import type { WaitingTake } from '../../main/transcribe/recovery'
import type { Settings } from '../../shared/settings'
import { useToday } from './PageTitle'
import { DayStroke } from './DayStroke'
import { EmptyState } from './EmptyState'
import { AskFirst } from './AskFirst'
import { Switch } from './controls'
import { TakeWords } from './HideWords'
import { HomeRail, OVERVIEW, SidebarIcon, WAITING } from './HomeRail'
import { LAND_RING_MS, LandRing } from './LandRing'
import {
  HOME_TAKES,
  dayCount,
  dayTitle,
  isOpen,
  railDays,
  railHidden,
  railIsHidden,
  railKey,
  rememberRailHidden,
  searchDays,
  searchLine,
  showingLine
} from './homeDays'
import { ProMark } from './ProMark'
import { ReportTake } from './ReportPanel'

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

  // 1 line beside the title; the notes open under it (US-147).
  return (
    <>
      <button
        className="whats-new-line"
        aria-expanded={open}
        aria-controls={open ? 'whats-new-body' : undefined}
        onClick={() => {
          setOpen((o) => !o)
          if (unseen) void props.onUpdateSettings({ whatsNewSeenVersion: version })
        }}
      >
        {unseen && <span className="whats-new-dot" aria-hidden="true" />}
        What&apos;s new in {version}
        {unseen && <span className="visually-hidden">, unread</span>}
      </button>
      {open && (
        <pre className="whats-new-body" id="whats-new-body">
          {section}
        </pre>
      )}
    </>
  )
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Why a take is waiting, in plain words (US-068). */
function reasonText(take: WaitingTake): string {
  const f = take.failure
  if (!f) return 'saved before murmur kept reasons'
  if (f.kind === 'auth') {
    return f.detail === 'no API key configured' ? 'no API key was saved' : 'the provider did not accept the key'
  }
  if (f.kind === 'network') return 'murmur could not reach the provider'
  if (f.kind === 'plainhttp') {
    return 'the provider address is not encrypted, so nothing was sent; confirm it under Base URL in Settings'
  }
  if (f.kind === 'timeout') return 'the provider did not answer in time'
  if (f.kind === 'server') return 'the provider had a problem on its end'
  if (f.kind === 'badrequest') return 'the provider refused the audio or the model name'
  if (f.kind === 'nospeech') return 'no speech was heard in it'
  return 'something went wrong'
}

/** A waiting take's line. A hands-free take parked on sleep, quit, or
 *  Escape (US-117) was never tried, so it says when it was saved instead.
 *  A held take was transcribed, and only its recording waits (US-137). */
export function waitingLine(take: WaitingTake, platform: 'darwin' | 'win32'): string {
  const f = take.failure
  if (f?.kind === 'held') return 'never reached an app, so its recording goes after 24 hours'
  if (f?.kind === 'unlogged') return 'transcribed, but its words could not be saved'
  if (f?.kind === 'parked') {
    if (f.detail === 'quit') return 'saved when murmur quit'
    if (f.detail === 'cancel') return 'saved when you cancelled it'
    return `saved when your ${platform === 'darwin' ? 'Mac' : 'PC'} went to sleep`
  }
  return `not transcribed: ${reasonText(take)}`
}

/** The line above the waiting takes. A held take was transcribed, and so
 *  was one the log refused, so the usual line would be false for both,
 *  and under 24 hours and Don't keep a failed take goes too. */
export function waitingIntro(takes: readonly WaitingTake[], retentionDays: number): string {
  const held = takes.filter((take) => take.loggedAt !== undefined).length
  const unsaved = takes.filter((take) => take.loggedAt === undefined && take.failure?.kind === 'unlogged').length
  const failed = takes.length - held - unsaved
  const goes = 'after 24 hours, the next time murmur runs'
  const short = retentionDays === KEEP_24_HOURS || retentionDays === KEEP_NO_TEXT
  const stays = short
    ? `The audio stays on this computer until you retry or discard it, or it goes ${goes}.`
    : 'The audio stays on this computer until you retry or discard it.'
  if (failed === takes.length) return `Recorded but not transcribed. ${stays}`
  if (held === takes.length) {
    return `Transcribed, but the words never reached an app. Retry brings them back from the audio, which stays on this computer and goes ${goes}.`
  }
  if (unsaved === takes.length) return `Transcribed, but the words could not be saved. Retry sends the audio to your provider again. ${stays}`
  const parts = [
    failed > 0 ? 'were not transcribed' : '',
    held > 0 ? 'never reached an app' : '',
    unsaved > 0 ? 'were transcribed but could not be saved' : ''
  ].filter((part) => part !== '')
  const mixed = parts.length === 3 ? `Some takes ${parts[0]}, some ${parts[1]}, and some ${parts[2]}.` : `Some takes ${parts.join(', and some ')}.`
  return short || held === 0 ? `${mixed} ${stays}` : `${mixed} ${stays} A take that never reached an app goes ${goes}.`
}

/** What Home says when a retry delivered nothing. A take the log refused
 *  was transcribed, so could not transcribe would be false for it. */
export function retryFailedMessage(kinds: readonly string[]): string {
  const stays = 'The reason is updated below; the audio stays until you retry or discard it, or your Keep history limit passes.'
  const unsaved = kinds.filter((kind) => kind === 'unlogged').length
  if (unsaved === 0) return `Still could not transcribe. ${stays}`
  return unsaved === kinds.length ? `Transcribed, but the words still could not be saved. ${stays}` : `Still not delivered. ${stays}`
}

/** What Keep history does at each setting. */
export function keepLine(retentionDays: number): string {
  const here = 'Everything stays on this machine.'
  if (retentionDays === KEEP_NO_TEXT) {
    return 'No words are saved to disk, and your numbers, belts, and paintings keep counting. Takes stay here in memory until you quit murmur. A take that reached neither an app nor your clipboard keeps its recording for Retry, as does one waiting to retry. Those recordings go after 24 hours, the next time murmur runs. Notes still land in your notes folder.'
  }
  if (retentionDays === KEEP_24_HOURS) {
    return `Words go after 24 hours, and your numbers, belts, and paintings keep counting. Recordings waiting to retry go after 24 hours, the next time murmur runs. ${here}`
  }
  if (retentionDays === KEEP_FOREVER) return `Entries stay until you clear them. ${here}`
  return `Older entries are removed automatically, with their numbers. ${here}`
}

/** Home's 1-line summary of Keep history (US-148), beside the link to
 *  Settings, History. */
export function keptLine(retentionDays: number): string {
  if (retentionDays === KEEP_NO_TEXT) return 'Words are not kept on this computer.'
  if (retentionDays === KEEP_24_HOURS) return 'Words are kept 24 hours on this computer.'
  if (retentionDays === KEEP_FOREVER) return 'Kept on this computer until you clear it.'
  if (retentionDays === 365) return 'Kept a year on this computer.'
  return `Kept ${retentionDays} days on this computer.`
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
function LastNoteRow(props: { hide: boolean }): React.JSX.Element | null {
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
          <p className="last-note-line">{lastNoteLine(note, props.hide)}</p>
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
export const DOUBLE_CLICK_MS = 500

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

const entries = (count: number): string => `${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'}`

/** What a shorter Keep history removes, said before it happens (US-137).
 *  Empty when it removes nothing. */
export function shorterKeepQuestion(retentionDays: number, takes: number, recordings: number): string {
  const wordsOnly = retentionDays === KEEP_24_HOURS || retentionDays === KEEP_NO_TEXT
  const parts = [
    takes > 0 ? (wordsOnly ? `the words of ${entries(takes)}` : entries(takes)) : '',
    recordings > 0 ? `${recordings.toLocaleString()} ${recordings === 1 ? 'recording' : 'recordings'} waiting to retry` : ''
  ].filter((part) => part.length > 0)
  if (parts.length === 0) return ''
  const numbers = wordsOnly
    ? ' Your numbers and belts stay.'
    : takes > 0
      ? ' Their numbers go too, so your totals drop.'
      : ''
  return `This removes ${parts.join(' and ')} now, and it cannot be undone.${numbers}`
}

const WORDS_NOT_KEPT = 'Words not kept, so what you said and report are not available for this take.'
const WORDS_LOCKED = 'Words encrypted with a key this computer cannot open, so they stay saved but cannot be shown.'

/** What the Encrypt saved words switch means right now (US-138). It
 *  protects the file on disk, not the screen, and says so. */
export function sealLine(status: SealStatus): string {
  const base =
    status.state === 'sealed'
      ? "Saved words are encrypted on disk with a key your system's secure storage holds, so a copied history file or folder cannot be read elsewhere. This protects the file, not your screen: for that, use Hide words. Notes stay plain files."
      : status.state === 'unavailable'
        ? "This computer's secure storage is not available, so saved words stay as plain text. murmur encrypts them once it is."
        : "Saved words are plain text in murmur's data folder, so other programs and backups can read them. Notes stay plain files."
  const unreadable = status.unreadable > 0 ? ` ${entries(status.unreadable)} cannot be read on this computer, so ${status.unreadable === 1 ? 'it shows' : 'they show'} numbers only.` : ''
  const pending = status.pending > 0 ? ` ${entries(status.pending)} could not be encrypted yet. murmur tries again the next time it starts.` : ''
  return `${base}${unreadable}${pending}`
}

/** The words as heard, with what cleanup removed struck through (US-128).
 *  The clipboard is touched only on the click, and Hide words (US-145)
 *  leaves the count and the copy. */
export function WhatYouSaid(props: { id: string; event: SessionEvent; hide: boolean }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const words = heardWords(props.event.rawText, props.event.finalText)
  const removed = words.filter((word) => word.removed).length
  return (
    <div className="log-said" id={props.id}>
      <p className="micro-label log-original">what you said</p>
      {props.hide ? (
        <p className="log-text dim">{WORDS_HIDDEN}</p>
      ) : (
        <p className="log-text dim">
          {words.map((word, index) => (
            <span key={index}>
              {index > 0 && ' '}
              {word.removed ? <s className="log-removed">{word.text}</s> : word.text}
            </span>
          ))}
        </p>
      )}
      <p className="log-said-foot">
        <span className="mono-inline dim">{removed === 0 ? 'words changed' : `${removed} removed`}</span>
        <button
          className="btn quiet-btn"
          onClick={() => {
            void bridge()
              .copyText(props.event.rawText)
              .then(() => setCopied(true))
          }}
        >
          {copied ? 'copied' : 'Copy what you said'}
        </button>
      </p>
    </div>
  )
}

/** What a log row says under its time and numbers. */
export function LogWords(props: { event: SessionEvent; hide: boolean }): React.JSX.Element {
  const { event, hide } = props
  return (
    <>
      {event.kind === 'transform' && !event.unsent && hasText(event) && !hide && (
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
      {hasText(event) ? (
        <TakeWords text={event.finalText} hide={hide} />
      ) : (
        <p className="log-text dim">{event.unreadable ? WORDS_LOCKED : WORDS_NOT_KEPT}</p>
      )}
    </>
  )
}

/** The result line after one retried dictation: the clipboard is
 *  untouched. The paste-last chord is named only while it is armed; a
 *  saved chord that is disarmed (it clashes with another hotkey or no
 *  longer parses) does nothing, so the line points at the log instead. */
export function retriedDictationMessage(pasteLastBinding: string, pasteArmed: boolean, untilQuit = false): string {
  const paste =
    pasteLastBinding && pasteArmed
      ? ` Press ${pasteLastBinding} in any app to paste them there.`
      : ' Click copy on it in the log below.'
  return `Done: the words are in your log${untilQuit ? ' until you quit murmur' : ''}.${paste}`
}

/**
 * Takes that were recorded but not transcribed (US-068), and under Don't
 * keep, takes whose words reached no app (US-137). Retry runs the
 * saved audio through the normal pipeline with today's settings; the
 * words land in the log, where paste-last finds a dictation, and the
 * clipboard is left alone (LaBroi, 2026-11-01). Discard asks once, then deletes the audio.
 * Discard all (US-096) asks in place, with the count, before deleting:
 * the question counts the takes listed when it opened, and only those
 * are deleted, so a take that fails while it is open is kept. Keep them
 * has focus, so a double press never deletes. One question at a time.
 */
function WaitingTakes(props: {
  retentionDays: number
  pasteLastBinding: string
  pasteArmed: boolean
}): React.JSX.Element | null {
  const untilQuit = props.retentionDays === KEEP_NO_TEXT
  const untilQuitWords = untilQuit ? ' until you quit murmur' : ''
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
    const failures: string[] = []
    for (const id of ids) {
      setBusy(id)
      const result = await bridge().retryTake(id)
      if (result.ok) done.push({ kind: result.kind, location: result.location })
      else failures.push(result.failure.kind)
    }
    setBusy(null)
    if (done.length === 1 && failures.length === 0) {
      const { kind, location } = done[0]
      setMessage(
        kind === 'note'
          ? location === 'history'
            ? `Transcribed, but the note could not be written to your notes folder or murmur's data folder. The words are safe in your log${untilQuitWords}.`
            : `Done: the note is filed under the time you spoke it, and it is in your log${untilQuitWords}.`
          : kind === 'transform'
            ? `Done: your instruction is in the log${untilQuitWords}. The text it was for is gone, so nothing was changed.`
            : retriedDictationMessage(props.pasteLastBinding, props.pasteArmed, untilQuit)
      )
    } else if (done.length > 0) {
      setMessage(
        `${done.length} delivered to your log${untilQuitWords}${failures.length > 0 ? `, ${failures.length} still waiting` : ''}.`
      )
    } else {
      setMessage(retryFailedMessage(failures))
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
  const platform = navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32'

  return (
    <section className="panel waiting waiting-strip" id="home-waiting" data-place={WAITING} tabIndex={-1} aria-label="Waiting to retry">
      <div className="waiting-head">
        <p className="micro-label">
          waiting to retry
          <span className="rail-dot" aria-hidden="true" />
        </p>
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
        <p className="dim waiting-intro">{waitingIntro(takes, props.retentionDays)}</p>
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
            <p className="waiting-reason dim">{waitingLine(take, platform)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Your dictations (US-147): the heading with what is kept, then a day
 *  at a time. A folded day draws no rows; a search keeps the days with a
 *  match, opens them, and says how many matched. While Hide words is on
 *  the search is off, whatever was typed. */
export function HomeHistory(props: {
  grouped: ReadonlyArray<{ day: string; events: SessionEvent[] }>
  /** How many takes Home holds, for the heading. */
  shown: number
  query: string
  picks: Readonly<Record<string, boolean>>
  now: number
  settings: Settings
  onPick: (day: string, open: boolean) => void
  onClearSearch: () => void
  onOpenHistory: () => void
}): React.JSX.Element {
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [openSaid, setOpenSaid] = useState<number | null>(null)
  const [openReport, setOpenReport] = useState<number | null>(null)
  const { grouped, now } = props
  const hide = props.settings.history.hideWords
  const found = searchDays(grouped, props.query, hide)

  const copy = async (event: SessionEvent): Promise<void> => {
    await bridge().copyText(event.finalText)
    setCopiedAt(event.at)
    setTimeout(() => setCopiedAt((c) => (c === event.at ? null : c)), 1500)
  }

  return (
    <section className="history" aria-labelledby="home-history-title">
      <div className="history-head">
        <h2 id="home-history-title">Your dictations</h2>
        {/* Keep history, Encrypt saved words, and Clear all live in
            Settings, History (US-148); Home says the rule and links there. */}
        <p className="dim history-kept">
          {showingLine(props.shown)} {keptLine(props.settings.history.retentionDays)}{' '}
          <button className="link-btn" onClick={props.onOpenHistory}>
            History settings
          </button>
        </p>
      </div>
      {/* Always mounted, so screen readers hear the count change. The
          way out of a search is here too: the rail, and its search box,
          may be hidden while a search is still on. */}
      <div className={found.searching ? 'history-found' : 'visually-hidden'}>
        <p role="status">{found.searching ? searchLine(found.matches) : ''}</p>
        {found.searching && (
          <button className="link-btn" onClick={props.onClearSearch}>
            Clear search
          </button>
        )}
      </div>
      {found.groups.map((group) => {
        const open = found.searching || isOpen(group.day, props.picks, now)
        const total = grouped.find((g) => g.day === group.day)?.events.length ?? group.events.length
        return (
          <section className="day" key={group.day} id={`day-${group.day}`} data-place={group.day}>
            <h3 className="day-h">
              <button
                className={group.day === dayKey(now) ? 'day-head day-head-today' : 'day-head'}
                aria-expanded={open}
                aria-controls={open ? `day-rows-${group.day}` : undefined}
                // A search holds its days open, so there is nothing to fold.
                disabled={found.searching}
                onClick={() => props.onPick(group.day, !open)}
              >
                <svg className={`day-chevron ${open ? 'day-chevron-open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 3l3 3-3 3" />
                </svg>
                <span className="day-name">{dayTitle(group.day, now)}</span>
                <span className="day-count">
                  {found.searching ? `${group.events.length.toLocaleString()} of ${total.toLocaleString()} match` : dayCount(group.events)}
                </span>
              </button>
            </h3>
            {/* A folded day draws no rows, so a long history stays fast. */}
            {open && (
              <div className="log-list" id={`day-rows-${group.day}`}>
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
                      {props.settings.history.retentionDays === KEEP_NO_TEXT && hasText(event) && (
                        <span className="mono-inline dim">until you quit</span>
                      )}
                      {offersWhatYouSaid(event) && (
                        <button
                          className="btn quiet-btn log-said-toggle"
                          aria-expanded={openSaid === event.at}
                          aria-controls={`said-${event.at}`}
                          onClick={() => setOpenSaid(openSaid === event.at ? null : event.at)}
                        >
                          what you said
                        </button>
                      )}
                      {event.kind !== 'transform' && hasText(event) && (
                        <button
                          className="btn quiet-btn log-said-toggle"
                          aria-expanded={openReport === event.at}
                          aria-controls={`report-${event.at}`}
                          onClick={() => setOpenReport(openReport === event.at ? null : event.at)}
                        >
                          report
                        </button>
                      )}
                      {hasText(event) && (
                        <button className="btn quiet-btn log-copy" onClick={() => void copy(event)}>
                          {copiedAt === event.at ? 'copied' : 'copy'}
                        </button>
                      )}
                    </div>
                    {openSaid === event.at && <WhatYouSaid id={`said-${event.at}`} event={event} hide={hide} />}
                    {openReport === event.at && (
                      <ReportTake
                        id={`report-${event.at}`}
                        event={event}
                        settings={props.settings}
                        hide={hide}
                        onClose={() => setOpenReport(null)}
                      />
                    )}
                    <LogWords event={event} hide={hide} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </section>
  )
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
const MOD = IS_MAC ? 'Cmd' : 'Ctrl'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Focus for the rail as it appears: its search, or while Hide words has
 *  the search off, the button beside it, so the keyboard is never dropped. */
function focusRail(search: HTMLInputElement | null): void {
  if (search && !search.disabled) search.focus()
  else document.querySelector<HTMLElement>('.home-rail [aria-label="Hide sidebar"]')?.focus()
}

/** True while the window is too narrow for the rail beside the page. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const onChange = (): void => setNarrow(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return narrow
}
const NARROW = '(max-width: 720px)'

/** How many takes wait to retry, for the rail's line. */
function useWaitingCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const load = (): void => {
      void bridge()
        .listWaitingTakes()
        .then((takes) => setCount(takes.length))
    }
    load()
    return bridge().onWaitingTakesChanged(load)
  }, [])
  return count
}

export function HomeView(props: {
  settings: Settings
  onUpdateSettings: (partial: Partial<Settings>) => Promise<void>
  /** The app-level license truth; null while it loads. */
  license: ProFacts | null
  onUpdatePro: (patch: Partial<Settings['pro']>) => Promise<void>
  /** Opens the Pro section in settings. */
  onSeePro: () => void
  /** Opens Settings at History, where Keep history and Clear all live. */
  onOpenHistory: () => void
  /** False when the saved paste-last chord is disarmed (main's hotkey
   *  status), so Home never names a chord that does nothing. */
  pasteArmed: boolean
}): React.JSX.Element {
  const [events, setEvents] = useState<SessionEvent[]>([])
  // The empty state waits for the list, so a full history never flashes
  // the first-run invitation while it loads.
  const [loaded, setLoaded] = useState(false)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const typingWpm = props.settings.timeBack.typingWpm
  const today = useToday()

  // The thank-you after an activation shows on this Home visit only
  // (US-107): the record clears as it shows, and this visit keeps it.
  const [thanks, setThanks] = useState(false)
  const due = thanksDue(props.license, props.settings.pro.thanksPending)
  const { onUpdatePro } = props
  useEffect(() => {
    if (due) {
      setThanks(true)
      void onUpdatePro({ thanksPending: false })
    }
  }, [due, onUpdatePro])

  // One dim line, once ever, 30 calendar days after installing (US-107).
  const offerPro = shouldOfferPro({
    installedAt: props.settings.installedAt,
    now: Date.now(),
    done: props.settings.pro.offerDone,
    status: props.license
  })

  useEffect(() => {
    void bridge()
      .listHistory()
      .then((list) => {
        setEvents(list.slice(-HOME_TAKES))
        setLoaded(true)
      })
    // Unsubscribe on unmount, and cap live growth to match the list
    // handler so a long-running hidden window never accumulates state.
    return bridge().onHistoryAppended((event) => {
      setEvents((prev) => [...prev, event].slice(-HOME_TAKES))
    })
  }, [])

  useEffect(() => {
    return bridge().onHistoryChanged(() => void bridge().listHistory().then((list) => setEvents(list.slice(-HOME_TAKES))))
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

  const hide = props.settings.history.hideWords
  const now = Date.now()
  const grouped = groupByDay(events)
  // The how-to teaches the first few dictations, then gets out of the
  // way for good (US-086): once five exist it is remembered, so a Clear
  // all or a retention cut never brings it back. An empty log already
  // says how to start.
  const dictated = events.filter(countsTowardStats).length
  if (dictated >= 5) rememberHowToDone()
  const showHowTo = grouped.length > 0 && dictated < 5 && !howToDone()

  // The rail (US-147): hidden by choice and remembered, or tucked away
  // while the window is too narrow for 2 columns.
  const narrow = useNarrow()
  const [remembered, setRemembered] = useState(() => railHidden(storage()))
  const [narrowOpen, setNarrowOpen] = useState(false)
  const hidden = railIsHidden(narrow, narrowOpen, remembered)
  const searchRef = useRef<HTMLInputElement>(null)
  const showRef = useRef<HTMLButtonElement>(null)
  // Where focus goes once the rail has been drawn or taken away.
  const focusNext = useRef<'search' | 'show' | null>(null)
  // Hiding the sidebar by hand moves Hide words beside the title; a
  // brush loop is drawn around it there for a moment, so the eye finds it.
  const [landing, setLanding] = useState(0)
  useEffect(() => {
    if (!landing) return undefined
    const timer = window.setTimeout(() => setLanding(0), LAND_RING_MS)
    return () => window.clearTimeout(timer)
  }, [landing])
  const setHidden = (next: boolean): void => {
    setLanding(next ? Date.now() : 0)
    if (narrow) setNarrowOpen(!next)
    else {
      setRemembered(next)
      rememberRailHidden(storage(), next)
    }
  }
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const setHiddenRef = useRef(setHidden)
  setHiddenRef.current = setHidden
  useEffect(() => {
    if (focusNext.current === 'search' && !hidden) focusRail(searchRef.current)
    if (focusNext.current === 'show' && hidden) showRef.current?.focus()
    focusNext.current = null
  }, [hidden])

  // Cmd+\ hides and shows the rail, and Cmd+F goes to its search (Ctrl
  // on Windows). A dialog over the page keeps the keyboard to itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const asked = railKey(e, IS_MAC)
      if (!asked || document.querySelector('[role="dialog"], dialog[open]')) return
      e.preventDefault()
      if (asked === 'toggle') {
        // Focus follows: to the rail as it appears, to Show sidebar as it goes.
        focusNext.current = hiddenRef.current ? 'search' : 'show'
        setHiddenRef.current(!hiddenRef.current)
      } else if (hiddenRef.current) {
        focusNext.current = 'search'
        setHiddenRef.current(false)
      } else focusRail(searchRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Search and folding. A day the person opened or folded stays that
  // way; a search opens every day it keeps.
  const [query, setQuery] = useState('')
  // Hide words drops what was typed, so turning it off again never
  // brings back a search nobody can see.
  useEffect(() => {
    if (hide) setQuery('')
  }, [hide])
  const [picks, setPicks] = useState<Record<string, boolean>>({})
  const rail = railDays(grouped, now)
  const waiting = useWaitingCount()
  const [goal, setGoal] = useState<{ place: string } | null>(null)

  // After a rail click has opened its day: scroll there, and take the
  // keyboard along.
  useEffect(() => {
    if (!goal) return
    const id = goal.place === OVERVIEW ? 'home-overview' : goal.place === WAITING ? 'home-waiting' : `day-${goal.place}`
    const el = document.getElementById(id)
    if (el) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
      const focus = el.querySelector<HTMLElement>('.day-head, h1') ?? el
      focus.focus({ preventScroll: true })
    }
    setGoal(null)
  }, [goal])

  const go = (place: string): void => {
    if (place !== OVERVIEW && place !== WAITING) {
      // A day the search left out is still a day to go to.
      setQuery('')
      setPicks((prev) => ({ ...prev, [place]: true }))
    }
    setGoal({ place })
  }

  return (
    <div className={`home-layout ${hidden ? 'home-rail-off' : ''}`}>
      {!hidden && (
        <HomeRail
          settings={props.settings}
          onUpdate={props.onUpdateSettings}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          waiting={waiting}
          days={rail.days}
          older={rail.older}
          onGo={go}
          onHide={() => {
            focusNext.current = 'show'
            setHidden(true)
          }}
          hideKeys={`${MOD}+\\`}
          searchKeys={`${MOD}+F`}
        />
      )}
      <div className="home">
        <div className="home-head" id="home-overview" data-place={OVERVIEW}>
          {hidden && (
            <button
              ref={showRef}
              className="icon-btn icon-btn-edge"
              aria-label="Show sidebar"
              title={`Show sidebar (${MOD}+\\)`}
              onClick={() => {
                focusNext.current = 'search'
                setHidden(false)
              }}
            >
              <SidebarIcon />
            </button>
          )}
          <header className="page-title">
            <h1 tabIndex={-1}>Home</h1>
            <p className="dim">{today}</p>
          </header>
          <WhatsNew settings={props.settings} onUpdateSettings={props.onUpdateSettings} />
          {/* The rail holds Hide words; with the rail hidden the switch
              moves here, so it is always 1 click away on Home. */}
          {hidden && (
            <div className={landing ? 'home-head-hide home-head-hide-landing' : 'home-head-hide'} id="home-hide-words">
              {landing > 0 && <LandRing key={landing} />}
              <span>Hide words</span>
              <Switch
                checked={hide}
                label="Hide words"
                onChange={(next) => void props.onUpdateSettings({ history: { hideWords: next } } as Partial<Settings>)}
              />
            </div>
          )}
        </div>
        {showHowTo && (
          <section className="panel howto">
            <p className="dim">
              Hold <span className="kbd">{props.settings.hotkey.binding}</span>, speak, release. Text lands at your
              cursor.
            </p>
          </section>
        )}
        {thanks && (
          <p className="pro-thanks">
            <ProMark state="filled" />
            <span>Thank you for keeping murmur free for everyone. Your Pro extras are on in settings.</span>
          </p>
        )}
        <WaitingTakes retentionDays={props.settings.history.retentionDays} pasteLastBinding={props.settings.hotkey.pasteLastBinding} pasteArmed={props.pasteArmed} />
        <div className="home-pair">
          {events.some(countsTowardStats) && summary && (
            <section className="panel home-timeback">
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
              {offerPro && (
                <p className="pro-offer-line">
                  murmur has given you back {formatMinutesBack(summary.lifetime.minutesBack)} so far. Pro is how it stays
                  free for everyone.{' '}
                  <button
                    className="link-btn"
                    onClick={() => {
                      void props.onUpdatePro({ offerDone: true })
                      props.onSeePro()
                    }}
                  >
                    See Pro
                  </button>{' '}
                  ·{' '}
                  <button className="link-btn" onClick={() => void props.onUpdatePro({ offerDone: true })}>
                    No thanks
                  </button>
                </p>
              )}
            </section>
          )}
          <LastNoteRow hide={hide} />
        </div>
        {loaded && grouped.length === 0 && (
          <EmptyState title="Nothing here yet." hotkey={props.settings.hotkey.binding} after="Every dictation lands here." />
        )}

        {grouped.length > 0 && (
          <HomeHistory
            grouped={grouped}
            shown={events.length}
            query={query}
            picks={picks}
            now={now}
            settings={props.settings}
            onPick={(day, open) => setPicks((prev) => ({ ...prev, [day]: open }))}
            onClearSearch={() => setQuery('')}
            onOpenHistory={props.onOpenHistory}
          />
        )}
      </div>
    </div>
  )
}
