// SPDX-License-Identifier: GPL-3.0-only
// Recap scheduling math. Pure: the main process asks "should the recap
// fire now?" once a minute. A machine asleep at recap time still gets
// its recap once, late, on the next check after waking.
import { dayKey } from './history'

export interface RecapTime {
  hour: number
  minute: number
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
