// SPDX-License-Identifier: GPL-3.0-only
// Keeping the dictionary current (US-184, US-185), the main process
// half. 2 ways a spelling reaches the dictionary, and both end in the
// same place: teachPair, which folds 1 pair into the list and tells
// the settings window.
//
// Learn from my fixes is off until the person turns it on, and macOS
// only for now. When it is on, a take that was pasted is followed for
// about a minute by the watcher in watch-script.ts, which reports no
// text of the box but the changes: murmur's words that went, and the
// 1 to 3 words now in their place. A fix seen in
// enough takes becomes a suggestion in Settings, Dictionary. murmur
// never adds a word by itself.
//
// What never happens here: the words are not logged (the log gets
// counts and reasons), not sent anywhere, and not kept beyond the fixes
// being counted, which follow history's own rules in store.ts.
import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { type BrowserWindow, Notification } from 'electron'
import { mergeDictionary } from '../../shared/dictionary-file'
import {
  type Candidate,
  type Fix,
  LEARN_WATCH_SECONDS,
  type Taught,
  countFixes,
  fixesFromChanges,
  fixesIn,
  isSpellingFix,
  selectionToFix,
  SUGGESTION_NOTICE,
  settleCandidate,
  suggestionsFrom,
  typedFix,
  worthWatching
} from '../../shared/learn'
import type { Settings } from '../../shared/settings'
import { ipc } from '../ipc'
import { MAX_NAME_CHARS, boundedText } from '../ipc-rules'
import { getSettings, onSettingsChanged, updateSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { writeAppLog } from '../window-watch'
import { LearnStore, type LearnWrap } from './store'
import { MAX_BOX_CHARS, WATCH_SCRIPT, parseWatchLine } from './watch-script'

/** What the settings window shows under Learn from my fixes. */
export interface LearnState {
  /** False where the watcher does not run yet (Windows). */
  supported: boolean
  /** Fixes ready to ask about, newest first. */
  suggestions: Array<{ heard: string; written: string; count: number }>
  /** False when Keep history for keeps no text, so no fix can be counted. */
  keeps: boolean
}

export type { Taught } from '../../shared/learn'

let store: LearnStore | null = null
let settingsWindow: () => BrowserWindow | null = () => null
let openDictionary: () => void = () => undefined
let notice: Notification | null = null

const liveWindow = (): BrowserWindow | null => {
  const target = settingsWindow()
  return target && !target.isDestroyed() ? target : null
}

export const learnSupported = (platform: NodeJS.Platform = process.platform): boolean => platform === 'darwin'

/**
 * Fold 1 pair into the dictionary: a word it already hears takes the
 * new spelling in place, a new word goes at the end. The settings
 * window holds its own copy of the list and writes that copy back with
 * the next word added there, so it is sent the new list at once.
 */
export function teachPair(fix: Fix, changed?: (settings: Settings) => void): Taught {
  // A pair that is no pair (an empty side, more than 1 line) teaches nothing.
  if (selectionToFix(fix.heard) !== fix.heard || typedFix(fix.heard, fix.written)?.written !== fix.written) return 'same'
  const plan = mergeDictionary(getSettings().dictionary, [{ from: fix.heard, to: fix.written }])
  if (plan.left > 0) return 'full'
  if (plan.added + plan.changed === 0) return 'same'
  const settings = updateSettings({ dictionary: plan.next })
  if (changed) changed(settings)
  else liveWindow()?.webContents.send('settings:pushed', settings)
  return plan.added > 0 ? 'added' : 'changed'
}

function state(): LearnState {
  const settings = getSettings()
  const list = store?.read() ?? []
  return {
    supported: learnSupported(),
    suggestions: suggestionsFrom(list, settings.dictionary).map(({ heard, written, count }) => ({ heard, written, count })),
    keeps: settings.history.retentionDays >= 0
  }
}

function pushState(): void {
  liveWindow()?.webContents.send('learn:changed', state())
}

function withdrawNotice(): void {
  notice?.close()
  notice = null
}

/** Count 1 take's fixes, and say so once when a fix becomes worth a
 *  question. Returns the fixes that just became suggestions. */
export function recordFixes(fixes: readonly Fix[], now = Date.now()): Candidate[] {
  if (!store || fixes.length === 0) return []
  const dictionary = getSettings().dictionary
  const before = store.read()
  const ready = suggestionsFrom(before, dictionary)
  const next = countFixes(before, fixes, now)
  store.write(next)
  const fresh = suggestionsFrom(store.read(), dictionary).filter(
    (candidate) => !ready.some((known) => known.heard === candidate.heard && known.written === candidate.written)
  )
  if (fresh.length === 0) return []
  pushState()
  if (!isSmoke && Notification.isSupported()) {
    withdrawNotice()
    notice = new Notification({ title: SUGGESTION_NOTICE.title, body: SUGGESTION_NOTICE.body, silent: true })
    notice.on('click', () => openDictionary())
    notice.show()
  }
  return fresh
}

// ---- The watcher ----------------------------------------------------

interface Watch {
  child: ChildProcess
  raw: string
  final: string
  /** The changes to the take as the watcher last saw them: murmur's
   *  words that went, and the 1 to 3 words in their place. Held in
   *  memory only, until the watch ends. */
  latest: ReadonlyArray<readonly [string, string]> | null
  why: string
  timer: NodeJS.Timeout
  done: boolean
}

let watching: Watch | null = null

function finish(watch: Watch): void {
  if (watch.done) return
  watch.done = true
  clearTimeout(watch.timer)
  if (watching === watch) watching = null
  const latest = watch.latest
  watch.latest = null
  let fixes: Fix[] = []
  try {
    if (latest !== null && getSettings().learn.watch) fixes = fixesFromChanges(watch.raw, watch.final, latest)
    const fresh = recordFixes(fixes)
    writeAppLog(`[learn] watch ended why=${watch.why} fixes=${fixes.length} ready=${fresh.length}`)
  } catch (error) {
    // Learning is a courtesy: a failure here never reaches a dictation.
    writeAppLog(`[learn] watch failed reason=${(error as Error | null)?.name ?? 'error'}`)
  }
}

function endWatch(why: string): void {
  const watch = watching
  if (!watch) return
  watch.why = why
  watch.child.kill()
  finish(watch)
}

/**
 * Follow the box a take was just pasted into. Called only after a
 * paste that landed; a take that was copied, saved, or failed is never
 * watched. Does nothing unless Learn from my fixes is on.
 */
export function watchTake(take: { raw: string; final: string }): void {
  if (isSmoke || !learnSupported() || !store) return
  // 1 box at a time: the next take ends the watch on the one before.
  endWatch('next')
  const settings = getSettings()
  if (!settings.learn.watch || settings.history.retentionDays < 0) return
  const words = take.final.trim()
  if (!worthWatching(words)) return
  let child: ChildProcess
  try {
    child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', WATCH_SCRIPT], { stdio: ['pipe', 'pipe', 'ignore'] })
  } catch (error) {
    writeAppLog(`[learn] watch could not start reason=${(error as NodeJS.ErrnoException | null)?.code ?? 'error'}`)
    return
  }
  const watch: Watch = {
    child,
    raw: take.raw,
    final: words,
    latest: null,
    why: 'exit',
    done: false,
    // The script stops itself; this is for one that hangs.
    timer: setTimeout(() => endWatch('timeout'), (LEARN_WATCH_SECONDS + 10) * 1000)
  }
  watch.timer.unref()
  watching = watch
  child.on('error', () => {
    watch.why = 'spawn'
    finish(watch)
  })
  child.on('close', () => finish(watch))
  child.stdin?.on('error', () => undefined)
  child.stdin?.end(JSON.stringify({ text: words, seconds: LEARN_WATCH_SECONDS, ownPid: process.pid, maxBox: MAX_BOX_CHARS }))
  if (!child.stdout) return
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (text) => {
    const line = parseWatchLine(text)
    if (line === null || watch.done) return
    if (line.s === 'fixes') watch.latest = line.f
    else if (line.s === 'skip' || line.s === 'end') watch.why = line.why
  })
}

/** Stop following a box, and learn nothing from it (quit, or the
 *  setting turned off). */
export function stopWatching(): void {
  const watch = watching
  if (!watch) return
  watch.latest = null
  watch.why = 'stopped'
  watch.child.kill()
  finish(watch)
}

/** Clear all forgets the fixes being counted, with the history they
 *  came from. */
export function clearLearned(): void {
  stopWatching()
  store?.clear()
  withdrawNotice()
  pushState()
}

export function initLearn(deps: {
  dir: string
  wrap: LearnWrap
  settingsWindow: () => BrowserWindow | null
  openDictionary: () => void
}): void {
  settingsWindow = deps.settingsWindow
  openDictionary = deps.openDictionary
  store = new LearnStore({
    dir: deps.dir,
    wrap: deps.wrap,
    encrypt: () => getSettings().history.encrypt,
    retentionDays: () => getSettings().history.retentionDays
  })
  // Off means nothing is kept: a file left from a time it was on goes.
  if (!getSettings().learn.watch) store.clear()

  let last = getSettings()
  onSettingsChanged((settings) => {
    const before = last
    last = settings
    if (before.learn.watch && !settings.learn.watch) {
      // Turned off: stop looking, and forget what was being counted.
      stopWatching()
      store?.clear()
      withdrawNotice()
      pushState()
      return
    }
    // Keep no text keeps no fix: a box being followed is let go, and the
    // fixes that were waiting leave with the store's next save, below.
    if (settings.history.retentionDays < 0 && before.history.retentionDays >= 0) stopWatching()
    if (
      before.history.encrypt !== settings.history.encrypt ||
      before.history.retentionDays !== settings.history.retentionDays
    ) {
      store?.resave()
      pushState()
    } else if (before.dictionary !== settings.dictionary) {
      // A word added by hand may answer a suggestion.
      pushState()
    }
  })

  ipc.handle('learn:state', (): LearnState => state())

  // The answer to a suggestion: add it to the dictionary, or never ask
  // about it again. Only a pair murmur is in fact suggesting can be
  // answered, so this channel cannot write an arbitrary word.
  ipc.handle('learn:answer', (_event, heardArg: unknown, writtenArg: unknown, how: unknown): LearnState => {
    const heard = boundedText(heardArg, MAX_NAME_CHARS)
    const written = boundedText(writtenArg, MAX_NAME_CHARS)
    if (!store || heard === null || written === null || (how !== 'add' && how !== 'dismiss')) return state()
    const asked = suggestionsFrom(store.read(), getSettings().dictionary).find(
      (candidate) => candidate.heard === heard && candidate.written === written
    )
    if (!asked) return state()
    const fix = { heard: asked.heard, written: asked.written }
    if (how === 'add') {
      const taught = teachPair(fix)
      writeAppLog(`[learn] suggestion answered how=add result=${taught}`)
      // A full dictionary keeps the suggestion, to answer once there is room.
      if (taught !== 'full') store.write(settleCandidate(store.read(), fix, 'added'))
    } else {
      store.write(settleCandidate(store.read(), fix, 'dismissed'))
      writeAppLog('[learn] suggestion answered how=dismiss')
    }
    withdrawNotice()
    return state()
  })

  registerSmokeCheck('learnFixes', async () => {
    // The whole path short of the watcher process, against the real
    // settings store: a take's edited words become a fix, 1 take
    // suggests nothing, the next makes it a suggestion, a yes puts the
    // pair in the dictionary and tells the window, a turned down pair
    // is never asked again, Clear all forgets, and none of the words
    // reached the log.
    const { buildDiagnosticsReport } = await import('../diagnostics')
    const before = getSettings()
    const kept = store
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'murmur-smoke-learn-'))
    try {
      store = new LearnStore({ dir, wrap: deps.wrap, encrypt: () => false, retentionDays: () => 90 })
      updateSettings({ dictionary: [], learn: { watch: true, fixBinding: before.learn.fixBinding } })
      const said = 'please send the smokeheard file to the team today'
      const fixes = fixesIn(said, said, 'please send the SmokeWritten file to the team today')
      const once = recordFixes(fixes).length === 0 && state().suggestions.length === 0
      const twice = recordFixes(fixes)
      const suggested = twice.length === 1 && state().suggestions[0]?.heard === 'smokeheard'
      const refused = suggestionsFrom(store.read(), []).length === 1 && teachPair({ heard: '', written: 'x' }) === 'same'
      let told: Settings | null = null
      const taught = teachPair({ heard: 'smokeheard', written: 'SmokeWritten' }, (settings) => {
        told = settings
      })
      const inDictionary = getSettings().dictionary.some((entry) => entry.from === 'smokeheard' && entry.to === 'SmokeWritten')
      const answered = state().suggestions.length === 0
      const other = fixesIn(said, said, 'please send the SmokeOther file to the team today')
      recordFixes(other)
      recordFixes(other)
      store.write(settleCandidate(store.read(), { heard: 'smokeheard', written: 'SmokeOther' }, 'dismissed'))
      recordFixes(other)
      const dismissed = state().suggestions.length === 0 && store.read().length > 0
      clearLearned()
      const cleared = store.read().length === 0
      const log = buildDiagnosticsReport()
      return (
        fixes.length === 1 &&
        isSpellingFix('smokeheard', 'SmokeWritten') &&
        once &&
        suggested &&
        refused &&
        taught === 'added' &&
        inDictionary &&
        (told as Settings | null)?.dictionary.length === 1 &&
        answered &&
        dismissed &&
        cleared &&
        !/smokeheard|smokewritten|smokeother/i.test(log)
      )
    } finally {
      store = kept
      rmSync(dir, { recursive: true, force: true })
      updateSettings({ dictionary: before.dictionary, learn: before.learn })
    }
  })
}
