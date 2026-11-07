// SPDX-License-Identifier: GPL-3.0-only
// Session event shape and pure helpers for the history log. The log is
// the app's memory: analytics, recaps, and the rank system all read it.

export interface SessionEvent {
  /** Epoch milliseconds when the dictation finished. */
  at: number
  durationMs: number
  rawText: string
  finalText: string
  words: number
  wpm: number
  /** Local day key captured at record time. Timezone changes later must
   * never re-bucket history (a belt once earned stays earned), so this
   * is stored, not derived. Absent on old events; eventDay falls back. */
  day?: string
  /** Local hour (0-23) at record time, stored for the same reason. */
  hour?: number
  /** Where the words went: absent means the cursor, 'note' means a
   *  notes file (US-050). Notes count like any dictation everywhere.
   *  'transform' (US-054) is a spoken edit: rawText is the spoken
   *  instruction and finalText the ORIGINAL selection, so paste-last
   *  restores it. Transforms never count toward stats: the selected
   *  words were not dictated. */
  kind?: 'note' | 'transform'
  /** On a transform whose selection was never sent (too long), the
   *  entry keeps the spoken instruction as finalText so the thought is
   *  one paste-last away. */
  unsent?: boolean
  /** Delivered by a retry from the home tab (US-068), after the live
   *  transcription failed; logged at the time it was spoken. */
  retried?: boolean
  /** A transform's instruction length, kept when its words are removed. */
  instructionWords?: number
  /** Set on reading, never stored: its words are encrypted under a key
   *  this computer cannot open, so they still exist (US-138). */
  unreadable?: boolean
}

/** What the switch beside Keep history reports (US-138). */
export interface SealStatus {
  state: 'sealed' | 'plain' | 'unavailable'
  /** Sealed lines no key here can open. They read as numbers only. */
  unreadable: number
  /** Lines with words not sealed yet, after a sealing that failed. */
  pending: number
}

/** The Keep history values with their own meaning (US-137). Every other
 *  value is days, after which a whole entry goes. */
export const KEEP_FOREVER = 0
export const KEEP_24_HOURS = 1
export const KEEP_NO_TEXT = -1

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a take that reached no app holds its recording (US-137). */
export const HELD_RECORDING_MS = DAY_MS

/** Words older than this go while the numbers stay, so belts, stats, and
 *  the painting keep working. Null when this setting removes whole
 *  entries or nothing. */
export function textCutoff(retentionDays: number, now: number): number | null {
  if (retentionDays === KEEP_NO_TEXT) return Number.POSITIVE_INFINITY
  if (retentionDays === KEEP_24_HOURS) return now - DAY_MS
  return null
}

/** A transform's stroke weighs its spoken instruction, so that count
 *  outlives the words. */
export function withoutText(event: SessionEvent): SessionEvent {
  const instruction = event.kind === 'transform' ? { instructionWords: countWords(event.rawText) } : {}
  return { ...event, rawText: '', finalText: '', ...instruction }
}

/** What a row says in place of its words while Hide words is on (US-145). */
export const WORDS_HIDDEN = 'Words hidden.'

export function hasText(event: SessionEvent): boolean {
  return event.rawText.length > 0 || event.finalText.length > 0
}

/** How long a recording waiting for a retry may stay. Don't keep is
 *  about transcripts, and a failed take or one that reached no app has
 *  no other copy, so it gets the same 24 hours to be retried. Null keeps
 *  it until it is retried. */
export function recordingLimitMs(retentionDays: number): number | null {
  if (retentionDays === KEEP_NO_TEXT || retentionDays === KEEP_24_HOURS) return DAY_MS
  return retentionDays > 0 ? retentionDays * DAY_MS : null
}

/** What paste-last pastes: the entry a held take's words just went back
 *  to, until something newer lands, or else the newest entry. Those words
 *  sit on an older line, so the newest line would be another take. */
export function pasteTarget(events: readonly SessionEvent[], restoredAt: number | null): SessionEvent | undefined {
  const restored = restoredAt === null ? undefined : events.find((event) => event.at === restoredAt)
  return restored !== undefined && restored.finalText.length > 0 ? restored : events.at(-1)
}

/** Whether an event counts toward words, belts, achievements, recaps,
 *  and analytics. Transforms are recoverability records, not speech. */
export function countsTowardStats(event: SessionEvent): boolean {
  return event.kind !== 'transform'
}

/** The day an event belongs to: stored key first, derived as fallback. */
export function eventDay(event: SessionEvent): string {
  return event.day ?? dayKey(event.at)
}

/** Count words the way the rest of the app does. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

/** Words per minute, rounded, safe on zero-length sessions. */
export function wordsPerMinute(words: number, durationMs: number): number {
  if (durationMs <= 0 || words <= 0) return 0
  return Math.round(words / (durationMs / 60_000))
}

/** Local-date key (YYYY-MM-DD) for grouping in the user's timezone. */
export function dayKey(at: number): string {
  const d = new Date(at)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Group events by local day, newest day first, newest event first. */
export function groupByDay(events: readonly SessionEvent[]): Array<{
  day: string
  events: SessionEvent[]
}> {
  const byDay = new Map<string, SessionEvent[]>()
  for (const event of events) {
    const key = eventDay(event)
    const bucket = byDay.get(key)
    if (bucket) bucket.push(event)
    else byDay.set(key, [event])
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, dayEvents]) => ({
      day,
      events: [...dayEvents].sort((a, b) => b.at - a.at)
    }))
}

/** True when the value has the shape of a SessionEvent. */
export function isSessionEvent(value: unknown): value is SessionEvent {
  const v = value as SessionEvent
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.at === 'number' &&
    typeof v.durationMs === 'number' &&
    typeof v.rawText === 'string' &&
    typeof v.finalText === 'string' &&
    typeof v.words === 'number' &&
    typeof v.wpm === 'number' &&
    (v.day === undefined || typeof v.day === 'string') &&
    (v.hour === undefined || typeof v.hour === 'number') &&
    (v.kind === undefined || v.kind === 'note' || v.kind === 'transform') &&
    (v.unsent === undefined || typeof v.unsent === 'boolean')
  )
}
