// SPDX-License-Identifier: GPL-3.0-only
// The settings rail (US-069): the setup badge, a search across every
// setting, and the section list that follows the column as it scrolls.
// Search reads the rendered rows themselves (label, description, and
// any keywords), so a setting is findable the day it ships with no
// index to keep in step.
import { useEffect, useRef, useState } from 'react'
import { jumpToRow } from './controls'
import type { SetupCheck, SetupStatusValue } from './SetupStatus'

export interface RailSection {
  id: string
  title: string
  group: string
  /** A setup check in this section is failing. */
  alert?: boolean
}

interface Match {
  id: string
  label: string
  section: string
}

const MAX_MATCHES = 8

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findSettings(query: string): Match[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const whole = words.map((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`))
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.settings-content .row[id]'))
  const scored: Array<Match & { score: number }> = []
  for (const row of rows) {
    const label = row.querySelector('.row-label')?.textContent ?? ''
    const desc = row.querySelector('.row-desc')?.textContent ?? ''
    const keywords = row.dataset.keywords ?? ''
    const section = row.closest('.sec')?.querySelector('.sec-title')?.textContent ?? ''
    const hay = `${label} ${desc} ${keywords} ${section}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    // Whole words in the label or keywords first (log finds Diagnostics
    // before Start at login), then the words anywhere in the label,
    // then anywhere at all; within a tier, page order.
    const named = `${label} ${keywords}`.toLowerCase()
    const score = whole.every((re) => re.test(named))
      ? 0
      : words.every((w) => label.toLowerCase().includes(w))
        ? 1
        : 2
    scored.push({ id: row.id, label, section, score })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_MATCHES)
    .map(({ id, label, section }) => ({ id, label, section }))
}

export function SettingsRail(props: {
  sections: RailSection[]
  groups: ReadonlyArray<{ id: string; label: string }>
  checks: SetupCheck[]
  status: SetupStatusValue
  /** The settings tab is showing; tracking only runs while it is. */
  visible: boolean
}): React.JSX.Element {
  const [current, setCurrent] = useState<string | null>(props.sections[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [selected, setSelected] = useState(0)
  const [checksOpen, setChecksOpen] = useState(false)
  const [arrived, setArrived] = useState(false)
  // While a rail click's smooth scroll runs, the highlight stays on the
  // pick; the scroll's end (or a timeout) hands tracking back.
  const locked = useRef(false)
  const wasBad = useRef(false)

  // The badge answers the moment setup comes good with one soft pulse.
  // Only a real fix earns it (bad at some point since the last all set,
  // however many checking steps came between), never the first check
  // after launch.
  useEffect(() => {
    if (props.status === 'bad') wasBad.current = true
    if (props.status !== 'ok') {
      setChecksOpen(false)
      return undefined
    }
    if (!wasBad.current) return undefined
    wasBad.current = false
    setArrived(true)
    const t = window.setTimeout(() => setArrived(false), 700)
    return () => {
      window.clearTimeout(t)
      setArrived(false)
    }
  }, [props.status])

  // Which section is in view: the last one whose heading has passed
  // the top band, or the last section once the page bottoms out.
  useEffect(() => {
    if (!props.visible) return undefined
    let frame = 0
    const measure = (): void => {
      frame = 0
      if (locked.current) return
      const secs = Array.from(document.querySelectorAll<HTMLElement>('.settings-content .sec[data-sec]'))
      if (secs.length === 0) return
      let next = secs[0].dataset.sec ?? null
      // The band starts under the pinned header (US-097), whatever its height.
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--masthead-h')) || 56
      for (const s of secs) {
        if (s.getBoundingClientRect().top <= header + 84) next = s.dataset.sec ?? next
      }
      const doc = document.documentElement
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        next = secs[secs.length - 1].dataset.sec ?? next
      }
      setCurrent(next)
    }
    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [props.visible])

  useEffect(() => {
    setMatches(findSettings(query))
    setSelected(0)
  }, [query])

  const holdHighlight = (id: string): void => {
    locked.current = true
    setCurrent(id)
    const release = (): void => {
      locked.current = false
      window.removeEventListener('scrollend', release)
    }
    window.addEventListener('scrollend', release)
    window.setTimeout(release, 1500)
  }

  const goTo = (id: string): void => {
    const el = document.getElementById(`sec-${id}`)
    if (!el) return
    holdHighlight(id)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    // The keyboard follows the eye: focus the section heading.
    el.querySelector<HTMLElement>('.sec-title')?.focus({ preventScroll: true })
  }

  const pick = (match: Match): void => {
    setQuery('')
    const section = document.getElementById(match.id)?.closest<HTMLElement>('.sec')?.dataset.sec
    if (section) holdHighlight(section)
    jumpToRow(match.id, { tone: 'glow', focusControl: true })
  }

  const showSetup = (): void => {
    const card = document.getElementById('finish-setup')
    if (!card) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    card.classList.remove('row-flash')
    void card.offsetWidth
    card.classList.add('row-flash')
    window.setTimeout(() => card.classList.remove('row-flash'), 2600)
    card.querySelector<HTMLElement>('.fix .btn:not(:disabled)')?.focus({ preventScroll: true })
  }

  const failing = props.checks.filter((c) => c.state === 'bad').length
  const searching = query.trim() !== ''
  const listOpen = searching && matches.length > 0

  return (
    <aside className="rail" aria-label="Settings">
      <div className="rail-status">
        {props.status === 'ok' && (
          <button
            className={`health health-ok ${arrived ? 'health-arrive' : ''}`}
            aria-expanded={checksOpen}
            aria-controls={checksOpen ? 'setup-checks' : undefined}
            onClick={() => setChecksOpen((o) => !o)}
          >
            ✓ all set
          </button>
        )}
        {props.status === 'bad' && (
          <button className="health health-bad" onClick={showSetup}>
            ✗ {failing} to fix
          </button>
        )}
        {props.status === 'pending' && <span className="health health-pending">checking…</span>}
        {props.status === 'ok' && checksOpen && (
          <ul className="rail-checks" id="setup-checks">
            {props.checks.map((c) => (
              <li key={c.id}>{c.readyLabel}</li>
            ))}
          </ul>
        )}
      </div>

      <input
        type="search"
        role="combobox"
        className="field rail-search"
        placeholder="Search settings"
        aria-label="Search settings"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? 'rail-matches' : undefined}
        aria-activedescendant={listOpen ? `rail-match-${selected}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('')
          if (!listOpen) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelected((i) => Math.min(i + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelected((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            // Cancelled so the Enter does not go on to press whatever
            // control the jump focuses (a switch, a Remove, a capture).
            e.preventDefault()
            pick(matches[selected] ?? matches[0])
          }
        }}
      />

      {searching ? (
        matches.length === 0 ? (
          <p className="rail-empty" role="status">
            Nothing matches. Try a word like key, hotkey, or sound.
          </p>
        ) : (
          <div className="rail-matches" id="rail-matches" role="listbox" aria-label="Matching settings">
            {matches.map((m, i) => (
              // Options are picked by mouse here and by the arrow keys
              // and Enter in the search field, per the combobox pattern.
              <div
                key={m.id}
                id={`rail-match-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`rail-match ${i === selected ? 'rail-match-on' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
              >
                <span className="rail-match-label">{m.label}</span>
                <span className="rail-match-section">{m.section}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <nav className="rail-nav" aria-label="Settings sections">
          {props.groups.map((g) => (
            <div key={g.id} className="rail-group">
              <p className="rail-group-label">{g.label}</p>
              {props.sections
                .filter((s) => s.group === g.id)
                .map((s) => (
                  <button
                    key={s.id}
                    className={`rail-item ${current === s.id ? 'rail-item-on' : ''}`}
                    aria-current={current === s.id ? 'true' : undefined}
                    onClick={() => goTo(s.id)}
                  >
                    <span>{s.title}</span>
                    {s.alert && (
                      <>
                        <span className="rail-dot" aria-hidden="true" />
                        <span className="visually-hidden">, needs attention</span>
                      </>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      )}
    </aside>
  )
}
