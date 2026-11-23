// SPDX-License-Identifier: GPL-3.0-only
// How worn the paper is today (US-186): today's painting a day, read
// when the window opens, after every take, after Clear all, and when the
// day turns (the window can stay open past midnight, and fresh paper
// comes with the new day). Only a theme whose painting wears asks. It
// starts from the window's address, so worn paper opens worn.
import { useEffect, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import { dayKey } from '../../shared/history'
import { todaysWear } from '../../shared/paperWear'
import { HISTORY_CLEARED } from './HomeView'
import { useToday } from './PageTitle'
import { addressWear } from './themeWear'

const bridge = (): SettingsApi => window.murmur

/** Today's wear step, 0 (fresh) to WEAR_STEPS; always 0 when `wears` is
 *  false. A book that cannot load keeps the step it had. */
export function usePaperWear(wears: boolean): number {
  const [step, setStep] = useState(() => addressWear(window.location.search))
  const today = useToday()
  useEffect(() => {
    if (!wears) return
    let live = true
    const load = (): void => {
      bridge()
        .listPaintings()
        .then((book) => {
          if (live) setStep(todaysWear(book, dayKey(Date.now())))
        })
        .catch(() => undefined)
    }
    load()
    const off = bridge().onHistoryAppended(load)
    window.addEventListener(HISTORY_CLEARED, load)
    return () => {
      live = false
      off()
      window.removeEventListener(HISTORY_CLEARED, load)
    }
  }, [wears, today])
  return wears ? step : 0
}
