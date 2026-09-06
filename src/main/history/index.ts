// SPDX-License-Identifier: GPL-3.0-only
// History wiring: userData path, IPC for the home view, live append
// notifications to the settings window, retention pruning, smoke.
import { type BrowserWindow, app, ipcMain } from 'electron'
import { type SessionEvent, countWords, wordsPerMinute } from '../../shared/history'
import { getSettings, onSettingsChanged } from '../settings'
import { registerSmokeCheck } from '../smoke'
import { HistoryLog } from './log'

let log: HistoryLog | null = null
let getTargetWindow: (() => BrowserWindow | null) | null = null

/** Record a finished dictation and notify the settings window. */
export function recordSession(input: {
  startedAt: number
  rawText: string
  finalText: string
}): SessionEvent | null {
  if (!log) return null
  const now = Date.now()
  const words = countWords(input.finalText)
  const event: SessionEvent = {
    at: now,
    durationMs: Math.max(0, now - input.startedAt),
    rawText: input.rawText,
    finalText: input.finalText,
    words,
    wpm: wordsPerMinute(words, Math.max(1, now - input.startedAt))
  }
  log.append(event)
  // Transcripts are sensitive: only the settings window (which renders
  // the log) receives them, never the overlay or audio windows.
  const win = getTargetWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send('history:appended', event)
  return event
}

/** Read-only access to the log for other main subsystems (recap). */
export function readHistory(): SessionEvent[] {
  return log?.readAll() ?? []
}

export function initHistory(settingsWindow: () => BrowserWindow | null): void {
  getTargetWindow = settingsWindow
  log = new HistoryLog(app.getPath('userData'))
  let lastRetention = getSettings().history.retentionDays
  log.prune(lastRetention)
  // Prune only when retention actually changes: every settings save
  // fires this listener, and rewriting the log each time is waste.
  onSettingsChanged((settings) => {
    if (settings.history.retentionDays !== lastRetention) {
      lastRetention = settings.history.retentionDays
      log?.prune(lastRetention)
    }
  })

  ipcMain.handle('history:list', () => log?.readAll().slice(-500) ?? [])
  ipcMain.handle('history:clear', () => {
    log?.clear()
    return []
  })

  // Analytics travel as a computed summary: the renderer never needs
  // the full transcript log to draw charts and the cost card.
  ipcMain.handle('analytics:summary', async () => {
    const { aggregate } = await import('../../shared/analytics')
    const rates = (await import('../../../shared/rates.json')).default
    const settings = getSettings()
    return aggregate(log?.readAll() ?? [], rates as never, {
      sttModel: settings.provider.sttModel,
      llmModel: settings.provider.llmModel
    })
  })

  registerSmokeCheck('history', () => {
    if (!log) return false
    const probe: SessionEvent = {
      at: Date.now(),
      durationMs: 4_000,
      rawText: 'smoke history probe',
      finalText: 'Smoke history probe.',
      words: 3,
      wpm: 45
    }
    log.append(probe)
    const events = log.readAll()
    return events.some((e) => e.rawText === 'smoke history probe')
  })

  registerSmokeCheck('analytics', async () => {
    const { aggregate } = await import('../../shared/analytics')
    const rates = (await import('../../../shared/rates.json')).default
    const summary = aggregate(log?.readAll() ?? [], rates as never, {
      sttModel: 'whisper-large-v3-turbo',
      llmModel: 'llama-3.3-70b-versatile'
    })
    // The history smoke probe has already appended at least one event.
    return (
      summary.lifetime.sessions >= 1 &&
      summary.lifetime.estCostUsd > 0 &&
      summary.days.length === 14
    )
  })
}
