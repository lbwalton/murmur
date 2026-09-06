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
    (v.hour === undefined || typeof v.hour === 'number')
  )
}
