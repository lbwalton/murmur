// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { type SessionEvent, dayKey, groupByDay, withoutText } from '../../shared/history'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'
import { HomeRail, railMark } from './HomeRail'
import { MARK_LINE, OLDER, OVERVIEW, WAITING, goldDay, holdsPick } from './homeMark'
import { HomeHistory } from './HomeView'
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
  railKey,
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

  const draw = (settings: Settings, waiting = 0, place: string = OVERVIEW): string =>
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
        place={place}
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

  it('puts its gold line on the place it is given, and on nothing else', () => {
    const top = draw(DEFAULT_SETTINGS)
    expect(top.match(/rail-item-on/g)).toHaveLength(1)
    expect(top).toMatch(/class="rail-item rail-item-on" aria-current="true"><span class="rail-title">Overview</)
    const day = draw(DEFAULT_SETTINGS, 0, groups[1].day)
    expect(day.match(/rail-item-on/g)).toHaveLength(1)
    expect(day).toMatch(/class="rail-item rail-item-on" aria-current="true"><span class="rail-title">Yesterday</)
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

  const key = (over: Partial<KeyboardEvent>): Parameters<typeof railKey>[0] => ({
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...over
  })

  it('hides with Cmd+\\ and searches with Cmd+F, Ctrl on Windows', () => {
    expect(railKey(key({ code: 'Backslash', key: '\\', metaKey: true }), true)).toBe('toggle')
    expect(railKey(key({ code: 'KeyF', key: 'f', metaKey: true }), true)).toBe('search')
    expect(railKey(key({ code: 'Backslash', key: '\\', ctrlKey: true }), false)).toBe('toggle')
    expect(railKey(key({ code: 'KeyF', key: 'F', ctrlKey: true }), false)).toBe('search')
    // The other platform's key, no key, or a bigger combo is not ours.
    expect(railKey(key({ code: 'KeyF', key: 'f', ctrlKey: true }), true)).toBeNull()
    expect(railKey(key({ code: 'KeyF', key: 'f', metaKey: true }), false)).toBeNull()
    expect(railKey(key({ code: 'KeyF', key: 'f' }), true)).toBeNull()
    expect(railKey(key({ code: 'KeyF', key: 'f', metaKey: true, shiftKey: true }), true)).toBeNull()
    expect(railKey(key({ code: 'KeyF', key: 'f', metaKey: true, ctrlKey: true }), true)).toBeNull()
  })

  it('reads the backslash by its place, so a layout that needs Option for it still works', () => {
    expect(railKey(key({ code: 'Backslash', key: '#', metaKey: true }), true)).toBe('toggle')
    expect(railKey(key({ code: 'Backslash', key: '«', metaKey: true, altKey: true }), true)).toBe('toggle')
    // Option with F types another letter; that is not a search.
    expect(railKey(key({ code: 'KeyF', key: 'ƒ', metaKey: true, altKey: true }), true)).toBeNull()
  })

  it('is wired to the window on Home, stays out of a dialog, and keeps Hide words on the page when hidden', () => {
    const home = read('HomeView.tsx')
    expect(home).toContain('const asked = railKey(e, IS_MAC)')
    expect(home).toContain("window.addEventListener('keydown', onKey)")
    expect(home).toContain(`document.querySelector('[role="dialog"], dialog[open]')`)
    expect(home).toContain('aria-label="Show sidebar"')
    expect(home).toMatch(/\{hidden && \(\s*<div className=\{landing \? 'home-head-hide home-head-hide-landing' : 'home-head-hide'\} id="home-hide-words">/)
    // Hidden by hand, the switch gets 1 brush loop where it landed, for a moment.
    expect(home).toContain('{landing > 0 && <LandRing key={landing} />}')
    expect(home).toMatch(/const setHidden = \(next: boolean\): void => \{\s*setLanding\(next \? Date\.now\(\) : 0\)/)
    expect(home).toContain('window.setTimeout(() => setLanding(0), LAND_RING_MS)')
    // Hide words drops what was typed.
    expect(home).toMatch(/useEffect\(\(\) => \{\s*if \(hide\) setQuery\(''\)\s*\}, \[hide\]\)/)
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

  it('names the year for a day from another year', () => {
    const lastYear = dayKey(new Date(2025, 10, 5, 12).getTime())
    expect(dayTitle(lastYear, NOW)).toMatch(/2025/)
    expect(dayShort(lastYear, NOW)).toMatch(/2025/)
    expect(dayTitle(dayKey(NOW - 6 * DAY), NOW)).not.toMatch(/2026/)
  })

  it('never matches a take whose words are not kept', () => {
    const wordless = groupByDay([withoutText(take(0, 'A secret plan'))])
    expect(searchDays(wordless, 'secret', false).matches).toBe(0)
  })
})

describe('your dictations on the page', () => {
  const hiding: Settings = { ...DEFAULT_SETTINGS, history: { ...DEFAULT_SETTINGS.history, hideWords: true } }
  const draw = (over: Partial<Parameters<typeof HomeHistory>[0]> = {}): string =>
    renderToStaticMarkup(
      <HomeHistory
        grouped={groups}
        shown={log.length}
        query=""
        picks={{}}
        place={OVERVIEW}
        now={NOW}
        settings={DEFAULT_SETTINGS}
        onPick={() => undefined}
        onClearSearch={() => undefined}
        onOpenHistory={() => undefined}
        {...over}
      />
    )
  const dayOf = (html: string, day: string): string => html.slice(html.indexOf(`id="day-${day}"`)).split('</section>')[0]

  it('has its heading, how many are showing, and how long they are kept', () => {
    const html = draw()
    expect(html).toContain('<h2 id="home-history-title" class="micro-label">your dictations</h2>')
    expect(html).toContain('5 dictations. Kept 90 days on this computer.')
    expect(html).toContain('History settings</button>')
  })

  it('puts the gold band on the header of the day you are on, and only there', () => {
    const band = (html: string): string[] =>
      [...html.matchAll(/<section class="day" id="day-([^"]+)"[^>]*><h3 class="day-h"><button class="day-head day-head-on"/g)].map((m) => m[1])
    // Above the days it rests on Today.
    expect(band(draw())).toEqual([groups[0].day])
    expect(band(draw({ place: WAITING }))).toEqual([groups[0].day])
    // On a day, that day's header wears it and Today's lets go: open or folded.
    expect(band(draw({ place: groups[1].day }))).toEqual([groups[1].day])
    expect(band(draw({ place: groups[2].day }))).toEqual([groups[2].day])
    expect(band(draw({ place: groups[2].day, picks: { [groups[2].day]: true } }))).toEqual([groups[2].day])
    // Every other header is a plain one.
    expect(draw({ place: groups[1].day }).match(/class="day-head"/g)).toHaveLength(groups.length - 1)
  })

  it('keeps the band on Today when a search has left out the day you were on', () => {
    const band = (html: string): string[] =>
      [...html.matchAll(/<section class="day" id="day-([^"]+)"[^>]*><h3 class="day-h"><button class="day-head day-head-on"/g)].map((m) => m[1])
    // "review" is only in Today's words, so the day you were on is not showing.
    const found = draw({ query: 'review', place: groups[2].day })
    expect(found).not.toContain(`id="day-${groups[2].day}"`)
    expect(band(found)).toEqual([groups[0].day])
  })

  it('gives a row icons that carry their names, with no boxed word buttons (US-166)', () => {
    const today = dayOf(draw(), groups[0].day)
    // Each icon is a button named for a screen reader, and the name it
    // shows beside it is hidden from one, so it is never read twice.
    expect(today).toContain('class="row-icon row-icon-report log-said-toggle" aria-label="report"')
    expect(today).toContain('class="row-icon row-icon-copy log-copy" aria-label="copy"')
    expect(today).toContain('<span class="row-name" aria-hidden="true"><span class="row-says row-says-said">what you said</span><span class="row-says row-says-report">report</span></span>')
    expect(today).toMatch(/<span class="row-says row-says-copy " aria-hidden="true">copy<\/span>/)
    expect(today).not.toContain('btn quiet-btn log-')
    // Copy's answer is said once, in 1 place.
    expect(draw()).toContain('<p class="visually-hidden" role="status"></p>')
  })

  it('draws its own icons, shows a name without moving the row, and keeps a still check for reduced motion', () => {
    const icons = read('RowIcons.tsx')
    // Nothing from an icon set: the only imports are murmur's own.
    expect([...icons.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['../brush', './PaintCanvas'])
    expect(icons).toContain("tokenColor('--brand'")
    expect(icons).toContain('paintInMs={CHECK_DRAW_MS}')
    const css = read('styles.css')
    // No box: no border and no fill at rest.
    expect(css).toMatch(/\.row-icon \{[^}]*background: none;\s*border: 0;/)
    // A name is hidden until asked for, gives way before anything else
    // on the row (shrink 100), and copy is held at the right edge.
    expect(css).toMatch(/\.row-says \{\s*display: none;[^}]*user-select: none;/)
    expect(css).toMatch(/\.row-name \{\s*flex: 0 100 auto;\s*min-width: 0;\s*overflow: hidden;/)
    expect(css).toMatch(/\.row-acts-end \{\s*margin-left: auto;/)
    // The gold bubble is full gold: dimmed, it fell under 4.5 to 1 on a glass card.
    expect(css).not.toMatch(/\.row-icon-said[^{]*\{[^}]*opacity/)
    // The waiting card's buttons share 1 width; nothing else is widened.
    expect(css).toMatch(/\.waiting-strip \.waiting-actions \.btn \{\s*min-width: 96px;/)
    // A second copy draws its check again and is said again.
    const home = read('HomeView.tsx')
    expect(home).toContain('<CopyCheck key={copyRun} />')
    expect(home).toContain("copyRun % 2 === 0 ? 'copied' : 'copied\\u00a0'")
    // Keyboard focus shows a ring, like every control on Home.
    expect(css).toMatch(/\.home-layout :is\([^)]*\.row-icon[^)]*\):focus-visible/)
  })

  it('opens Today and Yesterday, folds older days, and draws no rows for a folded day', () => {
    const html = draw()
    const today = dayOf(html, groups[0].day)
    const old = dayOf(html, groups[2].day)
    expect(today).toContain('aria-expanded="true"')
    expect(today).toContain(`aria-controls="day-rows-${groups[0].day}"`)
    expect(today).toContain('Move the design review to Thursday.')
    expect(today).toContain('2 dictations · 10 words')
    expect(old).toContain('aria-expanded="false"')
    expect(old).not.toContain('aria-controls')
    expect(old).not.toContain('log-entry')
    expect(html).not.toContain('Send the invoice on Friday.')
  })

  it('follows the person\'s own folding', () => {
    const html = draw({ picks: { [groups[0].day]: false, [groups[2].day]: true } })
    expect(dayOf(html, groups[0].day)).toContain('aria-expanded="false"')
    expect(html).not.toContain('Move the design review to Thursday.')
    expect(dayOf(html, groups[2].day)).toContain('Send the invoice on Friday.')
  })

  it('searching keeps the days with a match, opens them, counts, and offers a way out', () => {
    const html = draw({ query: 'domain' })
    expect(html).toContain('<p role="status">2 dictations match.</p>')
    expect(html).toContain('Clear search</button>')
    expect(html).not.toContain(`id="day-${groups[0].day}"`)
    const old = dayOf(html, groups[2].day)
    expect(old).toContain('aria-expanded="true"')
    expect(old).toContain('1 of 2 match')
    expect(old).toContain('Check the domain renewal date.')
    expect(old).not.toContain('Send the invoice on Friday.')
    expect(draw({ query: 'zebra' })).toContain('Nothing you said matches that. Try fewer words.')
  })

  it('shows no search while nothing is typed', () => {
    const html = draw()
    expect(html).toContain('<p role="status"></p>')
    expect(html).not.toContain('Clear search')
  })

  it('never searches while Hide words is on: every day, no words, no count', () => {
    const html = draw({ query: 'domain', settings: hiding })
    expect(html).not.toContain('match')
    expect(html).not.toContain('Clear search')
    expect(html).toContain(`id="day-${groups[0].day}"`)
    expect(html).not.toContain('domain')
    expect(html).not.toContain('Thursday.')
    expect(html).toContain('Words hidden')
    // The same page whatever was typed.
    expect(draw({ query: 'zebra', settings: hiding })).toBe(html)
  })
})

describe('a clicked place keeping the mark', () => {
  // The line sits at 90: 28 px under a box that starts at 62.
  it('holds wherever it landed while the page rests where the click left it', () => {
    expect(holdsPick(70, 90, false, 0)).toBe(true)
    // On a page too short to scroll at all.
    expect(holdsPick(300, 90, true, 0)).toBe(true)
  })
  it('lets go once the page moves, so the day at the top leads', () => {
    expect(holdsPick(70, 90, false, 30)).toBe(false)
    expect(holdsPick(120, 90, false, -30)).toBe(false)
  })
  it('holds a day short of the line while the page is at its end', () => {
    expect(holdsPick(420, 90, true, 40)).toBe(true)
  })
  it('lets go at the end once the place reached the line, or when the place is gone', () => {
    expect(holdsPick(90, 90, true, 40)).toBe(false)
    expect(holdsPick(null, 90, true, 0)).toBe(false)
  })
})

describe('the line that marks a place', () => {
  it('sits between a clicked day and the next folded day, so the gold is on the day at the top', () => {
    // A clicked day lands 16 px under the box's top; a folded day is about 50 px tall.
    expect(MARK_LINE).toBeGreaterThan(16 + 4)
    expect(MARK_LINE).toBeLessThan(16 + 44)
  })
  it('is measured from the page box, not from the top bar above it', () => {
    const rail = read('homeMark.ts')
    expect(rail).toContain('const boxTop = box ? box.getBoundingClientRect().top : 0')
    expect(rail).toContain('const line = boxTop + MARK_LINE')
    // A pick scrolled out of view cannot hold the mark.
    expect(rail).toContain('top >= boxTop - 4 && top < boxFoot')
    expect(rail).not.toContain('--masthead-h')
  })
})

describe('the day whose header wears the gold band', () => {
  const shown = ['2026-11-14', '2026-11-12', '2026-11-11']
  it('is the day you are on', () => {
    expect(goldDay('2026-11-12', shown, '2026-11-14')).toBe('2026-11-12')
    expect(goldDay('2026-11-14', shown, '2026-11-14')).toBe('2026-11-14')
  })
  it('is Today above the days, and when a search has left your day out', () => {
    expect(goldDay(OVERVIEW, shown, '2026-11-14')).toBe('2026-11-14')
    expect(goldDay(WAITING, shown, '2026-11-14')).toBe('2026-11-14')
    expect(goldDay('2026-11-01', shown, '2026-11-14')).toBe('2026-11-14')
  })
  it('is no day when Today is not showing either', () => {
    expect(goldDay(OVERVIEW, ['2026-11-12'], '2026-11-14')).toBeNull()
    expect(goldDay(OVERVIEW, [], '2026-11-14')).toBeNull()
  })
  it('is followed above the sidebar, so the header keeps following while the sidebar is hidden', () => {
    const home = read('HomeView.tsx')
    expect(home).toContain('const mark = useMarkedPlace()')
    expect(home).toMatch(/<HomeRail[^>]*place=\{mark\.place\}/s)
    expect(home).toMatch(/<HomeHistory[^>]*place=\{mark\.place\}/s)
    // A click arms the mark before anything scrolls.
    expect(home).toMatch(/const go = \(place: string\): void => \{\s*\/\/[^\n]*\n\s*mark\.pick\(place\)/)
    expect(read('HomeRail.tsx')).not.toContain('useState')
  })
  it('goes to a date clicked in the list too, without waiting on a scroll that will not come', () => {
    const home = read('HomeView.tsx')
    expect(home).toMatch(/onPick=\{\(day, open\) => \{\s*\/\/[^\n]*\n\s*mark\.pick\(day, false\)/)
    const mark = read('homeMark.ts')
    // A pick that scrolls nowhere takes no lock: the page rests where it is.
    expect(mark).toMatch(/if \(!scrolls\) \{[^}]*locked\.current = false[^}]*pickedAt\.current = pageScroller\(\)\?\.scrollTop \?\? 0\s*return\s*\}/)
  })
  it('moves from header to header without moving anything: the band is painted behind the words', () => {
    const css = read('styles.css')
    const on = css.match(/html\[data-look\] \.day-head-on \{[^}]*\}/)?.[0] ?? ''
    const band = css.match(/html\[data-look\] \.day-head-on::before \{[^}]*\}/)?.[0] ?? ''
    // The gold header keeps the plain header's box: no padding, margin or
    // width of its own, or the list would jump as the gold moved.
    expect(on).not.toMatch(/padding|margin|width/)
    expect(on).toContain('position: relative;')
    // The band is out of the flow, behind the words, 8 px past the column.
    expect(band).toContain('position: absolute;')
    expect(band).toContain('inset: 3px -8px 4px;')
    expect(band).toContain('z-index: -1;')
    // Keyboard focus rings the band, so ring and band are 1 shape.
    expect(css).toMatch(/\.day-head-on:focus-visible::before \{\s*outline: 2px solid var\(--text\);/)
    // The whole band clicks, its overhang too.
    expect(band).not.toContain('pointer-events')
    // On gold the count and an open day's chevron are cream: grey reads
    // 2.7 to 1 there and gold on gold 3.2 to 1.
    expect(on).toContain('--text-dim: var(--text);')
    expect(css).toMatch(/html\[data-look\] \.day-head-on \.day-chevron-open \{\s*color: var\(--text\);/)
  })
})

describe('the window itself never scrolls', () => {
  it('pins the shell, so a jump to a day cannot push the top bar out of the window', () => {
    // A line hidden for screen readers inside the page box sits outside
    // its scroll (LaBroi's screenshot, 2026-11-12: the tabs were gone).
    expect(read('styles.css')).toMatch(/\.shell \{\s*position: fixed;\s*inset: 0;/)
  })
})
