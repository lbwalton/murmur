// SPDX-License-Identifier: GPL-3.0-only
// Time back: the minutes a dictation did not spend typing. Pure and
// shared: analytics sums it and every surface formats it here. Nothing
// is stored per session; the number derives from words and duration at
// the typing speed in settings, so a speed edit restates every day
// honestly.

export const DEFAULT_TYPING_WPM = 40
export const MIN_TYPING_WPM = 10
export const MAX_TYPING_WPM = 200

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
