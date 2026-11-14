// SPDX-License-Identifier: GPL-3.0-only
// The place you are on, on Home (US-147): the zone or the day at the
// top of the page, or the one just clicked. Home marks it twice with
// the same gold: the sidebar's line, and that day's header in your
// dictations. So the gold follows you from date to date in both
// (LaBroi, 2026-11-14: the band on Today's header never moved, which is
// what "the gold line does not follow the date" meant all along). It
// lives here, above the sidebar, so the header keeps following while
// the sidebar is hidden. A date is reached 3 ways, and the gold goes
// with each: a click in the sidebar, a click on the date's own header
// in the list, and scrolling it to the top.
import { useEffect, useRef, useState } from 'react'
import { onPageScroll, oncePageScrollEnds, pageScroller } from './scroller'

export const OVERVIEW = 'overview'
export const WAITING = 'waiting'
export const OLDER = 'older'

/** How far under the top of the page's box a place must come to take
 *  the mark. A clicked day lands 16 px under the top (the box's 8 px
 *  of scroll padding and the day's own 8), and a folded day is about
 *  50 px tall, so the line sits between the day at the top and
 *  the next one: the gold is always on the day at the top (LaBroi,
 *  2026-11-12: at 84 px it ran a day or 2 ahead of folded days). */
export const MARK_LINE = 28

/** True while a clicked place keeps the mark. top is where the place
 *  sits, or null when it is not in view. It keeps it while the
 *  page rests where the click left it (moved is how far the page has
 *  scrolled since): the click chose that day. Once the page moves, it
 *  keeps it only while the page is at its end and the place sits short
 *  of the line (a day near the page's end cannot scroll up that far).
 *  Anywhere else, the day at the top leads. */
export function holdsPick(top: number | null, line: number, atEnd: boolean, moved: number): boolean {
  if (top === null) return false
  if (Math.abs(moved) <= 2) return true
  return top > line && atEnd
}

/** The day whose header wears the gold band: the day you are on, when
 *  it is 1 of the days showing. Above the days (Overview, Waiting to
 *  retry), or when a search has left that day out, it is Today, the
 *  band's home. With no Today showing either, no header wears it. */
export function goldDay(place: string, shown: readonly string[], today: string): string | null {
  if (shown.includes(place)) return place
  return shown.includes(today) ? today : null
}

/** Follows the place you are on as the page scrolls. pick(target) is
 *  for a click that chose a place: the mark goes there at once. A click
 *  that is about to scroll there (the sidebar's) waits out the scroll,
 *  which passes other days. A click that scrolls nowhere (a day's own
 *  header in the list) passes scrolls false: the mark holds while the
 *  page rests, and the day at the top leads again once it moves. */
export function useMarkedPlace(): { place: string; pick: (target: string, scrolls?: boolean) => void } {
  const [place, setPlace] = useState<string>(OVERVIEW)
  // A click's smooth scroll passes other days; the mark waits on the pick.
  const locked = useRef(false)
  const lockTimer = useRef(0)
  // The place last clicked. It keeps the mark while the page rests
  // where the click left it, and at the page's end, where a day cannot
  // scroll up to the line. Anywhere else, scrolling leads.
  const picked = useRef<string | null>(null)
  // Where the page rested when the last click's scroll settled.
  const pickedAt = useRef(0)
  const remeasure = useRef<() => void>(() => undefined)

  useEffect(() => {
    let frame = 0
    const measure = (): void => {
      frame = 0
      if (locked.current) return
      const box = pageScroller()
      // Measured from the box itself, so nothing above it can move the line.
      const boxTop = box ? box.getBoundingClientRect().top : 0
      const boxFoot = box ? box.getBoundingClientRect().bottom : window.innerHeight
      const line = boxTop + MARK_LINE
      let next = OVERVIEW
      let pickedTop: number | null = null
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.home [data-place]'))) {
        const top = el.getBoundingClientRect().top
        if (top <= line) next = el.dataset.place ?? next
        // Only a pick still in view can hold the mark.
        if (el.dataset.place === picked.current && top >= boxTop - 4 && top < boxFoot) pickedTop = top
      }
      const atEnd = box !== null && box.scrollTop + box.clientHeight >= box.scrollHeight - 2
      const moved = (box?.scrollTop ?? 0) - pickedAt.current
      if (!holdsPick(pickedTop, line, atEnd, moved)) picked.current = null
      setPlace(picked.current ?? next)
    }
    const onScroll = (): void => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    remeasure.current = measure
    measure()
    const stop = onPageScroll(onScroll)
    window.addEventListener('resize', onScroll)
    // A day folding, a search or a new take moves the days without a
    // scroll.
    const home = document.querySelector('.home')
    const grown = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll)
    if (home) grown?.observe(home)
    return () => {
      stop()
      grown?.disconnect()
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      window.clearTimeout(lockTimer.current)
    }
  }, [])

  const pick = (target: string, scrolls = true): void => {
    picked.current = target
    setPlace(target)
    if (!scrolls) {
      // Nothing to wait out: the page rests here, and the pick with it.
      locked.current = false
      window.clearTimeout(lockTimer.current)
      pickedAt.current = pageScroller()?.scrollTop ?? 0
      return
    }
    locked.current = true
    let stop = (): void => undefined
    const release = (): void => {
      locked.current = false
      window.clearTimeout(lockTimer.current)
      stop()
      pickedAt.current = pageScroller()?.scrollTop ?? 0
      remeasure.current()
    }
    // An earlier click's timer must not unlock this one early.
    window.clearTimeout(lockTimer.current)
    stop = oncePageScrollEnds(release)
    lockTimer.current = window.setTimeout(release, 1500)
  }

  return { place, pick }
}
