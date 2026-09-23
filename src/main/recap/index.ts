// SPDX-License-Identifier: GPL-3.0-only
// Daily recap: a native notification at the configured time summarizing
// the day, clicking through to the wrap-up page. Checks once a minute;
// a slept machine gets its recap late, once. Never fires UI in smoke.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Notification, app, ipcMain } from 'electron'
import { dayKey, eventDay } from '../../shared/history'
import { type RecapSummary, recapBody, shouldFire } from '../../shared/recap'
import { dayMinutesBack } from '../../shared/timeback'
import { getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { readStatsHistory } from '../history'

interface RecapState {
  lastFiredDay: string | null
}

let stateFile = ''
let onOpenWrapup: (() => void) | null = null

function readState(): RecapState {
  try {
    if (existsSync(stateFile)) {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as RecapState
      if (typeof parsed.lastFiredDay === 'string' || parsed.lastFiredDay === null) return parsed
    }
  } catch {
    // Corrupt state file: recap simply fires again today at worst.
  }
  return { lastFiredDay: null }
}

function writeState(state: RecapState): void {
  writeFileSync(stateFile, JSON.stringify(state))
}

function todaySummary(): RecapSummary {
  const today = dayKey(Date.now())
  // Transforms are recoverability records, not speech: stats never see them.
  const events = readStatsHistory()
  let sessions = 0
  let words = 0
  let minutes = 0
  for (const event of events) {
    if (eventDay(event) !== today) continue
    sessions += 1
    words += event.words
    minutes += event.durationMs / 60_000
  }
  const back = dayMinutesBack(events, today, getSettings().timeBack.typingWpm)
  return {
    sessions,
    words,
    minutes: Math.round(minutes * 10) / 10,
    // The same floor and rounding the analytics buckets apply.
    minutesBack: Math.round(Math.max(0, back) * 10) / 10
  }
}

function fireNotification(): void {
  if (isSmoke) return
  // Counts only in these logs, never transcript text. The show event
  // proves delivery to the OS; silence past that point means macOS is
  // suppressing it (permission, Focus, or the Electron identity).
  const supported = Notification.isSupported()
  console.log('[murmur] recap notification: supported =', supported)
  if (!supported) return
  const notification = new Notification({ title: 'murmur recap', body: recapBody(todaySummary()) })
  notification.on('click', () => onOpenWrapup?.())
  notification.on('show', () => console.log('[murmur] recap notification: handed to the OS'))
  notification.show()
}

function tick(): void {
  const settings = getSettings()
  if (!settings.recap.enabled) return
  const state = readState()
  if (!shouldFire(Date.now(), settings.recap.time, state.lastFiredDay)) return
  writeState({ lastFiredDay: dayKey(Date.now()) })
  fireNotification()
}

export function initRecap(handlers: { openWrapup: () => void }): void {
  onOpenWrapup = handlers.openWrapup
  stateFile = join(app.getPath('userData'), 'recap-state.json')

  const timer = setInterval(tick, 60_000)
  timer.unref()
  app.on('before-quit', () => clearInterval(timer))

  // The test button fires immediately without consuming today's recap.
  ipcMain.handle('recap:test', () => {
    fireNotification()
    return recapBody(todaySummary())
  })

  registerSmokeCheck('recap', () => {
    // Scheduler math plus the wrap-up data query, no UI notifications.
    // The body builder is exercised on a known day so the time back
    // clause is proven to join the sentence (US-060).
    const summary = todaySummary()
    const mathHolds =
      shouldFire(Date.now(), '00:00', null) &&
      !shouldFire(Date.now(), '00:00', dayKey(Date.now()))
    const clauseJoins = recapBody({ sessions: 4, words: 1240, minutes: 12, minutesBack: 19 }).endsWith(
      ' 19 minutes back.'
    )
    return (
      mathHolds &&
      clauseJoins &&
      typeof summary.sessions === 'number' &&
      summary.sessions >= 0 &&
      summary.minutesBack >= 0
    )
  })
}
