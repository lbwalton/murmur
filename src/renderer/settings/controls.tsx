// SPDX-License-Identifier: GPL-3.0-only
// Settings building blocks shared by the page and its panels: the
// label-plus-control row and the commit-on-blur text field.
import { useEffect, useState } from 'react'

/** Text field that commits on blur or Enter, with optional suggestions. */
export function TextSetting(props: {
  value: string
  placeholder?: string
  listId?: string
  options?: string[]
  wide?: boolean
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  const commit = (): void => {
    const next = draft.trim()
    if (next.length > 0 && next !== props.value) props.onCommit(next)
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
