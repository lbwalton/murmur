// SPDX-License-Identifier: GPL-3.0-only
// Home's rail (US-147), built from the Settings rail's parts: a search
// across what you said, the page's zones, each day with its count, and
// Hide words. It marks the day in view as the page scrolls.
import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../../shared/settings'
import { Switch } from './controls'
import { HIDE_WORDS_LINE } from './HideWords'
import { type RailDay, SEARCH_OFF } from './homeDays'
import { onPageScroll, oncePageScrollEnds, pageScroller } from './scroller'

/** The sidebar glyph on the hide and show buttons. */
export function SidebarIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  )
}

export const OVERVIEW = 'overview'
export const WAITING = 'waiting'
export const OLDER = 'older'

/** Which rail item a place on the page lights: a named day lights its
 *  own line, any other day lights Older days. */
export function railMark(place: string, days: readonly RailDay[]): string {
  if (place === OVERVIEW || place === WAITING) return place
  return days.some((d) => d.day === place) ? place : OLDER
}

/** True while a clicked place keeps the mark. It keeps it while the
 *  page rests where the click left it (moved is how far the page has
 *  scrolled since): the click chose that day, wherever the line is.
 *  Once the page moves, it keeps it only while it is on the page, short
 *  of where the line rests (a day near the page's end cannot scroll up
 *  that far), and the sliding line is still at or below it. Once
 *  scrolling brings the line up past it, scrolling leads again. */
export function holdsPick(top: number | null, rest: number, line: number, moved: number): boolean {
  if (top === null) return false
  if (Math.abs(moved) <= 2) return true
  return top > rest && top <= line
}

/** The line a place must reach to take the mark. Mid page it rests
 *  just under the top bar. Over the last screen of scrolling it slides
 *  down to the foot of the page's box, because the last days (folded,
 *  they are 1 line each) can never be scrolled up to the top: without
 *  the slide the mark would stall on the last day that could. */
export function markLine(rest: number, foot: number, scrollTop: number, range: number): number {
  const slide = Math.min(range, foot - rest)
  if (slide <= 0) return rest
  const along = Math.min(1, Math.max(0, (scrollTop - (range - slide)) / slide))
  return rest + along * (foot - rest)
}

export function HomeRail(props: {
  settings: Settings
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  query: string
  onQuery: (query: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  /** Takes waiting to retry; the line shows only while there are some. */
  waiting: number
  days: readonly RailDay[]
  older: { day: string; count: number } | null
  /** Scrolls to a zone of the page, or opens a day and scrolls to it. */
  onGo: (place: string) => void
  onHide: () => void
  /** The key combo that hides the rail, for the button's tip. */
  hideKeys: string
  searchKeys: string
}): React.JSX.Element {
  const hideWords = props.settings.history.hideWords
  const [place, setPlace] = useState<string>(OVERVIEW)
  // A click's smooth scroll passes other days; the mark waits on the pick.
  const locked = useRef(false)
  const lockTimer = useRef(0)
  // The place last clicked. A day near the page's end cannot scroll up
  // to where the line rests, so it keeps the mark until scrolling
  // brings the sliding line past it. Anywhere else, scrolling leads.
  const picked = useRef<string | null>(null)
  // Where the page rested when the last click's scroll settled.
  const pickedAt = useRef(0)
  const remeasure = useRef<() => void>(() => undefined)

  useEffect(() => {
    let frame = 0
    const measure = (): void => {
      frame = 0
      if (locked.current) return
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--masthead-h')) || 56
      const rest = header + 84
      const box = pageScroller()
      const range = box ? box.scrollHeight - box.clientHeight : 0
      const line = box ? markLine(rest, box.getBoundingClientRect().bottom, box.scrollTop, range) : rest
      let next = OVERVIEW
      let pickedTop: number | null = null
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.home [data-place]'))) {
        const top = el.getBoundingClientRect().top
        if (top <= line) next = el.dataset.place ?? next
        if (el.dataset.place === picked.current) pickedTop = top
      }
      if (!holdsPick(pickedTop, rest, line, (box?.scrollTop ?? 0) - pickedAt.current)) picked.current = null
      setPlace(picked.current ?? next)
    }
    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    remeasure.current = measure
    measure()
    const stop = onPageScroll(onScroll)
    window.addEventListener('resize', onScroll)
    // The line depends on how tall the page is: a day folding, a search
    // or a new take changes that without a scroll.
    const home = document.querySelector('.home')
    const grown = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll)
    if (home) grown?.observe(home)
    return () => {
      stop()
      grown?.disconnect()
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      window.clearTimeout(lockTimer.current)
    }
  }, [])

  const go = (target: string): void => {
    locked.current = true
    picked.current = target
    setPlace(target)
    let stop = (): void => undefined
    const release = (): void => {
      locked.current = false
      window.clearTimeout(lockTimer.current)
      stop()
      pickedAt.current = pageScroller()?.scrollTop ?? 0
      remeasure.current()
    }
    // An earlier click's timer must not unlock this one early.
    window.clearTimeout(lockTimer.current)
    stop = oncePageScrollEnds(release)
    lockTimer.current = window.setTimeout(release, 1500)
    props.onGo(target)
  }

  const mark = railMark(place, props.days)
  const item = (id: string, label: string, onClick: () => void, extra?: React.ReactNode): React.JSX.Element => (
    <button
      key={id}
      className={`rail-item ${mark === id ? 'rail-item-on' : ''}`}
      aria-current={mark === id ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="rail-title">{label}</span>
      {extra}
    </button>
  )

  return (
    <aside className="rail home-rail" aria-label="Home">
      <div className="home-rail-top">
        <input
          ref={props.searchRef}
          type="search"
          className="field rail-search"
          placeholder={hideWords ? 'Search is off' : 'Search dictations'}
          aria-label="Search your dictations"
          aria-describedby={hideWords ? 'home-search-off' : undefined}
          title={hideWords ? undefined : `Search what you said (${props.searchKeys})`}
          disabled={hideWords}
          value={hideWords ? '' : props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') props.onQuery('')
          }}
        />
        <button
          className="icon-btn"
          aria-label="Hide sidebar"
          title={`Hide sidebar (${props.hideKeys})`}
          onClick={props.onHide}
        >
          <SidebarIcon />
        </button>
      </div>
      {hideWords && (
        <p className="rail-empty" id="home-search-off">
          {SEARCH_OFF}
        </p>
      )}

      <nav className="rail-nav" aria-label="Home sections">
        <div className="rail-group">
          <p className="rail-group-label">home</p>
          {item(OVERVIEW, 'Overview', () => go(OVERVIEW))}
          {props.waiting > 0 &&
            item(
              WAITING,
              'Waiting to retry',
              () => go(WAITING),
              <>
                <span className="rail-count">{props.waiting}</span>
                <span className="rail-dot" aria-hidden="true" />
                <span className="visually-hidden">, needs attention</span>
              </>
            )}
        </div>
        {props.days.length > 0 && (
          <div className="rail-group">
            <p className="rail-group-label">your dictations</p>
            {props.days.map((d) =>
              item(d.day, d.label, () => go(d.day), <span className="rail-count">{d.count.toLocaleString()}</span>)
            )}
            {props.older &&
              item(
                OLDER,
                'Older days',
                () => go(props.older?.day ?? OVERVIEW),
                <span className="rail-count">{props.older.count.toLocaleString()}</span>
              )}
          </div>
        )}
      </nav>

      {/* The id is the switch's address on Home, as row-hide-words is in Settings. */}
      <div className="home-rail-foot" id="home-hide-words">
        <div className="home-rail-hide">
          <span>Hide words</span>
          <Switch
            checked={hideWords}
            label="Hide words"
            describedBy={hideWords ? 'home-hide-words-line home-search-off' : 'home-hide-words-line'}
            onChange={(next) => void props.onUpdate({ history: { hideWords: next } } as Partial<Settings>)}
          />
        </div>
        <p className="home-rail-line" id="home-hide-words-line">
          {HIDE_WORDS_LINE}
        </p>
      </div>
    </aside>
  )
}
