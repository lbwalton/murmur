// SPDX-License-Identifier: GPL-3.0-only
// Every tab opens with its own title and one quiet line (US-086), so the
// tab you are on is obvious from its first line.
import { useEffect, useState } from 'react'

const dayName = (): string =>
  new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

/** Today's date in words, kept current: the settings window lives on
 *  hidden for days, so the date refreshes when the window comes back
 *  into view and at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(dayName)
  useEffect(() => {
    const refresh = (): void => setToday(dayName())
    let timer = 0
    const arm = (): void => {
      const next = new Date()
      next.setHours(24, 0, 1, 0)
      timer = window.setTimeout(() => {
        refresh()
        arm()
      }, next.getTime() - Date.now())
    }
    arm()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}

export function PageTitle(props: { title: string; sub?: React.ReactNode }): React.JSX.Element {
  return (
    <header className="page-title">
      <h1>{props.title}</h1>
      {props.sub && <p className="dim">{props.sub}</p>}
    </header>
  )
}

/** Sentence case for a label stored lowercase (a rank, a page). */
export const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
