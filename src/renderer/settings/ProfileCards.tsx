// SPDX-License-Identifier: GPL-3.0-only
// The top of Provider and keys (US-154, LaBroi's pick B, 2026-11-08):
// what runs right now, then the saved profiles. A switch changes every
// setting a profile holds at once. When the setup moves away from the
// active profile, a bar offers Save, Save as new, and Undo, and the card
// says it changed. Profiles are murmur Pro; without Pro the area offers
// them and the setup below is 1 unnamed one. Rename sits beside Delete,
// and a double-click on a card renames it too (US-157, 2026-11-09).
//
// Many profiles stay small (US-160, LaBroi's pick 2026-11-10): the card
// in use, then 1 row of names that keeps its height at any count, with
// Show all to see every card and fold back. Or, his carousel idea as a
// view you pick (US-161): the cards on an arc, the front one large.
// Turning the arc or moving along the row never switches the setup;
// only a click, Enter, or Use this profile does.
import { useEffect, useRef, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { ProfileResult } from '../../main/profiles'
import type { ProviderCatalog } from '../../shared/catalog'
import { type KeysKnown, describeProfile, profileMatches, runningNow } from '../../shared/profiles'
import type { ProfilesView, ProviderProfile, Settings } from '../../shared/settings'
import proConfig from '../../../shared/pro.json'
import { AskFirst } from './AskFirst'
import { Row, Segmented } from './controls'

const bridge = (): SettingsApi => window.murmur

/** What runs speech and cleanup right now, whatever any profile says
 *  (US-152): unsaved changes and fallbacks included. */
export function RunningStrip(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  keys: KeysKnown
}): React.JSX.Element {
  const now = runningNow(props.settings, props.catalog, props.keys)
  return (
    <div className="running-strip" id="running-now">
      <p className="micro-label running-kicker">running now</p>
      <p className="running-lines">
        <span>
          Speech: <b>{now.speech}</b>
        </span>
        <span>
          Cleanup: <b>{now.cleanup}</b>
        </span>
      </p>
      {now.note && <p className="running-note">{now.note}</p>}
    </div>
  )
}

/** How long a single click on a card waits to see whether it is the
 *  start of a double-click, so renaming never switches the setup. */
export const DOUBLE_CLICK_WAIT_MS = 280

/** What a click on another card does, by its click count: the keyboard
 *  (0) switches now, a first mouse click waits to see if a second
 *  follows, and the second belongs to the double-click that renames. */
export function cardClick(detail: number): 'now' | 'wait' | 'ignore' {
  if (detail === 0) return 'now'
  return detail === 1 ? 'wait' : 'ignore'
}

/** What choosing a profile does: nothing for the one in use, ask first
 *  when the one in use has unsaved changes (switching would lose them),
 *  else switch. The same for a chip, a card, Enter and Use this profile. */
export function switchPlan(id: string, activeId: string | null, changed: boolean): 'none' | 'ask' | 'switch' {
  if (id === activeId) return 'none'
  return changed ? 'ask' : 'switch'
}

/** The view Profiles is shown in; any stored value but arc is the row. */
export function profilesView(settings: Settings): ProfilesView {
  return settings.provider.profilesView === 'arc' ? 'arc' : 'row'
}

/** Where a key moves focus along the row of names (US-160), or null for
 *  a key the row leaves alone. It never switches: switching changes the
 *  whole setup, so only Enter, Space or a click does that. Up and Down
 *  stay with the page. */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  if (key === 'ArrowRight') return Math.min(count - 1, index + 1)
  if (key === 'ArrowLeft') return Math.max(0, index - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** Which ends of the row of names fade: only an end with more names
 *  past it, and none while every name fits. */
export function fadeEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
  const more = scrollWidth - clientWidth
  if (more <= 1) return { start: false, end: false }
  return { start: scrollLeft > 1, end: scrollLeft < more - 1 }
}

/** Where a mouse wheel moves the row of names: a mostly up-and-down turn
 *  scrolls it sideways while it has room that way, and returns null when
 *  the page should have the wheel instead (the row fits, or it is at
 *  that end already). */
export function wheelScroll(scrollLeft: number, room: number, dx: number, dy: number): number | null {
  if (room <= 1 || Math.abs(dx) >= Math.abs(dy)) return null
  const next = Math.max(0, Math.min(room, scrollLeft + dy))
  return next === scrollLeft ? null : next
}

export interface ArcSlot {
  /** Sideways, in percent of a card's own width. */
  x: number
  /** Down, in px: the curve. */
  y: number
  rotate: number
  scale: number
  opacity: number
  z: number
  /** Brightness: the front card is 1, the rest dim with distance. */
  dim: number
}

/** Where a card sits on the arc by how far it is from the front (US-161):
 *  the front one large and upright, the others tilting back along a
 *  curve, smaller and dimmer, and gone past 2 away. The cards beside the
 *  front stay solid and dim by brightness, so the card behind one never
 *  shows its words through it. */
export function arcSlot(offset: number): ArcSlot {
  const a = Math.abs(offset)
  return {
    x: offset * 62,
    y: a * a * 7 + a * 10,
    rotate: offset * 7,
    scale: 1 - Math.min(a, 3) * 0.11,
    opacity: a <= 1 ? 1 : a === 2 ? 0.55 : 0,
    z: 10 - Math.min(a, 10),
    dim: a === 0 ? 1 : Math.max(0.4, 1 - a * 0.18)
  }
}

/** Which card a key turns the arc to, or null. Turning never switches. */
export function arcTurn(key: string, front: number, total: number): number | null {
  if (total <= 0) return null
  if (key === 'ArrowLeft') return Math.max(0, front - 1)
  if (key === 'ArrowRight') return Math.min(total - 1, front + 1)
  if (key === 'Home') return 0
  if (key === 'End') return total - 1
  return null
}

/** The arc's place, as on the board: 02 / 05. */
export function arcCount(front: number, total: number): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))
  return `${pad(front + 1)} / ${pad(total)}`
}

const REFUSED: Record<'pro' | 'not-found' | 'bad-name', string> = {
  pro: 'Profiles need murmur Pro.',
  'not-found': 'That profile is gone. It may have been deleted in another window.',
  'bad-name': 'Give the profile a name first.'
}

const Check = (): React.JSX.Element => (
  <svg className="profile-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function ProfileCards(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  /** Shared app-level license truth; null while it loads. */
  pro: boolean | null
  /** The Pro mark beside the label: filled for Pro, outlined as an offer. */
  mark?: React.ReactNode
  onSettings: (s: Settings) => void
  /** Re-read the key ring after a profile action. */
  onKeysChanged: () => void
  /** Open with every card showing, as after Show all (tests, captures). */
  initialShowAll?: boolean
}): React.JSX.Element | null {
  const { settings, catalog } = props
  // Naming a new profile: 'new' from + New or the + card, 'copy' from the bar.
  const [naming, setNaming] = useState<'new' | 'copy' | null>(null)
  const [name, setName] = useState('')
  // The profile a Delete is asking about, and a switch waiting on an
  // answer because the active profile has unsaved changes.
  const [deleting, setDeleting] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // The profile being renamed in place, and the name being typed.
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  // Show all opens every card under the row; the arc remembers which card
  // is in front (null: the one in use).
  const [showAll, setShowAll] = useState(props.initialShowAll === true)
  const [front, setFront] = useState<number | null>(null)
  // The row of names: which name holds the Tab stop, and which ends fade.
  const [rove, setRove] = useState<number | null>(null)
  const [fade, setFade] = useState({ start: false, end: false })
  const nameRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<number | null>(null)
  // Where focus goes once the view it asked for is drawn: the first of
  // these ids on screen (a card, else its name in the row, else the arc).
  // Handed over after the commit, never on a timer, so it cannot look
  // before the new view exists (found driving Show all, 2026-11-10).
  const focusNext = useRef<string[] | null>(null)
  const focusFirst = (ids: string[]): void => {
    focusNext.current = ids
  }

  const profiles = settings.provider.profiles
  const view = profilesView(settings)
  const activeIndex = profiles.findIndex((p) => p.id === settings.provider.activeProfile)
  const active = activeIndex >= 0 ? profiles[activeIndex] : null
  const changed = active !== null && !profileMatches(active, settings)
  const rowShown = props.pro === true && view === 'row' && !showAll && profiles.length > 0
  // A rename changes how wide the row is without resizing it.
  const names = profiles.map((p) => p.name).join('\n')

  useEffect(() => {
    const ids = focusNext.current
    if (!ids) return
    // Tried once, on the first commit after it was asked for, so a target
    // that never shows (deleted in another window) cannot pull focus later.
    focusNext.current = null
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) {
        el.focus()
        return
      }
    }
  })
  useEffect(() => {
    if (naming) nameRef.current?.focus()
  }, [naming])
  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [renaming])
  useEffect(() => {
    return () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
    }
  }, [])
  // A profile added or deleted moves the cards, so the arc comes back to
  // the one in use and the row's Tab stop to its name.
  useEffect(() => {
    setFront(null)
    setRove(null)
  }, [profiles.length])
  // The row's 1 Tab stop is the name in use whenever the row comes back
  // or another profile is put in use.
  useEffect(() => {
    setRove(null)
  }, [rowShown, active?.id])
  // The row's fade follows its width and its scroll, and the name in use
  // scrolls into sight inside the row (never the page).
  useEffect(() => {
    const box = chipsRef.current
    if (!rowShown || !box) return
    const measure = (): void => {
      const next = fadeEdges(box.scrollLeft, box.clientWidth, box.scrollWidth)
      setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }
    const on = active ? document.getElementById(`profile-chip-${active.id}`) : null
    if (on) reveal(box, on)
    measure()
    // A mouse with only an up-and-down wheel can still reach every name.
    const wheel = (e: WheelEvent): void => {
      const next = wheelScroll(box.scrollLeft, box.scrollWidth - box.clientWidth, e.deltaX, e.deltaY)
      if (next === null) return
      e.preventDefault()
      box.scrollLeft = next
    }
    box.addEventListener('scroll', measure, { passive: true })
    box.addEventListener('wheel', wheel, { passive: false })
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    watch?.observe(box)
    return () => {
      box.removeEventListener('scroll', measure)
      box.removeEventListener('wheel', wheel)
      watch?.disconnect()
    }
  }, [rowShown, names, active?.id])

  if (props.pro === null) return null
  if (!props.pro) {
    return (
      <div className="panel profiles-offer">
        <Row
          label="Profiles"
          anchor="row-profiles"
          mark={props.mark}
          keywords="profiles setups switch save provider pro"
          desc="murmur Pro: save this whole setup, speech and cleanup, under a name, and switch between setups in 1 click. Keys stay saved by provider, so switching never asks for one."
        >
          {proConfig.buyUrl ? (
            <button className="btn" onClick={() => void bridge().openBuyPage()}>
              Get Pro
            </button>
          ) : (
            <span className="dim">Pro feature</span>
          )}
        </Row>
      </div>
    )
  }

  const handle = (result: ProfileResult): void => {
    if (!result.ok) {
      setProblem(REFUSED[result.reason])
      return
    }
    setProblem(null)
    props.onSettings(result.settings)
    // Applying can fold a profile's old key file into the ring without
    // the base URL changing (live-found 2026-09-26), so the key status
    // is read again after every profile action.
    props.onKeysChanged()
  }
  // In the arc, focus goes back to the carousel itself, where the keys
  // work; elsewhere to the card, else its name in the row.
  const backTo = (id: string): void =>
    focusFirst(view === 'arc' ? ['profiles-arc'] : [`profile-card-${id}`, `profile-chip-${id}`])
  const pick = (id: string): void => {
    const plan = switchPlan(id, active?.id ?? null, changed)
    if (plan === 'none') return
    // A switch changes the card shown, so a rename left open goes.
    setRenaming(null)
    if (plan === 'ask') setSwitching(id)
    else void bridge().applyProviderProfile(id).then(handle)
  }
  const startRename = (id: string): void => {
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
    clickTimer.current = null
    setNewName(profiles.find((p) => p.id === id)?.name ?? '')
    setRenaming(id)
  }
  const endRename = (id: string): void => {
    setRenaming(null)
    if (view === 'arc') focusFirst([`profile-rename-${id}`, 'profiles-arc'])
    else backTo(id)
  }
  const saveRename = (id: string): void => {
    const trimmed = newName.trim()
    if (trimmed === '') return
    void bridge().renameProviderProfile(id, trimmed).then(handle)
    endRename(id)
  }
  // A mouse click waits a moment, so a double-click renames without
  // switching first; Enter or Space on a focused card (detail 0) switches
  // at once.
  const clickCard = (id: string, detail: number): void => {
    const plan = cardClick(detail)
    if (plan === 'now') pick(id)
    if (plan !== 'wait') return
    if (clickTimer.current !== null) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      pick(id)
    }, DOUBLE_CLICK_WAIT_MS)
  }
  const saveNamed = (): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    void bridge().saveProviderProfile(trimmed).then(handle)
    setName('')
    setNaming(null)
  }
  const setView = (next: ProfilesView): void => {
    setShowAll(false)
    setFront(null)
    void bridge()
      .updateSettings({ provider: { profilesView: next } as Settings['provider'] })
      .then(props.onSettings)
  }
  const toggleAll = (open: boolean): void => {
    setShowAll(open)
    focusFirst([open ? 'profiles-fold' : 'profiles-show-all'])
  }

  const renameCard = (p: ProviderProfile, on: boolean): React.JSX.Element => {
    const lines = describeProfile(p, catalog)
    return (
      <div className={on ? 'profile-card profile-card-on profile-editing' : 'profile-card profile-editing'}>
        <input
          ref={renameRef}
          className="field profile-rename-field"
          aria-label={`New name for ${p.name}`}
          maxLength={40}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveRename(p.id)
            if (e.key === 'Escape') {
              e.stopPropagation()
              endRename(p.id)
            }
          }}
        />
        <span className="profile-line">
          Speech: <b>{lines.speech}</b>
        </span>
        <span className="profile-line">
          Cleanup: <b>{lines.cleanup ?? 'not saved yet'}</b>
        </span>
        <div className="profile-rename-actions">
          <span className="profile-rename-hint">Enter saves, Escape cancels</span>
          <button className="btn" onClick={() => endRename(p.id)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={newName.trim() === ''} onClick={() => saveRename(p.id)}>
            Save
          </button>
        </div>
      </div>
    )
  }

  const cardBody = (p: ProviderProfile, on: boolean): React.JSX.Element => {
    const lines = describeProfile(p, catalog)
    return (
      <>
        <span className="profile-name">
          {on && <Check />}
          <span className="profile-name-text">{p.name}</span>
          {on && changed && <span className="profile-changed">changed</span>}
          {on && !changed && <span className="profile-inuse">in use</span>}
        </span>
        <span className="profile-line">
          Speech: <b>{lines.speech}</b>
        </span>
        <span className="profile-line">
          Cleanup: <b>{lines.cleanup ?? 'not saved yet'}</b>
        </span>
        {lines.cleanup === null && (
          <span className="profile-line profile-old">Saved before profiles held cleanup. Save it again to keep it.</span>
        )}
      </>
    )
  }

  const links = (p: ProviderProfile): React.JSX.Element => (
    <span className="profile-links">
      <button
        id={`profile-rename-${p.id}`}
        className="link-btn"
        aria-label={`Rename profile ${p.name}`}
        onClick={() => startRename(p.id)}
      >
        Rename
      </button>
      <button
        id={`profile-delete-${p.id}`}
        className="link-btn profile-delete"
        aria-label={`Delete profile ${p.name}`}
        aria-expanded={deleting === p.id}
        aria-controls={deleting === p.id ? 'profile-delete-confirm' : undefined}
        onClick={() => setDeleting(deleting === p.id ? null : p.id)}
      >
        Delete
      </button>
    </span>
  )

  // A card that switches on a click (US-154), renames on a double-click
  // (US-157), with Rename and Delete under it.
  const card = (p: ProviderProfile): React.JSX.Element => {
    const on = p.id === active?.id
    if (renaming === p.id) {
      return (
        <div className="profile-slot" key={p.id}>
          {renameCard(p, on)}
        </div>
      )
    }
    return (
      <div className="profile-slot" key={p.id}>
        <button
          id={`profile-card-${p.id}`}
          className={on ? 'profile-card profile-card-on' : 'profile-card'}
          aria-current={on ? 'true' : undefined}
          aria-description="Double-click to rename"
          onClick={(e) => {
            if (!on) clickCard(p.id, e.detail)
          }}
          onDoubleClick={() => startRename(p.id)}
        >
          {cardBody(p, on)}
        </button>
        {links(p)}
      </div>
    )
  }

  const newCard = (
    <button className="profile-card profile-new" aria-expanded={naming === 'new'} onClick={() => setNaming(naming === 'new' ? null : 'new')}>
      + Save this setup as a profile
    </button>
  )

  // The row of names (US-160): 1 Tab stop, arrows move it, Enter, Space
  // or a click switches.
  const roveAt = rove ?? Math.max(0, activeIndex)
  const chipKeys = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = rovingIndex(e.key, roveAt, profiles.length + 1)
    if (next === null) return
    e.preventDefault()
    setRove(next)
    const el = e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]
    if (!el) return
    el.focus({ preventScroll: true })
    if (chipsRef.current?.contains(el)) reveal(chipsRef.current, el)
  }
  const row = (
    <>
      {active ? (
        card(active)
      ) : (
        <div className="profile-card profile-card-none">
          <span className="profile-name">No profile in use</span>
          <span className="profile-line">This setup is not saved as a profile. Pick one below, or + New saves it.</span>
        </div>
      )}
      <div className="profile-row">
        <div className="profile-switch" role="toolbar" aria-label="Switch profile" onKeyDown={chipKeys}>
          <div ref={chipsRef} className={`profile-chips${fade.start ? ' fade-start' : ''}${fade.end ? ' fade-end' : ''}`}>
            {profiles.map((p, i) => {
              const on = p.id === active?.id
              return (
                <button
                  key={p.id}
                  id={`profile-chip-${p.id}`}
                  className={on ? 'profile-chip profile-chip-on' : 'profile-chip'}
                  aria-current={on ? 'true' : undefined}
                  tabIndex={i === roveAt ? 0 : -1}
                  onFocus={() => setRove(i)}
                  onClick={() => {
                    if (!on) pick(p.id)
                  }}
                >
                  {on && <Check />}
                  {p.name}
                  {on && <span className="visually-hidden">, in use</span>}
                </button>
              )
            })}
          </div>
          {/* Outside the scroll, so a new profile is 1 click away however
              many names there are. */}
          <button
            className="profile-chip profile-chip-new"
            aria-expanded={naming === 'new'}
            tabIndex={roveAt === profiles.length ? 0 : -1}
            onFocus={() => setRove(profiles.length)}
            onClick={() => setNaming(naming === 'new' ? null : 'new')}
          >
            + New
          </button>
        </div>
        <button id="profiles-show-all" className="link-btn profiles-more" aria-expanded={false} onClick={() => toggleAll(true)}>
          Show all {profiles.length}
        </button>
      </div>
    </>
  )

  const all = (
    <>
      <div className="profile-cards">
        {profiles.map(card)}
        {newCard}
      </div>
      {view === 'row' && (
        <div className="profiles-fold-line">
          <button id="profiles-fold" className="link-btn profiles-more" aria-expanded={true} onClick={() => toggleAll(false)}>
            Fold away
          </button>
        </div>
      )}
    </>
  )

  // The arc (US-161): every profile and a + card last, the one in use in
  // front to start. Turning never switches.
  const total = profiles.length + 1
  const frontAt = Math.max(0, Math.min(total - 1, front ?? Math.max(0, activeIndex)))
  const frontProfile = frontAt < profiles.length ? profiles[frontAt] : null
  const turnTo = (i: number): void => {
    setRenaming(null)
    setFront(Math.max(0, Math.min(total - 1, i)))
  }
  const arcKeys = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    // Keys pressed on the buttons inside the front card are theirs.
    if (e.target !== e.currentTarget) return
    const next = arcTurn(e.key, frontAt, total)
    if (next !== null) {
      e.preventDefault()
      turnTo(next)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!frontProfile) setNaming('new')
    else if (frontProfile.id !== active?.id) pick(frontProfile.id)
  }
  const arc = (
    <>
      <div
        id="profiles-arc"
        className="profile-arc"
        role="region"
        aria-roledescription="carousel"
        aria-label="Profiles, the arrow keys turn it"
        tabIndex={0}
        onKeyDown={arcKeys}
      >
        <div className="arc-track">
          {[...profiles, null].map((p, i) => {
            const offset = i - frontAt
            const at = arcSlot(offset)
            const isFront = offset === 0
            const style: React.CSSProperties = {
              transform: `translateX(calc(-50% + ${at.x}%)) translateY(${at.y}px) rotate(${at.rotate}deg) scale(${at.scale})`,
              opacity: at.opacity,
              zIndex: at.z,
              filter: isFront ? undefined : `brightness(${at.dim})`
            }
            if (!isFront) {
              return (
                <div
                  key={p?.id ?? 'new'}
                  className="arc-slot"
                  style={style}
                  aria-hidden="true"
                  onClick={() => turnTo(i)}
                >
                  {p ? (
                    <div className={p.id === active?.id ? 'profile-card profile-card-on' : 'profile-card'}>
                      {cardBody(p, p.id === active?.id)}
                    </div>
                  ) : (
                    <div className="profile-card profile-new">+ Save this setup as a profile</div>
                  )}
                </div>
              )
            }
            if (!p) {
              return (
                <div key="new" className="arc-slot arc-front" style={style}>
                  {newCard}
                </div>
              )
            }
            const on = p.id === active?.id
            return (
              <div key={p.id} className="arc-slot arc-front" style={style}>
                {renaming === p.id ? (
                  renameCard(p, on)
                ) : (
                  <div
                    id={`profile-card-${p.id}`}
                    className={on ? 'profile-card profile-card-on' : 'profile-card'}
                    tabIndex={-1}
                    onDoubleClick={() => startRename(p.id)}
                  >
                    {cardBody(p, on)}
                    {!on && (
                      <button
                        className="btn btn-primary profile-use"
                        onClick={() => {
                          // The button goes once the switch lands, so focus
                          // waits on the carousel.
                          focusFirst(['profiles-arc'])
                          pick(p.id)
                        }}
                      >
                        Use this profile
                      </button>
                    )}
                  </div>
                )}
                {renaming !== p.id && links(p)}
              </div>
            )
          })}
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {`${frontAt + 1} of ${total}: ${frontProfile ? frontProfile.name + (frontProfile.id === active?.id ? ', in use' : '') : 'save this setup as a profile'}`}
      </p>
      <div className="arc-nav">
        <button className="arc-arrow" aria-label="Previous profile" disabled={frontAt === 0} onClick={() => turnTo(frontAt - 1)}>
          ‹
        </button>
        <div className="arc-dots">
          {[...profiles, null].map((p, i) => (
            <button
              key={p?.id ?? 'new'}
              className={`arc-dot${i === frontAt ? ' arc-dot-front' : ''}${p && p.id === active?.id ? ' arc-dot-inuse' : ''}`}
              aria-label={p ? `${p.name}${p.id === active?.id ? ', in use' : ''}` : 'New profile'}
              aria-current={i === frontAt ? 'true' : undefined}
              // 1 per profile would be 1 Tab stop each; the arrows and the
              // carousel's keys already turn it from the keyboard.
              tabIndex={-1}
              onClick={() => turnTo(i)}
            />
          ))}
        </div>
        <span className="arc-count" aria-hidden="true">
          {arcCount(frontAt, total)}
        </span>
        <button
          className="arc-arrow"
          aria-label="Next profile"
          disabled={frontAt === total - 1}
          onClick={() => turnTo(frontAt + 1)}
        >
          ›
        </button>
      </div>
    </>
  )

  return (
    <div className="row row-block profiles-row" id="row-profiles" data-keywords="profiles setups switch save apply provider carousel arc">
      <div className="row-text">
        <div className="profiles-head">
          <div className="row-label micro-label profiles-label">
            Profiles
            {props.mark}
          </div>
          {(profiles.length > 1 || view === 'arc') && (
            <Segmented
              label="Show profiles as"
              value={view}
              options={[
                { value: 'row', label: 'Row' },
                { value: 'arc', label: 'Arc' }
              ]}
              onChange={setView}
            />
          )}
        </div>
      </div>
      <div className="row-control">
        {profiles.length === 0 ? (
          <div className="profile-cards">{newCard}</div>
        ) : view === 'arc' ? (
          arc
        ) : showAll ? (
          all
        ) : (
          row
        )}

        {naming && (
          <div className="inline profile-naming">
            <input
              ref={nameRef}
              className="field"
              placeholder="name this setup…"
              aria-label="Profile name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNamed()
                if (e.key === 'Escape') setNaming(null)
              }}
            />
            <button className="btn btn-primary" disabled={name.trim() === ''} onClick={saveNamed}>
              Save
            </button>
            <button className="btn" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </div>
        )}

        {active && changed && (
          <div className="profile-bar" role="status">
            <span className="profile-bar-text">
              You changed <b>{active.name}</b>. The change is working now. Keep it in the profile?
            </span>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => void bridge().resaveProviderProfile(active.id).then(handle)}>
                Save
              </button>
              <button className="btn" onClick={() => setNaming('copy')}>
                Save as new
              </button>
              <button className="btn" onClick={() => void bridge().applyProviderProfile(active.id).then(handle)}>
                Undo
              </button>
            </div>
          </div>
        )}

        {problem && (
          <p className="row-desc profile-problem" role="alert">
            {problem}
          </p>
        )}

        {switching !== null && active && (
          <AskFirst
            id="profile-switch-confirm"
            question={`Switch to ${profiles.find((p) => p.id === switching)?.name ?? 'that profile'}? Your unsaved change to ${active.name} is lost. Save it first to keep it.`}
            confirm="switch"
            keep="stay"
            busy={false}
            onConfirm={() => {
              const id = switching
              setSwitching(null)
              void bridge().applyProviderProfile(id).then(handle)
            }}
            onKeep={() => {
              const id = switching
              setSwitching(null)
              backTo(id)
            }}
          />
        )}
        {deleting !== null && (
          <AskFirst
            id="profile-delete-confirm"
            question={`Delete the profile ${profiles.find((p) => p.id === deleting)?.name ?? ''}? ${
              deleting === active?.id ? 'The setup keeps running, and your' : 'Your'
            } keys stay saved.`}
            confirm="delete it"
            keep="keep it"
            busy={false}
            onConfirm={() => {
              const id = deleting
              setDeleting(null)
              void bridge().deleteProviderProfile(id).then(handle)
            }}
            onKeep={() => {
              const id = deleting
              setDeleting(null)
              focusFirst([`profile-delete-${id}`])
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Scroll the row of names so this one shows, moving the row only. */
function reveal(box: HTMLElement, el: HTMLElement): void {
  const gap = 24
  const left = el.offsetLeft
  const right = left + el.offsetWidth
  if (left < box.scrollLeft + gap) box.scrollLeft = Math.max(0, left - gap)
  else if (right > box.scrollLeft + box.clientWidth - gap) box.scrollLeft = right - box.clientWidth + gap
}
