// SPDX-License-Identifier: GPL-3.0-only
// Asks in place before something is deleted (US-096, US-099): the
// question names the count, keep them has focus (so Enter, Escape, or a
// double click never deletes), and the button that deletes is red, the
// one use of red beside recording and errors (LaBroi, 2026-10-08).
import { useEffect, useRef } from 'react'

export function AskFirst(props: {
  /** The question's id; the button that opened it points here. */
  id: string
  question: string
  /** The deleting button's label, with the count: discard 8, clear 1,204. */
  confirm: string
  /** The safe button's label: keep them, or keep it for one. */
  keep?: string
  busy: boolean
  onConfirm: () => void
  onKeep: () => void
}): React.JSX.Element {
  const keepRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    keepRef.current?.focus()
  }, [])
  return (
    <div
      className="ask-first"
      id={props.id}
      role="group"
      aria-labelledby={`${props.id}-question`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !props.busy) {
          e.stopPropagation()
          props.onKeep()
        }
      }}
    >
      <p id={`${props.id}-question`}>{props.question}</p>
      <span className="ask-first-actions">
        <button ref={keepRef} type="button" className="btn quiet-btn" disabled={props.busy} onClick={props.onKeep}>
          {props.keep ?? 'keep them'}
        </button>
        <button type="button" className="btn danger-btn" disabled={props.busy} onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </span>
    </div>
  )
}
