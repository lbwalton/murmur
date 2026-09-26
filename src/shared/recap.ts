// SPDX-License-Identifier: GPL-3.0-only
// Recap scheduling math. Pure: the main process asks "should the recap
// fire now?" once a minute. A machine asleep at recap time still gets
// its recap once, late, on the next check after waking.
import { dayKey } from './history'
import { formatMinutesBackWords } from './timeback'

export interface RecapTime {
  hour: number
  minute: number
}

export interface RecapSummary {
  sessions: number
  words: number
  minutes: number
  /** Today's time back (shared/timeback), already floored for display. */
  minutesBack: number
}

/** The recap notification body. The time back clause joins once the
 *  day has at least a minute back, so a quiet day keeps its sentence. */
export function recapBody(summary: RecapSummary): string {
  const { sessions, words, minutes, minutesBack } = summary
  if (sessions === 0) return 'A quiet day: no dictations. Your hotkey misses you.'
  const base = `${sessions} ${sessions === 1 ? 'session' : 'sessions'}, ${minutes} minutes, ${words.toLocaleString()} words today.`
  return minutesBack >= 1 ? `${base} ${formatMinutesBackWords(minutesBack)} back.` : base
}

/** Parse "HH:MM" 24-hour local time. Null when malformed. */
export function parseRecapTime(time: string): RecapTime | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim())
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

/** Epoch ms of the recap moment on the same local day as nowMs. */
export function fireTimeFor(nowMs: number, time: RecapTime): number {
  const d = new Date(nowMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute, 0, 0).getTime()
}

/**
 * Fire when the recap moment for today has passed and today has not
 * already fired. lastFiredDay is the dayKey of the last firing.
 */
export function shouldFire(nowMs: number, time: string, lastFiredDay: string | null): boolean {
  const parsed = parseRecapTime(time)
  if (!parsed) return false
  if (lastFiredDay === dayKey(nowMs)) return false
  return nowMs >= fireTimeFor(nowMs, parsed)
}
