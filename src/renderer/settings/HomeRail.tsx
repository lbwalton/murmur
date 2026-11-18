// SPDX-License-Identifier: GPL-3.0-only
// Home's rail (US-147), built from the Settings rail's parts: a search
// across what you said, the page's zones, each day with its count, and
// Hide words. Its gold line marks the place you are on (homeMark).
import type { Settings } from '../../shared/settings'
import { Switch } from './controls'
import { HIDE_WORDS_LINE } from './HideWords'
import { type RailDay, SEARCH_OFF } from './homeDays'
import { OLDER, OVERVIEW, WAITING } from './homeMark'

/** The sidebar glyph on the hide and show buttons. */
export function SidebarIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  )
}

/** Which rail item a place on the page lights: a named day lights its
 *  own line, any other day lights Older days. */
export function railMark(place: string, days: readonly RailDay[]): string {
  if (place === OVERVIEW || place === WAITING) return place
  return days.some((d) => d.day === place) ? place : OLDER
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
  /** The place you are on (homeMark): its line wears the gold. */
  place: string
  /** Scrolls to a zone of the page, or opens a day and scrolls to it. */
  onGo: (place: string) => void
  onHide: () => void
  /** The key combo that hides the rail, for the button's tip. */
  hideKeys: string
  searchKeys: string
}): React.JSX.Element {
  const hideWords = props.settings.history.hideWords
  const go = props.onGo

  const mark = railMark(props.place, props.days)
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
