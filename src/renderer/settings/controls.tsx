// SPDX-License-Identifier: GPL-3.0-only
// Settings building blocks shared by the page and its panels: the
// label-plus-control row and the commit-on-blur text field.
import { useEffect, useState } from 'react'
import { parseRecapTime } from '../../shared/recap'

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
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
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
  useEffect(() => setDraft(String(props.value)), [props.value])
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

export function Row(props: {
  label: string
  desc?: string
  anchor?: string
  highlight?: boolean
  /** flash is the red fix-this pulse; glow is the amber go-here-next
   *  nudge. Guidance and alarm must not share a color. */
  highlightStyle?: 'flash' | 'glow'
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={`row ${props.highlight ? (props.highlightStyle === 'glow' ? 'row-glow' : 'row-flash') : ''}`}
      id={props.anchor}
    >
      <div className="row-text">
        <div className="row-label">{props.label}</div>
        {props.desc && <div className="row-desc">{props.desc}</div>}
      </div>
      <div className="row-control">{props.children}</div>
    </div>
  )
}

export function ModelPicker(props: {
  value: string
  options: string[]
  placeholder?: string
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
  onCommit: (time: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  return (
    <input
      type="time"
      className="field"
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
