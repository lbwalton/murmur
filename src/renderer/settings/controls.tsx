// SPDX-License-Identifier: GPL-3.0-only
// Settings building blocks shared by the page and its panels: the
// section, its groups and rows, the switch and segmented
// choice, the commit-on-blur fields, and the jump that walks the eye
// to a row.
import { useEffect, useState } from 'react'
import { parseRecapTime } from '../../shared/recap'
import { Boundary } from './Boundary'

/** Text field that commits on blur or Enter, with optional suggestions. */
export function TextSetting(props: {
  value: string
  placeholder?: string
  listId?: string
  options?: string[]
  wide?: boolean
  /** Empty is a real value for this setting (a heading template that
   *  turns headings off), so an emptied field commits instead of
   *  snapping back. */
  allowEmpty?: boolean
  /** The field's accessible name, when the row label alone is ambiguous. */
  label?: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => {
    setDraft(props.value)
  }, [props.value])
  const commit = (): void => {
    const next = draft.trim()
    const usable = props.allowEmpty || next.length > 0
    if (usable && next !== props.value) props.onCommit(next)
    else setDraft(props.value)
  }
  return (
    <>
      <input
        className={`field mono-field ${props.wide ? 'wide-field' : ''}`}
        aria-label={props.label}
        value={draft}
        placeholder={props.placeholder}
        list={props.listId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {props.listId && props.options && (
        <datalist id={props.listId}>
          {props.options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  )
}

/**
 * Whole-number field that commits on blur or Enter. A draft outside
 * min..max snaps to the nearest bound instead of being refused, and an
 * unparseable draft reverts, so what reaches settings is always usable.
 */
export function NumberSetting(props: {
  value: number
  min: number
  max: number
  suffix?: string
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(props.value))
  useEffect(() => {
    setDraft(String(props.value))
  }, [props.value])
  const commit = (): void => {
    const parsed = Number(draft.trim())
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(props.value))
      return
    }
    const next = Math.min(props.max, Math.max(props.min, Math.round(parsed)))
    if (next !== props.value) props.onCommit(next)
    else setDraft(String(props.value))
  }
  return (
    <span className="inline">
      <input
        type="number"
        className="field number-field"
        min={props.min}
        max={props.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {props.suffix && <span className="mono-inline dim">{props.suffix}</span>}
    </span>
  )
}

/** A row id from its label, so search can land on rows that carry no
 *  explicit anchor. */
function rowId(label: string): string {
  return `row-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function Row(props: {
  label: string
  /** A mark after the label (the Pro mark, US-107). It carries no text,
   *  so search and jumps still read the label alone. */
  mark?: React.ReactNode
  desc?: React.ReactNode
  anchor?: string
  /** Stacks the control under the text at full width: lists, wide
   *  fields, and rows with more controls than fit beside a label. */
  block?: boolean
  /** With block: sets the control in under the label on a thin line,
   *  so a row with several controls reads as 1 setting (the Key rows,
   *  US-157). */
  indent?: boolean
  /** Extra words the settings search should match (synonyms a user
   *  might type that the label and description never say). */
  keywords?: string
  /** The row is waiting on another setting: it dims and says what it
   *  needs, the way Loop once it settles waits for Double-tap (US-155).
   *  The caller disables the control. */
  waits?: string
  /** A small line under the description: where else this setting shows
   *  (the way back to Shortcuts, US-165). Search does not read it. */
  also?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={['row', props.block && 'row-block', props.block && props.indent && 'row-indent', props.waits && 'row-waits']
        .filter(Boolean)
        .join(' ')}
      id={props.anchor ?? rowId(props.label)}
      data-keywords={props.keywords}
    >
      <div className="row-text">
        <div className="row-label">
          {props.label}
          {props.mark}
        </div>
        {props.desc && <div className="row-desc">{props.desc}</div>}
        {props.also && <div className="row-also">{props.also}</div>}
        {props.waits && (
          <div className="row-waits-note" id={`${props.anchor ?? rowId(props.label)}-waits`}>
            {props.waits}
          </div>
        )}
      </div>
      <div className="row-control">{props.children}</div>
    </div>
  )
}

/**
 * One settings section: a heading in the column, then its Groups, each
 * a panel with its rows in a well (US-155). The id is what the rail
 * scrolls to and tracks.
 */
export function Section(props: {
  id: string
  title: string
  /** A mark after the title (the Pro mark, US-107); textless, so search
   *  results still name the section by its title alone. */
  mark?: React.ReactNode
  sub?: string
  /** In place of the rows: the note a SectionGuard shows (US-163). */
  note?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section
      className="sec"
      id={`sec-${props.id}`}
      data-sec={props.id}
      aria-labelledby={`sec-${props.id}-title`}
    >
      {/* Focusable by script only: the rail moves keyboard focus here
          when it scrolls to the section. */}
      <h2 className="sec-title" id={`sec-${props.id}-title`} tabIndex={-1}>
        {props.title}
        {props.mark}
      </h2>
      {props.sub && <p className="sec-sub">{props.sub}</p>}
      {/* A problem drawing this section shows a note here; the title,
          the rail and every other section keep working (US-163). */}
      {props.note ?? (
        <Boundary kind="section" where={`section ${props.id}`}>
          <div className="sec-groups">{props.children}</div>
        </Boundary>
      )}
    </section>
  )
}

/** For a section drawn by its own component (Notes, Transform), whose
 *  hooks run above its Section: a problem there still shows the
 *  section's note under its title, not the whole-window note (US-163). */
export function SectionGuard(props: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Boundary
      kind="section"
      where={`section ${props.id}`}
      wrapNote={(note) => (
        <Section id={props.id} title={props.title} note={note}>
          {null}
        </Section>
      )}
    >
      {props.children}
    </Boundary>
  )
}

/**
 * A group of rows inside a Section (US-154, US-155): a heading a step
 * below the section's, a line on what the group does when that adds a
 * fact, and its rows inset in a well a step darker than the panel, so
 * what belongs together reads as 1 thing (LaBroi's pick, rows in a
 * well, 2026-11-08). A section with 4 rows or fewer is 1 Group with no
 * title (his pick, 2026-11-11).
 */
export function Group(props: {
  id: string
  title?: string
  sub?: string
  /** A line under the well: what else rides on this group, and links. */
  note?: React.ReactNode
  /** The heading folds the rows away, for settings most people never
   *  touch (File layout). The tag says what is inside while closed. A
   *  native details element, so it is keyboard reachable for free and a
   *  jump opens it by walking up from the row it lands on. */
  fold?: { tag: string; open?: boolean }
  children: React.ReactNode
}): React.JSX.Element {
  const titleId = `group-${props.id}-title`
  if (props.fold) {
    return (
      <details className="group group-fold" id={`group-${props.id}`} open={props.fold.open}>
        <summary className="group-summary">
          <h3 className="group-title" id={titleId}>
            {props.title}
          </h3>
          <span className="group-tag">{props.fold.tag}</span>
          {props.sub && <span className="group-sub">{props.sub}</span>}
        </summary>
        <div className="group-rows">{props.children}</div>
        {props.note && <p className="group-note">{props.note}</p>}
      </details>
    )
  }
  return (
    <section className="group" id={`group-${props.id}`} aria-labelledby={props.title ? titleId : undefined}>
      {props.title && (
        <h3 className="group-title" id={titleId}>
          {props.title}
        </h3>
      )}
      {props.sub && <p className="group-sub">{props.sub}</p>}
      <div className="group-rows">{props.children}</div>
      {props.note && <p className="group-note">{props.note}</p>}
    </section>
  )
}

/**
 * A setting that is 1 big box (a list, the practice box): the setting's
 * name is the group heading, its description the group line, and the
 * well holds the box itself, so nothing sits in a box inside a box
 * (LaBroi's pick, 2026-11-11). It is still a row to search and to
 * jumps: same id, label, description and keywords.
 */
export function GroupRow(props: {
  label: string
  desc?: React.ReactNode
  anchor?: string
  keywords?: string
  children: React.ReactNode
}): React.JSX.Element {
  const id = props.anchor ?? rowId(props.label)
  return (
    <section className="group group-row row" id={id} data-keywords={props.keywords} aria-labelledby={`${id}-title`}>
      <div className="row-text">
        <h3 className="group-title row-label" id={`${id}-title`}>
          {props.label}
        </h3>
        {props.desc && <p className="group-sub row-desc">{props.desc}</p>}
      </div>
      <div className="group-rows row-control">{props.children}</div>
    </section>
  )
}

/** On/off as a switch. On reads cream: signal amber stays reserved for
 *  live states. */
export function Switch(props: {
  checked: boolean
  label: string
  disabled?: boolean
  /** The id of a line that says why the switch is off limits. */
  describedBy?: string
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="switch-knob" />
    </button>
  )
}

/**
 * A short choice shown whole: every option visible, one click to pick.
 * A radiogroup with a roving tab stop; arrow keys move the choice.
 */
export function Segmented<T extends string>(props: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  label: string
  disabled?: boolean
  onChange: (next: T) => void
}): React.JSX.Element {
  const index = props.options.findIndex((o) => o.value === props.value)
  const move = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const n = props.options.length
    const next = props.options[(Math.max(index, 0) + step + n) % n]
    props.onChange(next.value)
    const buttons = e.currentTarget.querySelectorAll('button')
    buttons[(Math.max(index, 0) + step + n) % n]?.focus()
  }
  return (
    <div className="seg" role="radiogroup" aria-label={props.label} onKeyDown={move}>
      {props.options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={o.value === props.value || (index === -1 && i === 0) ? 0 : -1}
          disabled={props.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {/* The check shows on the picked option only, so the choice reads
              without color (US-149). Every option keeps its space, and the
              label reserves its bold width, so picking never shifts the row. */}
          <svg className="seg-check" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="seg-label" data-label={o.label}>
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Walks the eye to a row: opens any fold holding it, scrolls it to the
 * middle, and pulses it. flash is the red fix-this pulse; glow is the
 * amber go-here-next nudge; guidance and alarm never share a color.
 * focus puts the caret in the row's first field (a key to paste);
 * focusControl moves keyboard focus to the row's first control, so a
 * search hit lands the keyboard where the eye went.
 */
export function jumpToRow(
  anchor: string,
  options: { tone?: 'flash' | 'glow'; focus?: boolean; focusControl?: boolean } = {}
): void {
  const el = document.getElementById(anchor)
  if (!el) return
  const fold = el.closest('details')
  if (fold && !fold.open) fold.open = true
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  const cls = options.tone === 'glow' ? 'row-glow' : 'row-flash'
  el.classList.remove('row-glow', 'row-flash')
  // Restart the animation when the same row is pulsed twice in a row.
  void el.offsetWidth
  el.classList.add(cls)
  window.setTimeout(() => el.classList.remove(cls), 2600)
  if (options.focus) {
    const field = el.querySelector<HTMLElement>('input:not([type="range"]), textarea')
    field?.focus({ preventScroll: true })
  } else if (options.focusControl) {
    // A field first (a list's add line, a select), else the first button
    // in tab order, which for a segmented choice is its checked option.
    const control =
      el.querySelector<HTMLElement>('.row-control :is(input, select, textarea):not(:disabled)') ??
      el.querySelector<HTMLElement>('.row-control button:not(:disabled):not([tabindex="-1"])')
    control?.focus({ preventScroll: true })
  }
}

/** The way from a shortcut's own row to the Shortcuts section, where
 *  all of them sit together (US-165). It lands on the same shortcut. */
export function AlsoInShortcuts(props: { slug: string; label: string }): React.JSX.Element {
  return (
    <>
      also under{' '}
      <button
        className="link-btn"
        aria-label={`${props.label}, under Shortcuts`}
        onClick={() => jumpToRow(`row-shortcut-${props.slug}`, { tone: 'glow', focusControl: true })}
      >
        Shortcuts
      </button>
      , with every other shortcut
    </>
  )
}

export function ModelPicker(props: {
  value: string
  options: string[]
  placeholder?: string
  /** The accessible name for the select. */
  label?: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  // A real select instead of a datalist: datalists filter suggestions
  // by the text already in the field, so a filled field hides every
  // other model (live-found 2026-09-14). The last entry opens a free
  // text field for any id the provider serves. pending mirrors a
  // commit until the settings round trip lands, so the control never
  // flashes the old value for a render (same class of problem
  // TextSetting's draft state solves).
  const [typing, setTyping] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    if (pending !== null && props.value === pending) setPending(null)
  }, [props.value, pending])
  const effective = pending ?? props.value
  const known = props.options.includes(effective)
  return (
    <div className="inline">
      <select
        className="field"
        aria-label={props.label}
        value={!typing && known ? effective : 'custom'}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setTyping(true)
            return
          }
          setTyping(false)
          setPending(e.target.value)
          props.onCommit(e.target.value)
        }}
      >
        {props.options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
        <option value="custom">type a model id…</option>
      </select>
      {(typing || !known) && (
        <TextSetting
          value={effective}
          placeholder={props.placeholder}
          onCommit={(v) => {
            setPending(v)
            if (props.options.includes(v)) setTyping(false)
            props.onCommit(v)
          }}
        />
      )}
    </div>
  )
}

/**
 * Time field. Only a valid time commits, so a half-typed hour never
 * reaches settings, and an invalid draft reverts on blur. allowEmpty
 * makes clearing the field a real value (a reminder slot switched
 * off); without it an emptied field snaps back.
 */
export function TimeInput(props: {
  value: string
  disabled: boolean
  allowEmpty?: boolean
  /** The accessible name for the field. */
  label?: string
  onCommit: (time: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => {
    setDraft(props.value)
  }, [props.value])
  return (
    <input
      type="time"
      className="field"
      aria-label={props.label}
      value={draft}
      disabled={props.disabled}
      onChange={(e) => {
        setDraft(e.target.value)
        if (parseRecapTime(e.target.value)) props.onCommit(e.target.value)
        else if (props.allowEmpty && e.target.value === '') props.onCommit('')
      }}
      onBlur={() => {
        if (props.allowEmpty && draft === '') return
        if (!parseRecapTime(draft)) setDraft(props.value)
      }}
    />
  )
}
