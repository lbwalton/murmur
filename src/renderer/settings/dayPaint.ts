// SPDX-License-Identifier: GPL-3.0-only
// Today, wrapped, in words (US-088): the day's dictations, words, time
// back, longest take, and best pace, as Copy summary copies them. The
// day's painting itself is a painting a day (US-098, painting.ts).
import { formatDuration } from '../../shared/time'
import { formatMinutesBack } from '../../shared/timeback'

export interface DayTake {
  words: number
  durationMs: number
  wpm: number
}

/** The two lines the wrap-up shows and Copy summary copies. */
export function daySummary(takes: readonly DayTake[], minutesBack: number): { headline: string; detail: string; text: string } {
  const n = takes.length
  const words = takes.reduce((sum, t) => sum + t.words, 0)
  const longest = takes.reduce((ms, t) => Math.max(ms, t.durationMs), 0)
  const pace = takes.reduce((best, t) => Math.max(best, t.wpm), 0)
  const headline = `${n.toLocaleString()} ${n === 1 ? 'dictation' : 'dictations'}, ${words.toLocaleString()} words`
  const detail = `${formatMinutesBack(minutesBack)} back, longest take ${formatDuration(longest)}, best pace ${pace} wpm`
  return { headline, detail, text: `${headline}\n${detail}` }
}
