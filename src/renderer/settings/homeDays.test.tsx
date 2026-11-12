// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { type SessionEvent, dayKey, groupByDay, withoutText } from '../../shared/history'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { HomeRail, OLDER, OVERVIEW, WAITING, railMark } from './HomeRail'
import {
  HOME_TAKES,
  RAIL_DAYS,
  SEARCH_OFF,
  dayCount,
  dayShort,
  dayTitle,
  isOpen,
  railDays,
  railHidden,
  railIsHidden,
  rememberRailHidden,
  searchDays,
  searchLine,
  showingLine,
  startsOpen
} from './homeDays'

const read = (name: string): string => readFileSync(join(__dirname, name), 'utf8')

// Noon on a fixed day, so a day back is always the day before.
const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime()
const DAY = 24 * 60 * 60 * 1000
const take = (daysAgo: number, finalText: string, extra: Partial<SessionEvent> = {}): SessionEvent =>
  ({
    at: NOW - daysAgo * DAY - Math.floor(Math.random() * 1000),
    durationMs: 4000,
    rawText: finalText.toLowerCase(),
    finalText,
    words: finalText.split(/\s+/).length,
    wpm: 120,
    ...extra
  }) as SessionEvent

const log = [
  take(0, 'Move the design review to Thursday.'),
  take(0, 'Thanks, this looks great.'),
  take(1, 'Renew the domain before the end of the month.'),
  take(6, 'Send the invoice on Friday.'),
  take(6, 'Check the domain renewal date.')
]
const groups = groupByDay(log)

describe('your dictations, a day at a time', () => {
  it('groups by day, newest first, and names Today and Yesterday', () => {
    expect(groups.map((g) => g.events.length)).toEqual([2, 1, 2])
    expect(dayTitle(groups[0].day, NOW)).toBe('Today')
    expect(dayTitle(groups[1].day, NOW)).toBe('Yesterday')
    expect(dayTitle(groups[2].day, NOW)).toMatch(/November 5/)
    expect(dayShort(groups[0].day, NOW)).toBe('Today')
    expect(dayShort(groups[2].day, NOW)).toMatch(/Nov 5/)
  })

  it('counts a day in dictations and words', () => {
    expect(dayCount(groups[0].events)).toBe('2 dictations · 10 words')
    expect(dayCount(groups[1].events)).toBe('1 dictation · 9 words')
    expect(dayCount([take(0, 'Hello', { words: 1 })])).toBe('1 dictation · 1 word')
  })

  it('opens Today and Yesterday and folds older days, until the person says otherwise', () => {
    expect(startsOpen(dayKey(NOW), NOW)).toBe(true)
    expect(startsOpen(dayKey(NOW - DAY), NOW)).toBe(true)
    expect(startsOpen(dayKey(NOW - 2 * DAY), NOW)).toBe(false)
    const old = dayKey(NOW - 6 * DAY)
    expect(isOpen(old, {}, NOW)).toBe(false)
    expect(isOpen(old, { [old]: true }, NOW)).toBe(true)
    expect(isOpen(dayKey(NOW), { [dayKey(NOW)]: false }, NOW)).toBe(false)
  })

  it('says how many it is showing, and when that is the most it holds', () => {
    expect(showingLine(1)).toBe('1 dictation.')
    expect(showingLine(42)).toBe('42 dictations.')
    expect(showingLine(HOME_TAKES)).toBe('Showing the newest 500.')
  })

  it('holds no more takes than main keeps in memory, and draws no rows for a folded day', () => {
    const home = read('HomeView.tsx')
    expect(HOME_TAKES).toBe(500)
    expect(home).toContain('setEvents(list.slice(-HOME_TAKES))')
    expect(home).toContain('[...prev, event].slice(-HOME_TAKES)')
    expect(home).toMatch(/\{open && \(\s*<div className="log-list"/)
    expect(read('../../main/history/index.ts')).toContain('readAll().slice(-500)')
  })
})

describe('the rail', () => {
  it('names the newest days and gathers the rest under Older days', () => {
    const many = groupByDay(Array.from({ length: 10 }, (_, i) => take(i, `take ${i}`)).concat([take(9, 'another')]))
    const rail = railDays(many, NOW)
    expect(rail.days).toHaveLength(RAIL_DAYS)
    expect(rail.days.slice(0, 2).map((d) => d.label)).toEqual(['Today', 'Yesterday'])
    expect(rail.older).toEqual({ day: many[RAIL_DAYS].day, count: 4 })
    expect(railDays(groups, NOW).older).toBeNull()
    expect(railDays(groups, NOW).days.map((d) => d.count)).toEqual([2, 1, 2])
  })

  it('marks the day in view, and Older days for a day it does not name', () => {
    const days = railDays(groups, NOW).days
    expect(railMark(OVERVIEW, days)).toBe(OVERVIEW)
    expect(railMark(WAITING, days)).toBe(WAITING)
    expect(railMark(groups[1].day, days)).toBe(groups[1].day)
    expect(railMark('2020-01-01', days)).toBe(OLDER)
  })

  const draw = (settings: Settings, waiting = 0): string =>
    renderToStaticMarkup(
      <HomeRail
        settings={settings}
        onUpdate={async () => undefined}
        query="domain"
        onQuery={() => undefined}
        searchRef={{ current: null }}
        waiting={waiting}
        days={railDays(groups, NOW).days}
        older={null}
        onGo={() => undefined}
        onHide={() => undefined}
        hideKeys="Cmd+\"
        searchKeys="Cmd+F"
      />
    )
  const hiding: Settings = { ...DEFAULT_SETTINGS, history: { ...DEFAULT_SETTINGS.history, hideWords: true } }

  it('is built from the Settings rail parts: search, groups, days with counts, Hide words', () => {
    const html = draw(DEFAULT_SETTINGS)
    expect(html).toContain('class="rail home-rail"')
    expect(html).toContain('class="field rail-search"')
    expect(html).toContain('aria-label="Hide sidebar"')
    expect(html).toContain('title="Hide sidebar (Cmd+\\)"')
    expect(html.match(/rail-group-label/g)).toHaveLength(2)
    expect(html).toContain('Overview')
    expect(html).toContain('Today</span><span class="rail-count">2</span>')
    expect(html).toContain('id="home-hide-words"')
    expect(html).toContain('role="switch"')
    // Every item is a real button, so Tab, Enter and Space reach it.
    expect(html.match(/<button[^>]*class="rail-item/g)).toHaveLength(4)
  })

  it('lists Waiting to retry with its count and a red dot only while takes wait', () => {
    expect(draw(DEFAULT_SETTINGS)).not.toContain('Waiting to retry')
    const waiting = draw(DEFAULT_SETTINGS, 2)
    expect(waiting).toContain('Waiting to retry</span><span class="rail-count">2</span><span class="rail-dot"')
  })

  it('turns search off while Hide words is on, drops what was typed, and says why', () => {
    const off = draw(hiding)
    expect(off).toMatch(/<input[^>]*disabled=""[^>]*value=""/)
    expect(off).toContain(SEARCH_OFF)
    expect(off).toContain('aria-describedby="home-search-off"')
    const on = draw(DEFAULT_SETTINGS)
    expect(on).toContain('value="domain"')
    expect(on).not.toContain(SEARCH_OFF)
  })

  it('remembers the choice to hide it', () => {
    const kept = new Map<string, string>()
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
    expect(railHidden(store)).toBe(false)
    rememberRailHidden(store, true)
    expect(railHidden(store)).toBe(true)
    rememberRailHidden(store, false)
    expect(railHidden(store)).toBe(false)
    // No storage, or storage that throws: the rail shows.
    expect(railHidden(null)).toBe(false)
    const broken = {
      getItem: () => {
        throw new Error('no storage')
      },
      setItem: () => {
        throw new Error('no storage')
      }
    }
    expect(railHidden(broken)).toBe(false)
    expect(() => rememberRailHidden(broken, true)).not.toThrow()
  })

  it('tucks away in a narrow window until asked for, whatever was remembered', () => {
    expect(railIsHidden(false, false, false)).toBe(false)
    expect(railIsHidden(false, false, true)).toBe(true)
    expect(railIsHidden(true, false, false)).toBe(true)
    expect(railIsHidden(true, true, true)).toBe(false)
  })

  it('hides with Cmd+\\ and searches with Cmd+F, Ctrl on Windows', () => {
    const home = read('HomeView.tsx')
    expect(home).toContain("if (e.key === '\\\\') {")
    expect(home).toContain("e.key.toLowerCase() === 'f'")
    expect(home).toContain('IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey')
    expect(home).toContain('aria-label="Show sidebar"')
  })
})

describe('searching what you said', () => {
  it('filters every day at once, keeps only days with a match, and counts', () => {
    const found = searchDays(groups, 'Domain', false)
    expect(found.searching).toBe(true)
    expect(found.matches).toBe(2)
    expect(found.groups.map((g) => g.events.length)).toEqual([1, 1])
    expect(found.groups.map((g) => g.day)).toEqual([groups[1].day, groups[2].day])
    expect(searchLine(found.matches)).toBe('2 dictations match.')
    expect(searchLine(1)).toBe('1 dictation matches.')
  })

  it('wants every word typed, in any order', () => {
    expect(searchDays(groups, 'renewal domain', false).matches).toBe(1)
    expect(searchDays(groups, 'domain friday', false).matches).toBe(0)
  })

  it('says plainly when nothing matches', () => {
    const none = searchDays(groups, 'zebra', false)
    expect(none).toEqual({ searching: true, groups: [], matches: 0 })
    expect(searchLine(0)).toBe('Nothing you said matches that. Try fewer words.')
  })

  it('shows everything when nothing is typed', () => {
    const all = searchDays(groups, '   ', false)
    expect(all.searching).toBe(false)
    expect(all.groups).toEqual(groups)
    expect(all.matches).toBe(5)
  })

  it('is off while Hide words is on, so a search can never reveal hidden words', () => {
    const hidden = searchDays(groups, 'domain', true)
    expect(hidden.searching).toBe(false)
    expect(hidden.groups).toEqual(groups)
    // The same list as a search for anything else: nothing to learn from it.
    expect(searchDays(groups, 'zebra', true)).toEqual(hidden)
  })

  it('never matches a take whose words are not kept', () => {
    const wordless = groupByDay([withoutText(take(0, 'A secret plan'))])
    expect(searchDays(wordless, 'secret', false).matches).toBe(0)
  })
})
