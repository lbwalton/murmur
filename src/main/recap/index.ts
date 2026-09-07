// SPDX-License-Identifier: GPL-3.0-only
// Daily recap: a native notification at the configured time summarizing
// the day, clicking through to the wrap-up page. Checks once a minute;
// a slept machine gets its recap late, once. Never fires UI in smoke.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Notification, app, ipcMain } from 'electron'
import { dayKey, eventDay } from '../../shared/history'
import { shouldFire } from '../../shared/recap'
import { getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { readHistory } from '../history'

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

function todaySummary(): { sessions: number; words: number; minutes: number } {
  const today = dayKey(Date.now())
  let sessions = 0
  let words = 0
  let minutes = 0
  for (const event of readHistory()) {
    if (eventDay(event) !== today) continue
    sessions += 1
    words += event.words
    minutes += event.durationMs / 60_000
  }
  return { sessions, words, minutes: Math.round(minutes * 10) / 10 }
}

function recapBody(): string {
  const { sessions, words, minutes } = todaySummary()
  if (sessions === 0) return 'A quiet day: no dictations. Your hotkey misses you.'
  return `${sessions} ${sessions === 1 ? 'session' : 'sessions'}, ${minutes} minutes, ${words.toLocaleString()} words today.`
}

function fireNotification(): void {
  if (isSmoke) return
  // Counts only in these logs, never transcript text. The show event
  // proves delivery to the OS; silence past that point means macOS is
  // suppressing it (permission, Focus, or the Electron identity).
  const supported = Notification.isSupported()
  console.log('[murmur] recap notification: supported =', supported)
  if (!supported) return
  const notification = new Notification({ title: 'murmur recap', body: recapBody() })
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
    return recapBody()
  })

  registerSmokeCheck('recap', () => {
    // Scheduler math plus the wrap-up data query, no UI notifications.
    const summary = todaySummary()
    const mathHolds =
      shouldFire(Date.now(), '00:00', null) &&
      !shouldFire(Date.now(), '00:00', dayKey(Date.now()))
    return mathHolds && typeof summary.sessions === 'number' && summary.sessions >= 0
  })
}
