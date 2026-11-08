// SPDX-License-Identifier: GPL-3.0-only
// History wiring: userData path, IPC for the home view, live append
// notifications to the settings window, retention pruning, smoke.
import { type BrowserWindow, app, safeStorage } from 'electron'
import { ipc } from '../ipc'
import {
  HELD_RECORDING_MS,
  KEEP_NO_TEXT,
  type SessionEvent,
  countWords,
  countsTowardStats,
  dayKey,
  pasteTarget,
  recordingLimitMs,
  textCutoff,
  withoutText,
  wordsPerMinute
} from '../../shared/history'
import { getSettings, onSettingsChanged } from '../settings'
import { registerSmokeCheck } from '../smoke'
import { clearPaintings, initPaintings, syncPaintingsWith } from '../paintings'
import { watchHeld } from './held'
import { HistoryLog } from './log'
import { type KeyWrap, WordSeal } from './seal'

const keyWrap: KeyWrap = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (wrapped) => safeStorage.decryptString(wrapped)
}

// No seal means sealed lines read as numbers and new words stay plain,
// which Settings reports. It never stops history from starting.
function openSeal(dir: string): WordSeal | null {
  try {
    return new WordSeal(dir, keyWrap)
  } catch (error) {
    console.error('[murmur] could not open the history keys:', error)
    return null
  }
}

let log: HistoryLog | null = null
let getTargetWindow: (() => BrowserWindow | null) | null = null
// The newest entry recorded with persist false (a transform original
// with keep-originals off): held in memory only, so paste-last can
// still restore it until the next one or quit.
let memoryOnly: SessionEvent | null = null

/** A line for the log file. A failure's code says what went wrong with
 *  the file, and never holds a word. */
function noteFailure(what: string, error: unknown): void {
  const code = (error as NodeJS.ErrnoException | null)?.code ?? 'unknown'
  console.error(`[murmur] ${what}: ${code}`)
  void import('../window-watch').then(({ writeAppLog }) => writeAppLog(`[history] ${what}: ${code}`)).catch(() => undefined)
}

// Everything that measures speech reads this, never the raw log. These
// callers run during launch and after every take, so a log that cannot
// be read counts as empty here. Only here: a rewrite must see the error,
// or it would replace the file with nothing.
function statsEvents(): SessionEvent[] {
  try {
    return (log?.readNumbers() ?? []).filter(countsTowardStats)
  } catch (error) {
    noteFailure('could not read the log for stats', error)
    return []
  }
}

const RETENTION_CHECK_MS = 15 * 60 * 1000

// A held take's words went back on this entry, so paste-last aims here
// until something newer lands.
let restoredAt: number | null = null

// Runs the held recordings' check now; set once history starts.
let checkHeld: () => void = () => undefined

/** A take was just held, so its 24 hours join the watch. */
export function heldTakeSaved(): void {
  checkHeld()
}

// Don't keep: this session's words, in memory only, oldest first.
const SESSION_WORDS_CAP = 200
const sessionWords = new Map<number, SessionEvent>()

function rememberWords(event: SessionEvent): void {
  sessionWords.set(event.at, event)
  for (const at of sessionWords.keys()) {
    if (sessionWords.size <= SESSION_WORDS_CAP) break
    sessionWords.delete(at)
  }
}

// Moving Don't keep to 24 hours puts these words under that limit too.
function dropExpiredSessionWords(): void {
  const { retentionDays } = getSettings().history
  const cutoff = retentionDays === KEEP_NO_TEXT ? null : textCutoff(retentionDays, Date.now())
  if (cutoff === null) return
  for (const at of sessionWords.keys()) {
    if (at < cutoff) sessionWords.delete(at)
  }
}

function withSessionWords(events: SessionEvent[]): SessionEvent[] {
  dropExpiredSessionWords()
  return sessionWords.size === 0 ? events : events.map((event) => sessionWords.get(event.at) ?? event)
}

/** Whether a held take's words are still here, so its recording is a
 *  spare. After a quit it is the only copy. */
export function wordsInMemory(at: number): boolean {
  return sessionWords.has(at)
}

// Lazy, like the other cross-subsystem reads here, so history never
// depends on the transcribe stack to start.
async function recordingTools(): Promise<{
  waitingPastLimit: (retentionDays: number) => string[]
  heldTooLong: () => string[]
  nextHeld: () => number | null
  remove: (id: string) => void
}> {
  const { recoveryDir } = await import('../transcribe')
  const { heldPastLimit, listRecovery, nextHeldDue, removeRecovery } = await import('../transcribe/recovery')
  return {
    heldTooLong: () => heldPastLimit(listRecovery(recoveryDir()), Date.now(), HELD_RECORDING_MS),
    nextHeld: () => nextHeldDue(listRecovery(recoveryDir()), Date.now(), HELD_RECORDING_MS),
    waitingPastLimit: (retentionDays) => {
      const limit = recordingLimitMs(retentionDays)
      if (limit === null) return []
      const oldest = Date.now() - limit
      return listRecovery(recoveryDir())
        .filter((take) => take.savedAt < oldest)
        .map((take) => take.id)
    },
    remove: (id) => removeRecovery(recoveryDir(), id)
  }
}

// retentionDays null checks only the takes held for words that reached
// no app: their 24 hours count from launch, whatever Keep history says.
async function pruneRecordings(retentionDays: number | null): Promise<void> {
  try {
    const { waitingPastLimit, heldTooLong, remove } = await recordingTools()
    const { isRetrying, recoveryChanged } = await import('../retry')
    const past = retentionDays === null ? heldTooLong() : [...new Set([...waitingPastLimit(retentionDays), ...heldTooLong()])]
    const ids = past.filter((id) => !isRetrying(id))
    if (ids.length === 0) return
    for (const id of ids) remove(id)
    recoveryChanged()
    const { writeAppLog } = await import('../window-watch')
    writeAppLog(`[history] removed ${ids.length} recordings past the Keep history limit`)
  } catch (error) {
    console.error('[murmur] recording retention failed:', error)
  }
}

/** Record a finished dictation and notify the settings window. */
export function recordSession(input: {
  startedAt: number
  rawText: string
  finalText: string
  /** 'note' when the words went to a notes file instead of the cursor;
   *  'transform' for a spoken edit's original selection (US-054). */
  kind?: 'note' | 'transform'
  unsent?: boolean
  /** False keeps the event in memory only: never on disk, never sent
   *  to a window. Defaults to true. */
  persist?: boolean
  /** A retried take (US-068) is logged at the time it was spoken, so it
   *  lands on its own day; everything else is logged now. */
  at?: number
  retried?: boolean
}): SessionEvent | null {
  if (!log) return null
  const now = input.at ?? Date.now()
  const words = countWords(input.finalText)
  const event: SessionEvent = {
    at: now,
    durationMs: Math.max(0, now - input.startedAt),
    rawText: input.rawText,
    finalText: input.finalText,
    words,
    wpm: wordsPerMinute(words, Math.max(1, now - input.startedAt)),
    day: dayKey(now),
    hour: new Date(now).getHours(),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.unsent ? { unsent: true } : {}),
    ...(input.retried ? { retried: true } : {})
  }
  if (input.persist === false) {
    memoryOnly = event
    restoredAt = null
    return event
  }
  // With Don't keep, only the numbers reach the disk. The words stay in
  // memory until murmur quits, since a retried or saved take has nowhere
  // else to land, and Home and paste-last read them from here (US-137).
  const keepsText = getSettings().history.retentionDays !== KEEP_NO_TEXT
  memoryOnly = null
  restoredAt = null
  if (!keepsText) rememberWords(event)
  log.append(keepsText ? event : withoutText(event))
  // Transcripts are sensitive: only the settings window (which renders
  // the log) receives them, never the overlay or audio windows.
  const win = getTargetWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send('history:appended', event)
  void notifyNewAchievements()
  void notifyNewPromotions()
  void notifyTimeBack(event)
  return event
}

/** Put a held take's words back on its own entry. Its numbers were
 *  counted when it was spoken, so nothing counts twice. Null when the
 *  entry is gone. */
function restoreWords(at: number, rawText: string, finalText: string): SessionEvent | null {
  const entry = log?.readAll().find((event) => event.at === at)
  if (!entry) return null
  const { unreadable: _unreadable, ...numbers } = entry
  const event = { ...numbers, rawText, finalText }
  if (getSettings().history.retentionDays === KEEP_NO_TEXT) rememberWords(event)
  else {
    log?.fillWords(at, rawText, finalText)
    sessionWords.delete(at)
  }
  restoredAt = at
  const win = getTargetWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send('history:changed')
  return event
}

/** A retried take's words: back on the entry a held take was logged
 *  under, or as a new entry when it has none. */
export function logWords(input: Parameters<typeof recordSession>[0], loggedAt?: number): SessionEvent | null {
  return (loggedAt === undefined ? null : restoreWords(loggedAt, input.rawText, input.finalText)) ?? recordSession(input)
}

// Time back arrives after every take (US-060): the tray tooltip
// restates, and a 30-minute mark crossed by this take gets its nod.
// Lazily imported like the other announcers so a failure here can
// never cost the dictation that was just recorded.
async function notifyTimeBack(event: SessionEvent): Promise<void> {
  try {
    const { sessionLanded } = await import('../timeback')
    sessionLanded(event)
  } catch (error) {
    console.error('[murmur] time back notify failed:', error)
  }
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

    const earned = evaluateAchievements(statsEvents(), defs as never)
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

    const progress = computeProgress(statsEvents(), ranksSpec as never)
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

/** Every recorded event, oldest first, for recovery (paste-last). A
 *  memory-only entry newer than the log's tail rides at the end. */
export function readHistory(): SessionEvent[] {
  const events = withSessionWords(log?.readAll() ?? [])
  const last = events[events.length - 1]
  if (memoryOnly && (!last || memoryOnly.at >= last.at)) events.push(memoryOnly)
  return events
}

/** The entry paste-last pastes. */
export function eventToPaste(): SessionEvent | undefined {
  return pasteTarget(readHistory(), restoredAt)
}

/** True when this event is the memory-only entry (never on disk). */
export function isMemoryOnly(event: SessionEvent): boolean {
  return memoryOnly !== null && event === memoryOnly
}

/** The events that measure speech (recap, overlay accent, time back):
 *  transforms excluded. */
export function readStatsHistory(): SessionEvent[] {
  return statsEvents()
}

export function initHistory(settingsWindow: () => BrowserWindow | null): void {
  getTargetWindow = settingsWindow
  // First, so held recordings still go when anything below fails.
  checkHeld = watchHeld(async () => {
    await pruneRecordings(null)
    return (await recordingTools()).nextHeld()
  }, RETENTION_CHECK_MS)
  const dir = app.getPath('userData')
  log = new HistoryLog(dir, openSeal(dir))
  let lastEncrypt = getSettings().history.encrypt
  // A failure leaves the file as it was: murmur keeps working, the words
  // stay readable, and Settings counts the lines still waiting.
  const followSwitch = (): void => {
    try {
      log?.setSealing(lastEncrypt)
    } catch (error) {
      noteFailure('could not change how history is stored', error)
    }
  }
  followSwitch()
  let lastRetention = getSettings().history.retentionDays
  const applyShortLimit = (): void => {
    void pruneRecordings(lastRetention)
    dropExpiredSessionWords()
    void import('../notes/receipt').then(({ scrubLastNoteLine }) => {
      scrubLastNoteLine(textCutoff(lastRetention, Date.now()) ?? 0)
    })
  }
  // A damaged file must not stop murmur partway through starting.
  try {
    // The day's paintings are recorded before retention prunes the takes
    // they came from, so the collection outlives the log (US-098).
    syncPaintingsWith(log.readNumbers())
    log.applyRetention(lastRetention)
  } catch (error) {
    noteFailure('could not finish starting', error)
  }
  // A day limit removes recordings only when someone chooses it and sees
  // the question, so an update never deletes a waiting take unasked. The
  // 2 short limits are a promise about time, so they hold from launch.
  if (textCutoff(lastRetention, Date.now()) !== null) applyShortLimit()
  initPaintings(() => log?.readNumbers() ?? [])
  // Prune only when retention actually changes: every settings save
  // fires this listener, and rewriting the log each time is waste.
  onSettingsChanged((settings) => {
    if (settings.history.encrypt !== lastEncrypt) {
      lastEncrypt = settings.history.encrypt
      followSwitch()
    }
    if (settings.history.retentionDays !== lastRetention) {
      lastRetention = settings.history.retentionDays
      // A throw here would skip every listener after this one.
      try {
        if (log) syncPaintingsWith(log.readNumbers())
        log?.applyRetention(lastRetention)
      } catch (error) {
        noteFailure('could not apply Keep history', error)
      }
      void pruneRecordings(lastRetention)
      if (textCutoff(lastRetention, Date.now()) !== null) applyShortLimit()
    }
  })
  // A 24 hour limit has to hold while murmur stays open for days.
  setInterval(() => {
    if (textCutoff(lastRetention, Date.now()) === null) return
    // A throw in a timer would take the whole app down.
    try {
      log?.applyRetention(lastRetention)
    } catch (error) {
      noteFailure('could not apply Keep history', error)
    }
    applyShortLimit()
  }, RETENTION_CHECK_MS).unref()

  ipc.handle('history:list', () => withSessionWords(log?.readAll().slice(-500) ?? []))
  ipc.handle('history:sealStatus', () => log?.sealStatus() ?? { state: 'plain', unreadable: 0, pending: 0 })
  // What a shorter Keep history would remove, for its question (US-137).
  ipc.handle('history:keepImpact', async (_event, retentionDays: unknown) => {
    if (typeof retentionDays !== 'number') return { takes: 0, recordings: 0 }
    const { waitingPastLimit } = await recordingTools()
    return {
      takes: log?.countAffected(retentionDays) ?? 0,
      recordings: waitingPastLimit(retentionDays).length
    }
  })
  // Every entry in the log, for Clear all's question (US-099): the list
  // above stops at the newest 500.
  const historyCount = (): number => log?.readNumbers().length ?? 0
  ipc.handle('history:count', () => historyCount())
  // Answers with how many entries it removed, for Home's Cleared N line.
  ipc.handle('history:clear', async () => {
    const removed = historyCount()
    log?.clear()
    memoryOnly = null
    sessionWords.clear()
    // The paintings were drawn from it, so they go with it (US-098).
    clearPaintings()
    // Clear all forgets the last note's record too (LaBroi, 2026-10-02);
    // the note file itself stays where it landed. The log is already
    // empty here, so a failure to forget is logged, not reported.
    try {
      const { forgetLastNote } = await import('../notes/receipt')
      forgetLastNote()
    } catch (error) {
      console.error('[murmur] clear all could not forget the last note:', error)
    }
    return removed
  })

  // Belt progression: computed in main from the log. The founder marker
  // is a file named founder in userData; it grants the 10th degree and
  // nothing else can (see shared/ranks.json).
  ipc.handle('ranks:progress', async () => {
    const { computeProgress } = await import('../../shared/ranks')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const founder = existsSync(join(app.getPath('userData'), 'founder'))
    return computeProgress(statsEvents(), ranksSpec as never, { founder })
  })

  ipc.handle('achievements:defs', async () => {
    const defs = (await import('../../../shared/achievements.json')).default
    return (defs as never as { achievements: unknown[] }).achievements
  })

  ipc.handle('cosmetics:report', async () => {
    const { computeCosmetics } = await import('../../shared/cosmetics')
    const { computeProgress } = await import('../../shared/ranks')
    const { evaluateAchievements } = await import('../../shared/achievements')
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cosmeticsSpec = (await import('../../../shared/cosmetics.json')).default
    const ranksSpec = (await import('../../../shared/ranks.json')).default
    const achievementDefs = (await import('../../../shared/achievements.json')).default
    const events = statsEvents()
    const founder = existsSync(join(app.getPath('userData'), 'founder'))
    const progress = computeProgress(events, ranksSpec as never, { founder })
    const earned = evaluateAchievements(events, achievementDefs as never)
    return computeCosmetics(cosmeticsSpec as never, progress, earned)
  })

  ipc.handle('equivalents:line', async (_event, pick: unknown) => {
    const { equivalentLine } = await import('../../shared/equivalents')
    const spec = (await import('../../../shared/equivalents.json')).default
    const words = statsEvents().reduce((n, e) => n + e.words, 0)
    const p = typeof pick === 'number' && pick >= 0 && pick <= 1 ? pick : 0.5
    return equivalentLine(words, spec as never, p)
  })

  ipc.handle('achievements:earned', async () => {
    const { evaluateAchievements } = await import('../../shared/achievements')
    const defs = (await import('../../../shared/achievements.json')).default
    return evaluateAchievements(statsEvents(), defs as never)
  })

  registerSmokeCheck('historySealed', async () => {
    // A throwaway folder and the real secure storage: words are unreadable
    // on disk and read back, the switch goes both ways, and a lost key
    // leaves the numbers and every sealed line in place (US-138).
    if (!safeStorage.isEncryptionAvailable()) return false
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const scratch = mkdtempSync(join(tmpdir(), 'murmur-seal-'))
    try {
      const marked = 'smoke sealed words probe'
      const take = (at: number): SessionEvent => ({ at, durationMs: 1000, rawText: marked, finalText: marked, words: 4, wpm: 240 })
      const file = join(scratch, 'history.jsonl')
      const onDisk = (): string => readFileSync(file, 'utf8')
      const fresh = (): HistoryLog => new HistoryLog(scratch, new WordSeal(scratch, keyWrap))

      new HistoryLog(scratch).append(take(1))
      const sealedLog = fresh()
      sealedLog.setSealing(true)
      sealedLog.append(take(2))
      const migrated = !onDisk().includes(marked) && sealedLog.readAll().every((event) => event.finalText === marked)

      sealedLog.applyRetention(KEEP_NO_TEXT, () => 3)
      const scrubbed = sealedLog.readAll().every((event) => event.finalText === '' && event.words === 4)
      sealedLog.clear()
      sealedLog.append(take(4))
      sealedLog.append({ ...take(5), at: Date.now() })
      sealedLog.prune(1)
      const pruned = sealedLog.readAll().length === 1

      sealedLog.setSealing(false)
      const opened = onDisk().includes(marked)
      sealedLog.setSealing(true)
      const closed = !onDisk().includes(marked) && sealedLog.readAll()[0]?.finalText === marked

      rmSync(join(scratch, 'history-keys.json'))
      const before = onDisk()
      const lost = fresh()
      lost.setSealing(true)
      lost.applyRetention(0)
      const numbersStay = lost.readAll()[0]?.words === 4 && lost.readAll()[0]?.finalText === ''
      const keptSealed = onDisk() === before && lost.sealStatus().unreadable === 1

      const started = performance.now()
      for (let at = 0; at < 1000; at += 1) sealedLog.append(take(at))
      const fast = performance.now() - started < 1000

      const passed = migrated && scrubbed && pruned && opened && closed && numbersStay && keptSealed && fast
      if (!passed) {
        console.error(`smoke historySealed: ${JSON.stringify({ migrated, scrubbed, pruned, opened, closed, numbersStay, keptSealed, fast })}`)
      }
      return passed
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  registerSmokeCheck('keepNoText', async () => {
    // Don't keep: no words on disk, the numbers counted, and paste-last
    // still has the take in memory (US-137).
    const { updateSettings } = await import('../settings')
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const before = getSettings().history.retentionDays
    updateSettings({ history: { retentionDays: KEEP_NO_TEXT } } as never)
    const marked = 'smoke keep nothing probe'
    const recorded = recordSession({ startedAt: Date.now() - 1000, rawText: marked, finalText: marked })
    const onDisk = readFileSync(join(app.getPath('userData'), 'history.jsonl'), 'utf8')
    const last = readHistory().at(-1)
    updateSettings({ history: { retentionDays: before } } as never)
    // Sealed words would pass a search of the file, so the line itself
    // must hold none, sealed or plain.
    const line = JSON.parse(onDisk.trim().split('\n').at(-1) ?? '{}') as Partial<SessionEvent> & { sealed?: string }
    const noWords = line.rawText === '' && line.finalText === '' && line.sealed === undefined
    return recorded !== null && noWords && !onDisk.includes(marked) && last?.finalText === marked && (recorded.words ?? 0) === 4
  })

  registerSmokeCheck('keepNoTextHeld', async () => {
    // Don't keep: a take that reached no app holds its recording. After
    // a quit, Retry puts the words back on its own entry with nothing
    // counted twice, the recording stays, and a paste releases it.
    const { updateSettings } = await import('../settings')
    const { encodeWavPcm16 } = await import('../../shared/wav')
    const { holdRecording } = await import('../dictation')
    const { releaseHeldTake, retryTake } = await import('../retry')
    const { recoveryDir } = await import('../transcribe')
    const { listRecovery } = await import('../transcribe/recovery')
    const before = getSettings().history.retentionDays
    updateSettings({ history: { retentionDays: KEEP_NO_TEXT } } as never)
    try {
      const recorded = recordSession({ startedAt: Date.now() - 1000, rawText: 'smoke held', finalText: 'Smoke held.' })
      if (!recorded || !log) return false
      const wav = encodeWavPcm16(new Float32Array(16000), 16000)
      holdRecording(wav, 'dictation', recorded.at - 1000, recorded.at, 'idle')
      const held = (): boolean => listRecovery(recoveryDir()).some((take) => take.loggedAt === recorded.at)
      const take = listRecovery(recoveryDir()).find((waiting) => waiting.loggedAt === recorded.at)
      const entries = log.readAll().length
      sessionWords.delete(recorded.at) // What a quit does.
      const gone = readHistory().find((event) => event.at === recorded.at)?.finalText === ''
      if (!take) return false
      const result = await retryTake(take.id)
      const back = readHistory().find((event) => event.at === recorded.at)
      const once = log.readAll().length === entries
      const wordsBack = result.ok && (back?.finalText.length ?? 0) > 0 && back?.words === recorded.words
      const stays = held()
      releaseHeldTake(recorded.at)
      const passed = gone && wordsBack && once && stays && !held()
      if (!passed) console.error(`smoke keepNoTextHeld: ${JSON.stringify({ gone, wordsBack, once, stays })}`)
      return passed
    } finally {
      updateSettings({ history: { retentionDays: before } } as never)
    }
  })

  registerSmokeCheck('whatYouSaid', async () => {
    const { heardWords, offersWhatYouSaid } = await import('../../shared/word-diff')
    const marked = heardWords('send it tuesday sorry wednesday', 'Send it Wednesday.')
    const event = { at: 1, durationMs: 1, rawText: 'a b', finalText: 'A.', words: 1, wpm: 1 }
    return (
      marked.filter((word) => word.removed).length === 2 &&
      offersWhatYouSaid(event) &&
      !offersWhatYouSaid({ ...event, kind: 'transform' })
    )
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
    // The founder practices like anyone (US-095): four days and 6,300
    // words earn white belt, two stripes, whatever the flag says.
    const practiced: SessionEvent[] = [150, 3000, 3000, 150].map((words, i) => ({
      at: Date.UTC(2026, 0, 5 + i, 12),
      durationMs: 60_000,
      rawText: 'p',
      finalText: 'p',
      words,
      wpm: 100,
      day: `2026-01-0${5 + i}`,
      hour: 12
    }))
    const founderPractice = computeProgress(practiced, ranksSpec as never, { founder: true })
    return (
      report.rank.id !== 'red-10' &&
      report.totals.words >= 0 &&
      founderReport.rank.id === 'red-10' &&
      founderReport.next === null &&
      founderReport.practice.rank.id === report.rank.id &&
      founderPractice.rank.id === 'red-10' &&
      founderPractice.practice.rank.id === 'white-2' &&
      founderPractice.practice.next?.id === 'white-3'
    )
  })

  // Analytics travel as a computed summary: the renderer never needs
  // the full transcript log to draw charts and the cost card.
  ipc.handle('analytics:summary', async () => {
    const { aggregate } = await import('../../shared/analytics')
    const { ratesFromCatalog, validateCatalog } = await import('../../shared/catalog')
    const { effectiveLlmModel } = await import('../formatter')
    const catalog = validateCatalog((await import('../../../shared/provider-catalog.json')).default)
    if (!catalog) throw new Error('bundled provider catalog failed validation')
    const settings = getSettings()
    return aggregate(statsEvents(), ratesFromCatalog(catalog), {
      sttModel: settings.provider.sttModel,
      // Priced with the same rule the pipeline routes with: an active
      // separate cleanup connection is what these sessions actually ran.
      llmModel: effectiveLlmModel(settings),
      typingWpm: settings.timeBack.typingWpm
    })
  })

  // The activity wall gets its own channel: it spans up to a full year
  // and the renderer picks the period (rolling year or a calendar year).
  ipc.handle('analytics:heatmap', async (_event, year: unknown) => {
    const { heatmap } = await import('../../shared/analytics')
    const picked = typeof year === 'number' && Number.isInteger(year) ? year : null
    return heatmap(statsEvents(), { year: picked })
  })

  // The share card's month (US-078): the last 30 days' words and
  // sessions, totaled here from the whole log.
  ipc.handle('analytics:days', async () => {
    const { dailyTotals } = await import('../../shared/analytics')
    return dailyTotals(statsEvents(), 30)
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
    // Clear all's question counts the whole log, past the list's 500,
    // and the count grows with each entry.
    const before = historyCount()
    log.append(probe)
    const events = log.readAll()
    return events.some((e) => e.rawText === 'smoke history probe') && historyCount() === before + 1
  })

  registerSmokeCheck('analytics', async () => {
    const { aggregate, dailyTotals, heatmap } = await import('../../shared/analytics')
    const { ratesFromCatalog, validateCatalog } = await import('../../shared/catalog')
    const catalog = validateCatalog((await import('../../../shared/provider-catalog.json')).default)
    if (!catalog) return false
    const events = log?.readAll() ?? []
    const summary = aggregate(events, ratesFromCatalog(catalog), {
      sttModel: 'whisper-large-v3-turbo',
      llmModel: 'llama-3.3-70b-versatile'
    })
    const wall = heatmap(events)
    const month = dailyTotals(events, 30)
    // Time back rides the same summary: a known take (100 words in a
    // minute at 40 wpm is 1.5 back) plus the live log never below zero.
    const known = aggregate(
      [{ at: Date.now(), durationMs: 60_000, rawText: 'r', finalText: 'f', words: 100, wpm: 100 }],
      ratesFromCatalog(catalog),
      { typingWpm: 40 }
    )
    // The history smoke probe has already appended at least one event.
    return (
      summary.lifetime.sessions >= 1 &&
      summary.lifetime.estCostUsd > 0 &&
      summary.days.length === 14 &&
      summary.lifetime.minutesBack >= 0 &&
      summary.days.every((d) => d.minutesBack >= 0) &&
      known.lifetime.minutesBack === 1.5 &&
      wall.days.length >= 365 &&
      month.length === 30 &&
      month.reduce((n, d) => n + d.words, 0) >= 1 &&
      wall.totalWords >= 1 &&
      wall.years.length >= 1
    )
  })
}
