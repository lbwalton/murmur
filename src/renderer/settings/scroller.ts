// SPDX-License-Identifier: GPL-3.0-only
// The page scrolls in its own box under the top bar (US-150, round 2),
// so the bar can be glass: nothing ever scrolls behind it.

/** The box every page scrolls in, or null before the window has drawn. */
export function pageScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.page-scroll')
}

/** Notes how the page's box scrolls, for the styles: the width of its
 *  scroll bar gutter (so the top bar's column lines up with the page's),
 *  and whether the system always shows scroll bars (a mouse, or the
 *  setting), in which case the look draws the bar itself. Trackpad
 *  overlay bars take no room and are left as they are. */
export function markScrollbars(): void {
  const box = pageScroller()
  if (!box) return
  const root = document.documentElement
  if (box.offsetWidth - box.clientWidth > 0) root.dataset.scrollbars = 'classic'
  // Measured after the mark: under a look the drawn bar has its own width.
  root.style.setProperty('--page-gutter', `${box.offsetWidth - box.clientWidth}px`)
}

/** Gives the page's box the keyboard when nothing inside it has it, so
 *  Page Down, the arrows, Home and End scroll the page: the window
 *  itself no longer scrolls. Focus already inside the box stays put. */
export function focusPageScroller(): void {
  const box = pageScroller()
  if (!box || box.contains(document.activeElement)) return
  box.focus({ preventScroll: true })
}

/** Calls back on every scroll of the page, and returns how to stop. */
export function onPageScroll(listener: () => void): () => void {
  const box = pageScroller()
  box?.addEventListener('scroll', listener, { passive: true })
  return () => box?.removeEventListener('scroll', listener)
}

/** Calls back once when the page's current scroll settles; returns how
 *  to stop waiting. */
export function oncePageScrollEnds(listener: () => void): () => void {
  const box = pageScroller()
  box?.addEventListener('scrollend', listener, { once: true })
  return () => box?.removeEventListener('scrollend', listener)
}
