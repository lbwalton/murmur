// SPDX-License-Identifier: GPL-3.0-only
// Asks in place before something is deleted (US-096, US-099): the
// question names the count, keep them has focus (so Enter, Escape, or a
// double click never deletes), and the button that deletes is red, the
// one use of red beside recording and errors (LaBroi, 2026-10-08).
// While it asks, the rest of its section dims (US-157, LaBroi's pick
// 2026-11-09), so the eye goes straight to the question.
import { useEffect, useRef } from 'react'

/** Dims everything in the box's section except the box and the path to
 *  it, and returns the undo. Dimmed parts stay usable; another open
 *  question is never dimmed. */
export function dimAround(box: HTMLElement): () => void {
  const scope = box.closest('section') ?? box.parentElement
  const dimmed: Element[] = []
  let node: HTMLElement = box
  while (node !== scope && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || sibling.classList.contains('ask-first') || sibling.hasAttribute('data-ask-dim')) continue
      sibling.setAttribute('data-ask-dim', '')
      dimmed.push(sibling)
    }
    node = node.parentElement
  }
  return () => {
    for (const el of dimmed) el.removeAttribute('data-ask-dim')
  }
}

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
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    keepRef.current?.focus()
    return boxRef.current ? dimAround(boxRef.current) : undefined
  }, [])
  return (
    <div
      ref={boxRef}
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
