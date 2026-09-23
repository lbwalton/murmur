// SPDX-License-Identifier: GPL-3.0-only
// Time back: the minutes a dictation did not spend typing. Pure and
// shared: analytics sums it and every surface formats it here. Nothing
// is stored per session; the number derives from words and duration at
// the typing speed in settings, so a speed edit restates every day
// honestly.
import { type SessionEvent, eventDay } from './history'

export const DEFAULT_TYPING_WPM = 40
export const MIN_TYPING_WPM = 10
export const MAX_TYPING_WPM = 200
/** The milestone nod fires at every multiple of this, per day. */
export const MILESTONE_STEP_MINUTES = 30

/** A usable typing speed: the default for anything that is not a finite
 *  number, otherwise clamped into the band, so a corrupt setting can
 *  never divide by zero or invent hours. */
export function clampTypingWpm(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TYPING_WPM
  return Math.min(MAX_TYPING_WPM, Math.max(MIN_TYPING_WPM, value))
}

/** Minutes back for one session: typing time at the speed minus the
 *  time the key was held. Negative when holding cost more than typing
 *  would have; callers floor the display, never the arithmetic. */
export function minutesBack(words: number, durationMs: number, typingWpm: number): number {
  return words / clampTypingWpm(typingWpm) - durationMs / 60_000
}

/** Raw time back over one day's takes: honest per session, unfloored.
 *  Surfaces floor and round it through shownMinutes or the analytics
 *  buckets, never here. */
export function dayMinutesBack(
  events: readonly SessionEvent[],
  day: string,
  typingWpm: number
): number {
  let sum = 0
  for (const event of events) {
    if (eventDay(event) === day) sum += minutesBack(event.words, event.durationMs, typingWpm)
  }
  return sum
}

/** The whole minutes a surface shows for a raw total: floored at zero,
 *  rounded to a tenth the way the analytics buckets are, then to the
 *  minute the way the card and the tooltip read it. The milestone nod
 *  is decided on this value, so it arrives on the take where the card
 *  first reads the mark, never a take later. */
export function shownMinutes(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  return Math.round(Math.round(Math.max(0, raw) * 10) / 10)
}

/** "0 min", "under a minute", "12 min", "1 h 5 min", "2 h". Anything
 *  that is not a finite positive number reads as nothing back. */
export function formatMinutesBack(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min'
  const whole = Math.round(minutes)
  if (whole === 0) return 'under a minute'
  if (whole < 60) return `${whole} min`
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** "30 minutes", "1 hour 5 minutes", "2 hours": the spoken form for a
 *  notification sentence, reading nothing and fractions the way the
 *  short form does. */
export function formatMinutesBackWords(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 minutes'
  const whole = Math.round(minutes)
  if (whole === 0) return 'under a minute'
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? 'minute' : 'minutes'}`)
  return parts.join(' ')
}

/** The highest step mark newly crossed going from before to after, or
 *  null. Both sides floor at zero: the raw sum can sit below zero after
 *  held-and-said-nothing takes, and the first real take climbs from
 *  zero, not from the debt. One take across two marks names the higher. */
export function crossedMilestone(
  before: number,
  after: number,
  step: number = MILESTONE_STEP_MINUTES
): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || !(step > 0)) return null
  const lo = Math.max(0, before)
  const hi = Math.max(0, after)
  if (!(hi > lo)) return null
  const mark = Math.floor(hi / step) * step
  return mark > lo ? mark : null
}

/** The mark to celebrate for a take, or null: crossed by this take and
 *  not yet shown today. The shown list is what stops a repeat when the
 *  total falls under a mark and climbs back over it. */
export function milestoneToAnnounce(
  before: number,
  after: number,
  shown: readonly number[],
  step: number = MILESTONE_STEP_MINUTES
): number | null {
  const mark = crossedMilestone(before, after, step)
  if (mark === null || shown.includes(mark)) return null
  return mark
}

/** The milestone notification body. */
export function milestoneBody(mark: number): string {
  return `${formatMinutesBackWords(mark)} earned back today.`
}

/** The tray tooltip: plain murmur until the day has a minute back. */
export function trayTooltip(minutesBackToday: number): string {
  if (!Number.isFinite(minutesBackToday) || Math.round(minutesBackToday) < 1) return 'murmur'
  return `murmur · ${formatMinutesBack(minutesBackToday)} back today`
}
