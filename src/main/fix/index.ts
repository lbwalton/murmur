// SPDX-License-Identifier: GPL-3.0-only
// Fix a word (US-184): select a word murmur got wrong in any app, press
// the chord, and type how it should be written. murmur pastes the
// spelling over the selection and saves the pair to the dictionary, so
// the word comes out right from then on.
//
// The order is the guarantee. The selection is read first, through the
// same copy keystroke Transform uses, and the clipboard is the person's
// again before the panel opens. Nothing is saved or pasted until they
// press Enter. The pair goes to the dictionary on this computer and
// nowhere else, and the log gets outcomes, never the words.
//
// The panel is the 1 murmur window that takes the keyboard while
// another app is in front. On macOS it is a panel that does not
// activate murmur, so the other app stays in front with its selection
// and gets the keyboard back when the panel closes. On Windows a
// window that closes hands focus back to the one before it. With
// copy only on, or when the paste key cannot be pressed, the spelling
// waits on the clipboard and the pair is saved all the same. murmur
// cannot see whether an app took a paste: where one does not, the pair
// is still saved and the word is the person's to fix by hand.
import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { FIX_HINTS, type Fix, type Taught, fixHint, heardInTranscript, selectionToFix, typedFix } from '../../shared/learn'
import type { Settings } from '../../shared/settings'
import { playCue } from '../audio'
import {
  type InsertOutcome,
  type SelectionRead,
  captureClipboard,
  insertText,
  readSelection,
  restoreClipboard
} from '../insertion'
import { ipc } from '../ipc'
import { MAX_NAME_CHARS, boundedText } from '../ipc-rules'
import { teachPair } from '../learn'
import { getOverlayPhase, showOverlayHint } from '../overlay'
import { getSettings, updateSettings } from '../settings'
import { registerSmokeCheck } from '../smoke'
import { devRendererUrl, watchWindow, writeAppLog } from '../window-watch'

const WIDTH = 440
const HEIGHT = 112
/** How long the panel waits for an answer before it closes itself. */
const ASK_TIMEOUT_MS = 120_000
/** How long the app in front gets to take the keyboard back. */
const FOCUS_RETURN_MS = process.platform === 'darwin' ? 120 : 250

export type FixOutcome =
  | 'fixed'
  | 'copied'
  | 'cancelled'
  | 'unchanged'
  | 'unreadable'
  | 'empty'
  | 'long'
  | 'busy'
  /** The panel came up and never got the keyboard. */
  | 'nofocus'
  | 'error'

let fixWindow: BrowserWindow | null = null
/** Whether the panel's page loaded: a page that did not cannot ask. */
let loaded: Promise<boolean> | null = null
let sequence = 0
let asking: { id: number; answer: (written: string | null) => void } | null = null
let shownAt = 0
const BLUR_GRACE_MS = 300
/** True from the chord press until its run ends: a second press
 *  while the first is still reading the selection does nothing. */
let running = false
/** How often an open panel checks that it still has the keyboard and
 *  that no take has started. */
const PANEL_CHECK_MS = 150

function createFixWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // A panel takes the keyboard without bringing murmur to the front.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/fix.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  watchWindow(win, 'fix')
  // A page that died cannot ask: the panel goes, and the next press
  // of the chord opens a new one.
  win.webContents.on('render-process-gone', () => {
    asking?.answer(null)
    if (!win.isDestroyed()) win.destroy()
  })
  loaded = new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve(true))
    win.webContents.once('did-fail-load', () => resolve(false))
  })
  const devServer = devRendererUrl()
  if (devServer) void win.loadURL(`${devServer}/fix/index.html`)
  else void win.loadFile(join(__dirname, '../renderer/fix/index.html'))
  // Clicking away is a no. A blur in the instant the panel comes up is
  // the window system settling, not the person.
  win.on('blur', () => {
    if (Date.now() - shownAt > BLUR_GRACE_MS) asking?.answer(null)
  })
  win.on('closed', () => {
    asking?.answer(null)
    if (fixWindow === win) fixWindow = null
  })
  return win
}

function place(win: BrowserWindow): void {
  const point = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(point).workArea
  const x = Math.min(Math.max(point.x - WIDTH / 2, area.x + 8), area.x + area.width - WIDTH - 8)
  // Under the pointer, or over it when there is no room below.
  const below = point.y + 24
  const y = below + HEIGHT <= area.y + area.height - 8 ? below : Math.max(point.y - HEIGHT - 24, area.y + 8)
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT })
}

/** What the panel came back with: a spelling, a no, or no keyboard. */
type Answer = { written: string } | 'closed' | 'nofocus'

/** Show the panel for 1 word and wait for the answer. */
async function askInPanel(heard: string): Promise<Answer> {
  if (!fixWindow || fixWindow.isDestroyed()) fixWindow = createFixWindow()
  const win = fixWindow
  if (!(await loaded) || win.isDestroyed()) return 'nofocus'
  const id = ++sequence
  return new Promise((resolve) => {
    const timer = setTimeout(() => asking?.id === id && asking.answer(null), ASK_TIMEOUT_MS)
    let hadKeyboard = false
    // Every so often while the panel is up: a take that starts would
    // paste into the panel, which has the keyboard, so the panel closes
    // and the take goes where it was meant to. And a panel that has
    // lost the keyboard (a click in another app, which on macOS sends
    // a panel no blur) closes too.
    const check = setInterval(() => {
      if (asking?.id !== id) return
      if (getOverlayPhase() === 'recording') return asking.answer(null)
      if (win.isDestroyed()) return asking.answer(null)
      if (win.isFocused()) hadKeyboard = true
      else if (Date.now() - shownAt > BLUR_GRACE_MS) asking.answer(null)
    }, PANEL_CHECK_MS)
    asking = {
      id,
      answer: (written) => {
        if (asking?.id !== id) return
        asking = null
        clearTimeout(timer)
        clearInterval(check)
        if (!win.isDestroyed()) win.hide()
        resolve(written !== null ? { written } : hadKeyboard || win.isDestroyed() ? 'closed' : 'nofocus')
      }
    }
    place(win)
    win.webContents.send('fix:ask', { id, heard })
    shownAt = Date.now()
    // show() hands a panel the keyboard without bringing murmur itself
    // to the front, so the app with the selection stays there.
    win.show()
    if (process.platform !== 'darwin') win.focus()
    win.webContents.focus()
    if (win.isFocused()) hadKeyboard = true
  })
}

/** The pair as the dictionary should hold it. The dictionary hears the
 *  transcript, so when the selection is part of the newest take, the
 *  heard side is the transcript's own words for it. */
async function forDictionary(fix: Fix): Promise<Fix> {
  try {
    const { eventToPaste } = await import('../history')
    const last = eventToPaste()
    if (last && last.rawText !== '' && last.finalText.includes(fix.heard)) {
      const inTranscript = heardInTranscript(last.rawText, last.finalText, fix.heard, fix.written)
      if (inTranscript !== null) return { heard: inTranscript, written: fix.written }
    }
  } catch {
    // History is a help here, never a need.
  }
  return fix
}

export interface FixDeps {
  /** Test seams: the copy keystroke, the panel, and who hears the new list. */
  sendCopy?: () => Promise<boolean>
  copyWaitMs?: number
  ask?: (heard: string) => Promise<string | null>
  /** The paste, for tests of what the pill says when it fails. */
  insert?: (text: string) => Promise<InsertOutcome>
  /** The save, for the same. */
  teach?: (fix: Fix) => Taught
  changed?: (settings: Settings) => void
}

function say(hint: string, good: boolean): void {
  showOverlayHint(hint)
  playCue(good ? 'insert' : 'error')
}

/** Run the chord once. Every path that does not fix a word leaves the
 *  selection and the dictionary exactly as they were. */
export async function fixWord(deps: FixDeps = {}): Promise<FixOutcome> {
  if (running || asking !== null) return 'busy'
  const phase = getOverlayPhase()
  if (phase === 'recording' || phase === 'processing') return 'busy'
  running = true
  try {
    return await runFix(deps)
  } finally {
    running = false
  }
}

async function runFix(deps: FixDeps): Promise<FixOutcome> {
  // A copy sent while the chord's modifiers are still down arrives as
  // another shortcut.
  const { waitForModifiersReleased } = await import('../hotkeys')
  if (!(await waitForModifiersReleased())) writeAppLog('[fix] modifiers still held; copying anyway')

  const selection: SelectionRead = await readSelection({
    ...(deps.sendCopy ? { sendCopy: deps.sendCopy } : {}),
    ...(deps.copyWaitMs !== undefined ? { waitMs: deps.copyWaitMs } : {})
  })
  if (!selection.ok) {
    // Nothing came back from the copy: nothing is selected, or the app
    // does not let it be copied. Only a copy key that could not be
    // pressed at all is murmur's own failure to read.
    const unsent = selection.reason === 'keystroke'
    writeAppLog(`[fix] selection unreadable reason=${selection.reason}`)
    say(unsent ? FIX_HINTS.unreadable : FIX_HINTS.select, false)
    return unsent ? 'unreadable' : 'empty'
  }
  const heard = selectionToFix(selection.text)
  if (heard === null) {
    writeAppLog(`[fix] selection refused chars=${selection.text.length}`)
    say(FIX_HINTS.long, false)
    return 'long'
  }

  let answer: Answer
  if (deps.ask) {
    const typed = await deps.ask(heard)
    answer = typed === null ? 'closed' : { written: typed }
  } else {
    answer = await askInPanel(heard)
  }
  if (answer === 'nofocus') {
    writeAppLog('[fix] the panel never got the keyboard')
    say(FIX_HINTS.nofocus, false)
    return 'nofocus'
  }
  if (answer === 'closed') {
    writeAppLog('[fix] closed without a spelling')
    return 'cancelled'
  }
  const fix = typedFix(heard, answer.written)
  if (fix === null) {
    writeAppLog('[fix] spelling unchanged')
    return 'unchanged'
  }

  // A take began as Enter was pressed: its words own the next paste.
  const busy = getOverlayPhase()
  if (busy === 'recording' || busy === 'processing') {
    writeAppLog(`[fix] gave way to a take phase=${busy}`)
    return 'cancelled'
  }
  // The app in front takes the keyboard back, then the paste replaces
  // the word, which is still selected there.
  await new Promise((resolve) => setTimeout(resolve, deps.ask ? 0 : FOCUS_RETURN_MS))
  let outcome: InsertOutcome
  try {
    outcome = await (deps.insert ?? insertText)(fix.written)
  } catch {
    outcome = 'error'
  }
  let taught: Taught | 'failed'
  try {
    taught = deps.teach ? deps.teach(fix) : teachPair(await forDictionary(fix), deps.changed)
  } catch (error) {
    writeAppLog(`[fix] could not save reason=${(error as Error | null)?.name ?? 'error'}`)
    taught = 'failed'
  }
  writeAppLog(`[fix] outcome=${outcome} dictionary=${taught}`)
  // The pill says what happened to the word, then to the pair.
  const good = outcome !== 'error' && taught !== 'failed'
  say(fixHint(outcome, taught), good)
  if (outcome === 'error' || taught === 'failed') return 'error'
  return outcome === 'inserted' ? 'fixed' : 'copied'
}

/** The quit path: a window left alive would hold the quit open. */
export function destroyFixWindow(): void {
  asking?.answer(null)
  if (fixWindow && !fixWindow.isDestroyed()) fixWindow.destroy()
  fixWindow = null
}

export function initFixWord(): void {
  // Only the question on screen can be answered, and only by its own id.
  ipc.on('fix:save', (_event, id: unknown, written: unknown) => {
    const text = boundedText(written, MAX_NAME_CHARS)
    if (asking !== null && id === asking.id && text !== null) asking.answer(text)
  })
  ipc.on('fix:cancel', (_event, id: unknown) => {
    if (asking !== null && id === asking.id) asking.answer(null)
  })

  registerSmokeCheck('fixWord', async () => {
    // The whole chord short of the keystrokes and the panel on screen,
    // against the real settings store and clipboard: a selected word
    // and a typed spelling save the pair and tell the window, the
    // spelling waits on the clipboard (smoke never pastes), a spelling
    // that changes nothing and a closed panel save nothing, a selection
    // that cannot be read or runs to 2 lines never opens the panel, the
    // panel's page loads, and the log holds outcomes and no words.
    const { clipboard } = await import('electron')
    const { buildDiagnosticsReport } = await import('../diagnostics')
    const before = getSettings().dictionary
    // Everything on the clipboard, pictures included, goes back after.
    const clipboardBefore = await captureClipboard()
    const select = (text: string) => async (): Promise<boolean> => {
      await clipboard.writeText(text)
      return true
    }
    try {
      updateSettings({ dictionary: [] })
      let told: Settings | null = null
      let asked = ''
      const fixed = await fixWord({
        sendCopy: select(' smokefixheard '),
        ask: async (heard) => {
          asked = heard
          return 'SmokeFixWritten'
        },
        changed: (settings) => {
          told = settings
        }
      })
      const saved = getSettings().dictionary
      const onClipboard = await clipboard.readText()
      const same = await fixWord({ sendCopy: select('smokefixheard'), ask: async (heard) => heard })
      const closed = await fixWord({ sendCopy: select('smokefixother'), ask: async () => null })
      let opened = false
      const ask = async (): Promise<string | null> => {
        opened = true
        return 'x'
      }
      const dead = await fixWord({ sendCopy: async () => true, copyWaitMs: 150, ask })
      const lines = await fixWord({ sendCopy: select('2 lines\nof text'), ask })
      // The panel's own page, loaded hidden.
      const win = createFixWindow()
      const pageLoaded =
        (await loaded) === true &&
        win.webContents.getURL().endsWith('/fix/index.html') &&
        (await win.webContents.executeJavaScript("document.getElementById('fix-written') !== null && typeof window.murmurFix?.save === 'function'")) === true
      win.destroy()
      const log = buildDiagnosticsReport()
      return (
        fixed === 'copied' &&
        asked === 'smokefixheard' &&
        saved.length === 1 &&
        saved[0].from === 'smokefixheard' &&
        saved[0].to === 'SmokeFixWritten' &&
        (told as Settings | null)?.dictionary.length === 1 &&
        onClipboard === 'SmokeFixWritten' &&
        same === 'unchanged' &&
        closed === 'cancelled' &&
        dead === 'empty' &&
        lines === 'long' &&
        !opened &&
        getSettings().dictionary.length === 1 &&
        pageLoaded &&
        log.includes('[fix] outcome=copied dictionary=added') &&
        !/smokefix/i.test(log)
      )
    } finally {
      updateSettings({ dictionary: before })
      if (clipboardBefore.items.length > 0 || clipboardBefore.text) await restoreClipboard(clipboardBefore)
      else clipboard.clear()
    }
  })
}
