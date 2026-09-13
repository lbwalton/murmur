// SPDX-License-Identifier: GPL-3.0-only
// History wiring: userData path, IPC for the home view, live append
// notifications to the settings window, retention pruning, smoke.
import { type BrowserWindow, app, ipcMain } from 'electron'
import { type SessionEvent, countWords, dayKey, wordsPerMinute } from '../../shared/history'
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
    wpm: wordsPerMinute(words, Math.max(1, now - input.startedAt)),
    day: dayKey(now),
    hour: new Date(now).getHours()
  }
  log.append(event)
  // Transcripts are sensitive: only the settings window (which renders
  // the log) receives them, never the overlay or audio windows.
  const win = getTargetWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send('history:appended', event)
  void notifyNewAchievements()
  void notifyNewPromotions()
  return event
}

// Achievement truth derives from the log; this state file only tracks
// which unlocks have already been ANNOUNCED so each fires exactly once.
async function notifyNewAchievements(): Promise<void> {
  try {
    const { isSmoke } = await import('../smoke')
    if (isSmoke || !log) return
    const { evaluateAchievements } = await import('../../shared/achievements')
    const defs = (await import('../../../shared/achievements.json')).default
    const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { Notification } = await import('electron')

    const stateFile = join(app.getPath('userData'), 'achievements-notified.json')
    let announced: string[] = []
    try {
      if (existsSync(stateFile)) {
        const parsed: unknown = JSON.parse(readFileSync(stateFile, 'utf8'))
        if (Array.isArray(parsed)) announced = parsed.filter((x) => typeof x === 'string')
      }
    } catch {
      // Corrupt state re-announces at worst; unlock truth is unaffected.
    }

    const earned = evaluateAchievements(log.readAll(), defs as never)
    const fresh = earned.filter((e) => !announced.includes(e.id))
    if (fresh.length === 0) return
    // Only ids actually shown get persisted (review gate finding: the
    // old write marked everything announced, permanently silencing any
    // unlock past the batch cap or on unsupported platforms).
    if (!Notification.isSupported()) return
    const toShow = fresh.slice(0, 3)
    const byId = new Map((defs as never as { achievements: { id: string; name: string }[] }).achievements.map((a) => [a.id, a.name]))
    for (const unlock of toShow) {
      new Notification({
        title: 'achievement unlocked',
        body: byId.get(unlock.id) ?? unlock.id
      }).show()
    }
    writeFileSync(stateFile, JSON.stringify([...announced, ...toShow.map((e) => e.id)]))
  } catch (error) {
    console.error('[murmur] achievement notify failed:', error)
  }
}

// Belt promotions announce themselves the same once-only way.
async function notifyNewPromotions(): Promise<void> {
  try {
    const { isSmoke } = await import('../smoke')
    if (isSmoke || !log) return
    const { computeProgress } = await import('../../shared/ranks')
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const { existsSync, readFileSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { Notification } = await import('electron')

    const stateFile = join(app.getPath('userData'), 'promotions-notified.json')
    let announced: string[] = []
    try {
      if (existsSync(stateFile)) {
        const parsed: unknown = JSON.parse(readFileSync(stateFile, 'utf8'))
        if (Array.isArray(parsed)) announced = parsed.filter((x) => typeof x === 'string')
      }
    } catch {
      // Corrupt state re-announces at worst.
    }

    const progress = computeProgress(log.readAll(), ranksSpec as never)
    const fresh = progress.promotions.filter((promo) => !announced.includes(promo.id))
    if (fresh.length === 0 || !Notification.isSupported()) return
    const ladder = (ranksSpec as never as { ranks: { id: string; label: string; title: string }[] }).ranks
    // Announce the highest new rank only; a backfill batch reads as one
    // promotion, which is how a gym would do it.
    const top = fresh[fresh.length - 1]
    const spec = ladder.find((r) => r.id === top.id)
    new Notification({
      title: 'belt promotion',
      body: spec ? `${spec.label} · ${spec.title}` : top.id
    }).show()
    writeFileSync(stateFile, JSON.stringify([...announced, ...fresh.map((f) => f.id)]))
  } catch (error) {
    console.error('[murmur] promotion notify failed:', error)
  }
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

  // Belt progression: computed in main from the log. The founder marker
  // is a file named founder in userData; it grants the 10th degree and
  // nothing else can (see shared/ranks.json).
  ipcMain.handle('ranks:progress', async () => {
    const { computeProgress } = await import('../../shared/ranks')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const founder = existsSync(join(app.getPath('userData'), 'founder'))
    return computeProgress(log?.readAll() ?? [], ranksSpec as never, { founder })
  })

  ipcMain.handle('achievements:defs', async () => {
    const defs = (await import('../../../shared/achievements.json')).default
    return (defs as never as { achievements: unknown[] }).achievements
  })

  ipcMain.handle('cosmetics:report', async () => {
    const { computeCosmetics } = await import('../../shared/cosmetics')
    const { computeProgress } = await import('../../shared/ranks')
    const { evaluateAchievements } = await import('../../shared/achievements')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cosmeticsSpec = (await import('../../../shared/cosmetics.json')).default
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const achievementDefs = (await import('../../../shared/achievements.json')).default
    const events = log?.readAll() ?? []
    const founder = existsSync(join(app.getPath('userData'), 'founder'))
    const progress = computeProgress(events, ranksSpec as never, { founder })
    const earned = evaluateAchievements(events, achievementDefs as never)
    return computeCosmetics(cosmeticsSpec as never, progress, earned)
  })

  ipcMain.handle('equivalents:line', async (_event, pick: unknown) => {
    const { equivalentLine } = await import('../../shared/equivalents')
    const spec = (await import('../../../shared/equivalents.json')).default
    const words = (log?.readAll() ?? []).reduce((n, e) => n + e.words, 0)
    const p = typeof pick === 'number' && pick >= 0 && pick <= 1 ? pick : 0.5
    return equivalentLine(words, spec as never, p)
  })

  ipcMain.handle('achievements:earned', async () => {
    const { evaluateAchievements } = await import('../../shared/achievements')
    const defs = (await import('../../../shared/achievements.json')).default
    return evaluateAchievements(log?.readAll() ?? [], defs as never)
  })

  registerSmokeCheck('achievements', async () => {
    // Self-contained: a synthetic session earns first-words, an empty
    // log earns nothing. No dependence on other checks' probes.
    const { evaluateAchievements } = await import('../../shared/achievements')
    const defs = (await import('../../../shared/achievements.json')).default
    const synthetic: SessionEvent = {
      at: Date.now(),
      durationMs: 4_000,
      rawText: 'p',
      finalText: 'p',
      words: 1,
      wpm: 15,
      day: '2026-01-01',
      hour: 10
    }
    const earned = evaluateAchievements([synthetic], defs as never)
    const empty = evaluateAchievements([], defs as never)
    return earned.some((e) => e.id === 'first-words') && empty.length === 0
  })

  registerSmokeCheck('ranks', async () => {
    const { computeProgress } = await import('../../shared/ranks')
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const events = log?.readAll() ?? []
    const report = computeProgress(events, ranksSpec as never)
    const founderReport = computeProgress(events, ranksSpec as never, { founder: true })
    return (
      report.rank.id !== 'red-10' &&
      report.totals.words >= 0 &&
      founderReport.rank.id === 'red-10' &&
      founderReport.next === null
    )
  })

  // Analytics travel as a computed summary: the renderer never needs
  // the full transcript log to draw charts and the cost card.
  ipcMain.handle('analytics:summary', async () => {
    const { aggregate } = await import('../../shared/analytics')
    const { ratesFromCatalog, validateCatalog } = await import('../../shared/catalog')
    const { effectiveLlmModel } = await import('../formatter')
    const catalog = validateCatalog((await import('../../../shared/provider-catalog.json')).default)
    if (!catalog) throw new Error('bundled provider catalog failed validation')
    const settings = getSettings()
    return aggregate(log?.readAll() ?? [], ratesFromCatalog(catalog), {
      sttModel: settings.provider.sttModel,
      // Priced with the same rule the pipeline routes with: an active
      // separate cleanup connection is what these sessions actually ran.
      llmModel: effectiveLlmModel(settings)
    })
  })

  // The activity wall gets its own channel: it spans up to a full year
  // and the renderer picks the period (rolling year or a calendar year).
  ipcMain.handle('analytics:heatmap', async (_event, year: unknown) => {
    const { heatmap } = await import('../../shared/analytics')
    const picked = typeof year === 'number' && Number.isInteger(year) ? year : null
    return heatmap(log?.readAll() ?? [], { year: picked })
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
    const { aggregate, heatmap } = await import('../../shared/analytics')
    const { ratesFromCatalog, validateCatalog } = await import('../../shared/catalog')
    const catalog = validateCatalog((await import('../../../shared/provider-catalog.json')).default)
    if (!catalog) return false
    const events = log?.readAll() ?? []
    const summary = aggregate(events, ratesFromCatalog(catalog), {
      sttModel: 'whisper-large-v3-turbo',
      llmModel: 'llama-3.3-70b-versatile'
    })
    const wall = heatmap(events)
    // The history smoke probe has already appended at least one event.
    return (
      summary.lifetime.sessions >= 1 &&
      summary.lifetime.estCostUsd > 0 &&
      summary.days.length === 14 &&
      wall.days.length >= 365 &&
      wall.totalWords >= 1 &&
      wall.years.length >= 1
    )
  })
}
