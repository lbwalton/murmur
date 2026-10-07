// SPDX-License-Identifier: GPL-3.0-only
// A small note that opens beside something after a moment of hovering
// (and at once on keyboard focus), for explanations too long for a
// tooltip: what the next level takes (US-093). The trigger is a button
// that opens the note at once when clicked (and closes it on a second
// click), so every screen reader names it; the note is linked as its
// description and read once. Escape, moving away, or blur closes it, and
// it opens leftward when there is no room on the right.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/** How long the pointer rests before the note opens. */
export const HOVER_DELAY_MS = 900

export function HoverNote(props: { note: React.ReactNode; children: React.ReactNode; className?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [leftward, setLeftward] = useState(false)
  const timer = useRef(0)
  const card = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // Measured once it is open: flip to the left if it would leave the window.
  useLayoutEffect(() => {
    if (!open || !card.current) return
    setLeftward(false)
    const box = card.current.getBoundingClientRect()
    if (box.right > window.innerWidth - 8) setLeftward(true)
  }, [open])
  const later = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), HOVER_DELAY_MS)
  }
  const close = (): void => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }
  return (
    <span className="hover-note" onMouseEnter={later} onMouseLeave={close}>
      <button
        type="button"
        className={`hover-note-trigger ${props.className ?? ''}`}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          window.clearTimeout(timer.current)
          setOpen((o) => !o)
        }}
      >
        {props.children}
      </button>
      <span ref={card} role="tooltip" id={id} className={`hover-note-card${leftward ? ' hover-note-left' : ''}`} hidden={!open}>
        {props.note}
      </span>
    </span>
  )
}
