// SPDX-License-Identifier: GPL-3.0-only
// Home's history, as days (US-147): what the rail lists, which days start
// open, what a search keeps, and whether the rail is hidden. Pure, so the
// page and its tests agree on every rule.
import { type SessionEvent, dayKey, hasText } from '../../shared/history'

export interface DayGroup {
  day: string
  events: SessionEvent[]
}

/** The most takes Home holds; main keeps the same number in memory. */
export const HOME_TAKES = 500

/** Days the rail names 1 by 1; the rest share Older days. */
export const RAIL_DAYS = 7

const dateOf = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const yesterdayKey = (now: number): string => {
  const at = new Date(now)
  return dayKey(new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1).getTime())
}

/** Kept forever, a history can pass a year: a day from another year
 *  says which, so 2 days never read alike. */
const yearIfOther = (day: string, now: number): { year?: 'numeric' } =>
  dateOf(day).getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }

/** A day's name on its header: Today, Yesterday, then the full date. */
export function dayTitle(day: string, now: number): string {
  if (day === dayKey(now)) return 'Today'
  if (day === yesterdayKey(now)) return 'Yesterday'
  return dateOf(day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', ...yearIfOther(day, now) })
}

/** The same day, short enough for the rail. */
export function dayShort(day: string, now: number): string {
  if (day === dayKey(now)) return 'Today'
  if (day === yesterdayKey(now)) return 'Yesterday'
  return dateOf(day).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...yearIfOther(day, now) })
}

/** Today and Yesterday start open; older days start folded. */
export function startsOpen(day: string, now: number): boolean {
  return day === dayKey(now) || day === yesterdayKey(now)
}

/** Open or folded: the person's own click wins over the starting rule. */
export function isOpen(day: string, picks: Readonly<Record<string, boolean>>, now: number): boolean {
  return picks[day] ?? startsOpen(day, now)
}

/** A day header's count: its dictations and their words. */
export function dayCount(events: readonly SessionEvent[]): string {
  const words = events.reduce((sum, event) => sum + (event.words > 0 ? event.words : 0), 0)
  const takes = events.length === 1 ? '1 dictation' : `${events.length.toLocaleString()} dictations`
  return `${takes} · ${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`
}

export interface RailDay {
  day: string
  label: string
  count: number
}

/** What the rail lists under your dictations: the newest days by name,
 *  then 1 Older days line that jumps to the first of the rest. */
export function railDays(
  groups: readonly DayGroup[],
  now: number
): { days: RailDay[]; older: { day: string; count: number } | null } {
  const named = groups.slice(0, RAIL_DAYS)
  const rest = groups.slice(RAIL_DAYS)
  return {
    days: named.map((g) => ({ day: g.day, label: dayShort(g.day, now), count: g.events.length })),
    older: rest.length > 0 ? { day: rest[0].day, count: rest.reduce((sum, g) => sum + g.events.length, 0) } : null
  }
}

/** The words a search may read: what landed and what was heard. A take
 *  whose words are not kept, or cannot be opened, has none. */
function searchable(event: SessionEvent): string {
  return hasText(event) ? `${event.finalText} ${event.rawText}`.toLowerCase() : ''
}

export interface SearchResult {
  /** False when nothing was asked, or search is off. */
  searching: boolean
  groups: DayGroup[]
  matches: number
}

/** Filters every day at once: a take stays when it holds every word
 *  typed, and a day stays when a take in it does. While Hide words is on
 *  search is off whatever was typed, so the list a search leaves can
 *  never tell what a hidden take says. */
export function searchDays(groups: readonly DayGroup[], query: string, hideWords: boolean): SearchResult {
  const words = hideWords ? [] : query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return { searching: false, groups: [...groups], matches: groups.reduce((sum, g) => sum + g.events.length, 0) }
  }
  const kept: DayGroup[] = []
  let matches = 0
  for (const group of groups) {
    const events = group.events.filter((event) => {
      const hay = searchable(event)
      return hay !== '' && words.every((w) => hay.includes(w))
    })
    if (events.length > 0) {
      kept.push({ day: group.day, events })
      matches += events.length
    }
  }
  return { searching: true, groups: kept, matches }
}

/** What the history says about a search. */
export function searchLine(matches: number): string {
  if (matches === 0) return 'Nothing you said matches that. Try fewer words.'
  return matches === 1 ? '1 dictation matches.' : `${matches.toLocaleString()} dictations match.`
}

export const SEARCH_OFF = 'Search is off while Hide words is on, so a search can never show hidden words.'

/** How many takes Home is showing, beside the Your dictations heading. */
export function showingLine(count: number): string {
  if (count >= HOME_TAKES) return `Showing the newest ${HOME_TAKES.toLocaleString()}.`
  return count === 1 ? '1 dictation.' : `${count.toLocaleString()} dictations.`
}

const RAIL_KEY = 'murmur-home-rail-hidden'

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The remembered choice to hide Home's rail. Without storage the rail
 *  shows. */
export function railHidden(store: Store | null): boolean {
  try {
    return store?.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberRailHidden(store: Store | null, hidden: boolean): void {
  try {
    store?.setItem(RAIL_KEY, hidden ? '1' : '0')
  } catch {
    // The choice still holds for this visit.
  }
}

/** Hidden right now: a narrow window tucks the rail away until it is
 *  asked for, and a wide one follows the remembered choice. */
export function railIsHidden(narrow: boolean, narrowOpen: boolean, remembered: boolean): boolean {
  return narrow ? !narrowOpen : remembered
}

/** What a key press asks of Home's rail: Cmd+\ hides or shows it and
 *  Cmd+F goes to its search (Ctrl on Windows). The backslash is read by
 *  its place on the keyboard, so layouts that reach it through Option or
 *  AltGr still work. */
export function railKey(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  mac: boolean
): 'toggle' | 'search' | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!mod || e.shiftKey) return null
  if (e.code === 'Backslash') return 'toggle'
  if (!e.altKey && e.key.toLowerCase() === 'f') return 'search'
  return null
}
