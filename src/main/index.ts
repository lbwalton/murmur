// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, nativeTheme } from 'electron'
import { ipc, setRendererRoot } from './ipc'
import { MAX_TEXT_CHARS, boundedText } from './ipc-rules'
import { initAudio } from './audio'
import { dictationStart, dictationStop, initDictation, pasteLastDictation } from './dictation'
import {
  deferQuitForPark,
  handsFreeAutoStop,
  handsFreeCancel,
  handsFreeDiscard,
  handsFreeLock,
  handsFreeStop,
  initHandsFree
} from './handsfree'
import {
  captureHotkeyViaHook,
  initHotkeys,
  isBindingParseable,
  setHotkeysSuppressed,
  stopHotkeys
} from './hotkeys'
import { captureHotkeyFromWindow } from './hotkeys/capture'
import { initFormatter } from './formatter'
import { initHistory } from './history'
import { initInsertion } from './insertion'
import { RotatingLog } from './logging'
import { holdPlainHttpHops, readTrustedHttpHostsFrom } from './net'
import { initOverlay } from './overlay'
import { initPermissions } from './permissions'
import { initRecap } from './recap'
import { initNotes, openTodayNote } from './notes'
import { getLastNote, onLastNoteChanged, openLastNote, withdrawReceipt } from './notes/receipt'
import { withdrawReminder } from './notes/reminders'
import { initTransform } from './transform'
import { initTranscribe } from './transcribe'
import { getSettings, initSettings, onSettingsChanged, updateSettings } from './settings'
import { isSmoke, registerSmokeCheck, runSmokeAndExit } from './smoke'
import { devRendererUrl, watchWindow } from './window-watch'
import { createTray, getTray, setTrayHideWords, setTrayInboxVisible, setTrayLastNoteVisible, clickTrayHideWords, trayHideWordsChecked } from './tray'
import { installHardening } from './hardening'
import { reviveOnDeath } from './revive'
import { refusedSwitch } from './hardening-rules'
import { attachSettingsZoom, stepSettingsZoom } from './zoom'
import { MAC_VIBRANCY, WIN_MATERIAL, type WindowLook, asLook, windowLook, windowOptions } from '../shared/look'

// The biggest share card a page can hand over, as a data URL.
const MAX_CARD_CHARS = 64 * 1024 * 1024

// A packaged murmur never starts with a Chromium remote debugging port
// or pipe (US-072): either hands any program that can launch murmur a
// live handle on every window, preload bridge and microphone grant
// included, and no fuse covers them. Exits before any window or
// DevTools server exists.
if (refusedSwitch(app.isPackaged, (name) => app.commandLine.hasSwitch(name))) {
  app.exit(1)
}

// Development builds get their own userData so the lock, settings, and
// logs never collide with an installed murmur (or the legacy app still
// running on this machine during the transition). Smoke is hermetic: a
// wiped temp dir per boot, so no stale state and no lock contention with
// a running dev instance. That holds in packaged builds too (checking a
// universal build's two halves runs smoke on the packaged app): smoke
// checks write throwaway keys over the primary provider's and file test
// notes, so an isolated run must never see a real profile.
const isolatedRun =
  isSmoke ||
  process.env.MURMUR_SETTINGS_CAPTURE ||
  process.env.MURMUR_OVERLAY_CAPTURE ||
  process.env.MURMUR_QUIT_TEST ||
  process.env.MURMUR_CRASH_TEST
if (isolatedRun) {
  // A relaunched isolated instance inherits its predecessor's profile
  // (so the crash log it just wrote survives) and skips the sweep.
  const carried = process.argv.find((a) => a.startsWith('--murmur-userdata='))
  if (carried) {
    app.setPath('userData', carried.slice('--murmur-userdata='.length))
  } else {
    // Sweep profiles left by earlier isolated runs (SIGKILL skips cleanup).
    try {
      for (const entry of readdirSync(tmpdir())) {
        if (entry.startsWith('murmur-smoke-')) {
          rmSync(join(tmpdir(), entry), { recursive: true, force: true })
        }
      }
    } catch {
      // A locked entry never blocks boot.
    }
    app.setPath('userData', join(tmpdir(), `murmur-smoke-${process.pid}`))
  }
} else if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'murmur-dev'))
}

// Windows GPU drivers (11th-gen Intel Iris Xe among them, issue 1)
// can leave an Electron window painted blank. murmur's windows are
// small and simple, so software rendering costs nothing perceptible
// and works on every driver. Must run before app ready.
if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
}

// Last-resort net: an uncaught main-process exception logs to a
// rotating file and relaunches the app exactly once. A crash on the
// relaunched instance logs and degrades visibly instead of looping.
const crashLog = new RotatingLog(app.getPath('userData'))
const alreadyRelaunched = process.argv.includes('--murmur-relaunched')

process.on('uncaughtException', (error) => {
  console.error('[murmur] uncaught exception:', error)
  crashLog.write(`uncaught exception: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
  if (isSmoke || alreadyRelaunched || !app.isReady()) {
    if (alreadyRelaunched) getTray()?.setToolTip('murmur (degraded, see logs)')
    return
  }
  app.relaunch({
    args: [
      ...process.argv.slice(1).filter((a) => !a.startsWith('--murmur-userdata=')),
      '--murmur-relaunched',
      `--murmur-userdata=${app.getPath('userData')}`
    ]
  })
  app.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[murmur] unhandled rejection:', reason)
  crashLog.write(`unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`)
})

// Widget-first, single instance: a second launch hands off to the first.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let settingsWindow: BrowserWindow | null = null
let isQuitting = false

// MURMUR_SETTINGS_ZOOM=2 (isolated runs only, like every capture hook)
// records crisp footage for videos: the window's content grows by the
// factor and the page zooms by it, so the layout is the same at twice
// the pixels.
function captureZoom(): number | undefined {
  if (!isolatedRun) return undefined
  const factor = Number(process.env.MURMUR_SETTINGS_ZOOM)
  return Number.isFinite(factor) && factor >= 1 && factor <= 4 ? factor : undefined
}

/** The look the settings window should have right now (US-150): glass
 *  where the system can show the desktop through it, solid with a glow
 *  where it cannot or Reduce transparency is on. MURMUR_LOOK=glass or
 *  solid picks one for a capture (isolated runs only), so both can be
 *  shot on 1 machine. */
function currentLook(): WindowLook {
  const forced = isolatedRun && !isSmoke ? asLook(process.env.MURMUR_LOOK) : null
  return (
    forced ??
    windowLook({
      platform: process.platform,
      systemVersion: process.getSystemVersion(),
      reducedTransparency: nativeTheme.prefersReducedTransparency
    })
  )
}

/** The look the window has, which the page asks for and is told about. */
let shownLook: WindowLook = 'solid'

/** Moves a live window to a look and tells its page, so turning Reduce
 *  transparency on or off takes effect without a restart. */
function applyLook(win: BrowserWindow, look: WindowLook): void {
  shownLook = look
  if (process.platform === 'darwin') win.setVibrancy(look === 'glass' ? MAC_VIBRANCY : null)
  if (process.platform === 'win32') win.setBackgroundMaterial(look === 'glass' ? WIN_MATERIAL : 'none')
  win.setBackgroundColor(windowOptions(look, process.platform).backgroundColor)
  win.webContents.send('look:changed', look)
}

function createSettingsWindow(): BrowserWindow {
  shownLook = currentLook()
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    show: !isSmoke,
    ...windowOptions(shownLook, process.platform),
    title: 'murmur',
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  watchWindow(win, 'settings')
  // A dead page comes back on its own and remounts from main (US-071).
  reviveOnDeath(win, 'settings')
  // Cmd or Ctrl plus and minus zoom this window only (US-111).
  const capture = captureZoom()
  if (capture) {
    const [w, h] = win.getContentSize()
    win.setContentSize(Math.round(w * capture), Math.round(h * capture))
    // Grown from its corner it would run off the screen; recenter it.
    win.center()
  }
  attachSettingsZoom(win, capture)

  // Closing the window hides it; the app lives in the tray.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  const devServer = devRendererUrl()
  if (devServer) {
    void win.loadURL(`${devServer}/settings/index.html?look=${shownLook}`)
  } else {
    // The look rides in the address so the first paint already has it.
    void win.loadFile(join(__dirname, '../renderer/settings/index.html'), { query: { look: shownLook } })
  }
  return win
}

function showSettingsWindow(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = createSettingsWindow()
  } else {
    settingsWindow.show()
    settingsWindow.focus()
  }
  // With the Dock icon hidden murmur is an accessory app, and macOS does
  // not raise an accessory app's window above the active app on show()
  // alone: the window opens buried behind other windows and the tray
  // click looks dead (found live 2026-09-12). Only an app-level focus
  // steal actually brings it forward.
  if (process.platform === 'darwin') app.focus({ steal: true })
}

function whenLoaded(win: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      reject(new Error(`renderer failed to load: ${code} ${desc}`))
    })
  })
}

app.on('second-instance', () => {
  showSettingsWindow()
})

app.on('before-quit', (event) => {
  // A locked hands-free take is parked for Retry first (US-117); the
  // park quits again when it is done, so this quit only waits.
  if (deferQuitForPark()) {
    event.preventDefault()
    return
  }
  isQuitting = true
  stopHotkeys()
  // Failsafe: if anything (a window, a native hook thread) still blocks
  // the quit two seconds from now, leave anyway. Quit must always work.
  const failsafe = setTimeout(() => app.exit(0), 2000)
  failsafe.unref()
})

// The tray keeps the app alive with every window hidden or closed.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  // Before any window exists: every page is held to its own file and
  // only the audio window may open the microphone (US-072).
  setRendererRoot(join(__dirname, '../renderer'))
  installHardening()

  // Widget-first on macOS: menu bar resident, no Dock icon. A visible
  // window still shows normally; a Dock toggle setting lands later.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()

  // Minimal menu: macOS needs Edit roles for Cmd+V in fields, and View
  // holds the settings window's zoom (US-111); everything else stays out
  // so stray accelerators cannot surprise the user. Other platforms get
  // no menu bar at all (the settings window catches Ctrl zoom itself).
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'murmur',
          submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        },
        {
          // Not the zoom roles: those would zoom whichever page has
          // focus and forget it at quit. These zoom the settings window
          // and save the step.
          label: 'View',
          submenu: [
            { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => stepSettingsZoom(settingsWindow, 'reset') },
            { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => stepSettingsZoom(settingsWindow, 'in') },
            // Cmd = is the key people press for zoom in; it answers too,
            // without a second row in the menu.
            {
              label: 'Zoom In',
              accelerator: 'CommandOrControl+=',
              visible: false,
              acceleratorWorksWhenHidden: true,
              click: () => stepSettingsZoom(settingsWindow, 'in')
            },
            { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => stepSettingsZoom(settingsWindow, 'out') }
          ]
        },
        { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
  }

  // First packaged launch inherits the dev profile (belts, history,
  // founder marker) so the journey continues unbroken; must run before
  // any subsystem reads its files. Dev and smoke never migrate.
  if (app.isPackaged && !isSmoke) {
    try {
      const { migrateFromDev } = await import('./migrate')
      const userData = app.getPath('userData')
      const { migrated } = migrateFromDev(join(userData, '..', 'murmur-dev'), userData)
      if (migrated.length > 0) console.log('[murmur] migrated from dev profile:', migrated.join(', '))
    } catch (error) {
      // A failed migration must never block the app; it just starts fresh.
      console.error('[murmur] dev profile migration failed:', error)
    }
  }

  initSettings()
  readTrustedHttpHostsFrom(() => getSettings().trustedHttpHosts)
  void holdPlainHttpHops()
  const { initCatalog } = await import('./catalog')
  initCatalog()
  try {
    initHistory(() => settingsWindow)
  } catch (error) {
    // Dictation works with no history. A broken log must not stop it.
    console.error('[murmur] history did not start:', error)
  }
  initAudio(() => settingsWindow)
  initOverlay()
  const { initUpdater } = await import('./updater')
  initUpdater()
  const { initLicense } = await import('./license')
  initLicense()
  const { initInstallDate } = await import('./install')
  initInstallDate()
  const { initProfiles } = await import('./profiles')
  initProfiles()
  const { initModelList } = await import('./model-list')
  initModelList()
  initTranscribe()
  initFormatter()
  const openWrapup = (): void => {
    showSettingsWindow()
    settingsWindow?.webContents.send('nav:goto', 'wrapup')
  }
  initRecap({ openWrapup })
  initInsertion()
  initDictation()
  const { initRetry } = await import('./retry')
  initRetry(() => settingsWindow)
  initNotes(() => settingsWindow)
  initTransform()
  const { initDiagnostics } = await import('./diagnostics')
  initDiagnostics(() => settingsWindow)

  // Hands-free (US-117) rides the dictation and note chords: a hold
  // works as before, a double-tap locks the take. Transform holds only.
  initHotkeys({
    start: dictationStart,
    stop: () => handsFreeStop('dictation'),
    lock: () => handsFreeLock('dictation'),
    discard: () => handsFreeDiscard('dictation'),
    pasteLast: () => {
      void pasteLastDictation()
    },
    note: {
      start: () => dictationStart('note'),
      stop: () => handsFreeStop('note'),
      lock: () => handsFreeLock('note'),
      discard: () => handsFreeDiscard('note')
    },
    transform: {
      start: () => dictationStart('transform'),
      stop: () => {
        void dictationStop('transform')
      }
    },
    // Escape keeps the take for Retry; the tray's Discard throws it away.
    cancel: () => handsFreeCancel(true),
    // A chord change mid-take: the locked take is saved, never lost.
    lockedReset: () => {
      void handsFreeAutoStop('changed')
    }
  })
  initHandsFree()
  initPermissions()

  // Share card: the journey page draws a PNG locally; main only offers
  // the save dialog and writes bytes. Nothing leaves the machine.
  ipc.handle('sharecard:save', async (_event, dataUrl: unknown, kind: unknown, day: unknown) => {
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_CARD_CHARS || !dataUrl.startsWith('data:image/png;base64,')) {
      return false
    }
    // The wrap-up's day card (US-088) is named for the day it shows and
    // the week's scroll (US-102) for the day it ends on, a plain
    // YYYY-MM-DD and nothing else; anything else is the belt card.
    const shape = kind === 'day' || kind === 'week' ? kind : 'belt'
    const dated = shape !== 'belt' && typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    const name = dated ? `murmur-${shape}-${day}.png` : `murmur-${shape}.png`
    const { dialog } = await import('electron')
    const { writeFile } = await import('node:fs/promises')
    const target = settingsWindow
    if (!target || target.isDestroyed()) return false
    const { canceled, filePath } = await dialog.showSaveDialog(target, {
      defaultPath: name,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return false
    await writeFile(filePath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'))
    return true
  })

  ipc.handle('app:version', () => app.getVersion())
  ipc.handle('look:get', () => shownLook)
  // Reduce transparency, switched in the system's settings while murmur
  // runs, moves the window between glass and solid at once (US-150).
  nativeTheme.on('updated', () => {
    const look = currentLook()
    if (look !== shownLook && settingsWindow && !settingsWindow.isDestroyed()) applyLook(settingsWindow, look)
  })
  ipc.handle('app:license', async () => {
    const { shell } = await import('electron')
    await shell.openExternal('https://www.gnu.org/licenses/gpl-3.0.html')
  })

  // Copy for the history view: sandboxed renderers route through main.
  // Report this take (US-130): the person's own mail app, to 1 address.
  // murmur sends nothing, and this cannot open anything else.
  ipc.handle('report:mail', async (_event, body: unknown) => {
    const { shell } = await import('electron')
    const { blankMailtoUrl, isReportMailto, mailtoUrl } = await import('../shared/report')
    const text = boundedText(body, MAX_TEXT_CHARS)
    const url = text !== null ? mailtoUrl(text) : blankMailtoUrl()
    if (isReportMailto(url)) await shell.openExternal(url)
  })

  ipc.handle('clipboard:copy', async (_event, text: unknown) => {
    const value = boundedText(text, MAX_TEXT_CHARS)
    if (value !== null) await clipboard.writeText(value)
  })

  // Capture a new hotkey: global trigger paused, keys intercepted ahead
  // of menu accelerators, binding validated against the real key map,
  // and saved through the normal settings path on success. The target
  // picks which binding is being set: the dictation trigger, or one of
  // the chords (paste-last, note) with their stricter rules.
  ipc.handle('hotkeys:capture', async (_event, target: unknown) => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return { ok: false }
    const forPasteLast = target === 'pasteLast'
    const forNote = target === 'note'
    const forTransform = target === 'transform'
    setHotkeysSuppressed(true)
    try {
      // Prefer the global hook (the same source the trigger reads, and
      // it sees pure modifier chords reliably); fall back to window
      // capture when the hook has no permission yet.
      const outcome =
        (await captureHotkeyViaHook()) ?? (await captureHotkeyFromWindow(settingsWindow))
      if (!outcome.binding) return { ok: false, reason: outcome.reason ?? 'cancelled' }
      const { updateSettings } = await import('./settings')
      if (forPasteLast) {
        const { pasteBindingProblem } = await import('./hotkeys')
        const problem = pasteBindingProblem(outcome.binding)
        if (problem) return { ok: false, reason: problem }
        updateSettings({ hotkey: { pasteLastBinding: outcome.binding } })
        return { ok: true, binding: outcome.binding }
      }
      if (forNote) {
        const { noteBindingProblem } = await import('./hotkeys')
        const problem = noteBindingProblem(outcome.binding)
        if (problem) return { ok: false, reason: problem }
        updateSettings({ notes: { binding: outcome.binding } })
        return { ok: true, binding: outcome.binding }
      }
      if (forTransform) {
        const { transformBindingProblem } = await import('./hotkeys')
        const problem = transformBindingProblem(outcome.binding)
        if (problem) return { ok: false, reason: problem }
        updateSettings({ transform: { binding: outcome.binding } })
        return { ok: true, binding: outcome.binding }
      }
      if (!isBindingParseable(outcome.binding)) return { ok: false, reason: 'needs-modifier' }
      updateSettings({ hotkey: { binding: outcome.binding } })
      return { ok: true, binding: outcome.binding }
    } finally {
      setHotkeysSuppressed(false)
    }
  })

  createTray({
    onOpen: showSettingsWindow,
    onQuit: () => app.quit(),
    onOpenInbox: () => {
      void openTodayNote()
    },
    onOpenLastNote: () => {
      void openLastNote('tray')
    },
    // Stop hands-free saves like an auto-stop: the click can move focus
    // (to the taskbar on Windows), so a paste could land nowhere.
    onStopHandsFree: () => {
      void handsFreeAutoStop('menu')
    },
    onDiscardHandsFree: () => {
      handsFreeCancel(false)
    },
    // Hide words from the menu (US-148): the window hears it at once.
    onToggleHideWords: (on) => {
      const settings = updateSettings({ history: { hideWords: on } })
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('settings:pushed', settings)
    }
  })
  setTrayHideWords(getSettings().history.hideWords)
  onSettingsChanged((s) => setTrayHideWords(s.history.hideWords))
  // The tray's Hide words follows the setting both ways (US-148).
  registerSmokeCheck('trayHideWords', () => {
    const before = getSettings().history.hideWords
    updateSettings({ history: { hideWords: !before } })
    const flipped = trayHideWordsChecked() === !before
    updateSettings({ history: { hideWords: before } })
    return flipped && trayHideWordsChecked() === before
  })
  // The inbox item exists only while there is a folder to open.
  setTrayInboxVisible(getSettings().notes.folder.trim() !== '')
  onSettingsChanged((s) => setTrayInboxVisible(s.notes.folder.trim() !== ''))
  // Open last note appears once a note has been saved, and stays.
  setTrayLastNoteVisible(getLastNote() !== null)
  onLastNoteChanged((note) => setTrayLastNoteVisible(note !== null))
  // Turning Hide words on takes back what already went out: a receipt or
  // a reminder still in Notification Center holds its words (US-145).
  let hidingWords = getSettings().history.hideWords
  onSettingsChanged((s) => {
    if (s.history.hideWords && !hidingWords) {
      withdrawReceipt()
      withdrawReminder()
    }
    hidingWords = s.history.hideWords
  })
  // Time back rides the tray tooltip, so it comes up after the tray.
  const { initTimeBack } = await import('./timeback')
  initTimeBack({ openWrapup })

  settingsWindow = createSettingsWindow()
  const settingsLoaded = whenLoaded(settingsWindow)

  registerSmokeCheck('appReady', () => app.isReady())
  registerSmokeCheck('singleInstanceLock', () => gotLock)
  registerSmokeCheck('tray', () => {
    const tray = getTray()
    return tray !== null && !tray.isDestroyed()
  })
  registerSmokeCheck('settingsWindow', () => {
    return settingsWindow !== null && !settingsWindow.isDestroyed()
  })
  registerSmokeCheck('settingsRenderer', async () => {
    await settingsLoaded
    if (!settingsWindow) return false
    // The bridge must exist AND the app must actually mount: a renderer
    // crash leaves #root empty while the preload still loads fine
    // (a blank window shipped on 2026-09-05 exactly this way).
    const probe = await settingsWindow.webContents.executeJavaScript(
      'JSON.stringify({ bridge: typeof window.murmur, mounted: document.querySelector("main.shell") !== null })'
    )
    const { bridge, mounted } = JSON.parse(probe) as { bridge: string; mounted: boolean }
    return bridge === 'object' && mounted
  })
  registerSmokeCheck('settingsRevive', async () => {
    // The settings renderer dies: the page reloads on its own and the
    // app mounts again with its bridge (US-071).
    await settingsLoaded
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const wasVisible = win.isVisible()
    const loaded = new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    win.webContents.forcefullyCrashRenderer()
    await loaded
    if (win.isVisible() !== wasVisible) return false
    for (let i = 0; i < 30; i++) {
      const probe = await win.webContents.executeJavaScript(
        'JSON.stringify({ bridge: typeof window.murmur, mounted: document.querySelector("main.shell") !== null })'
      )
      const { bridge, mounted } = JSON.parse(probe) as { bridge: string; mounted: boolean }
      if (bridge === 'object' && mounted) return true
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return false
  })
  registerSmokeCheck('settingsZoom', async () => {
    // Zoom reaches the settings window only (US-111): two presses take
    // it to 125 percent and its pixel ratio with it (canvases redraw
    // sharp), the pill and the audio window stay at 100 percent, and the
    // step is saved. A page load applies the saved zoom (a different one
    // is saved behind the page's back, as a fresh launch would find it),
    // and reset returns to 1.
    await settingsLoaded
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const others = BrowserWindow.getAllWindows().filter(
      (w) => w !== win && /\/(overlay|audio)\/index\.html/.test(w.webContents.getURL())
    )
    if (others.length !== 2) {
      console.error(`smoke settingsZoom: expected the pill and the audio window, found ${others.length}`)
      return false
    }
    const ratio = (w: BrowserWindow): Promise<number> => w.webContents.executeJavaScript('window.devicePixelRatio')
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01
    // The page learns its new pixel ratio a moment after the zoom is set;
    // CI once read the halfway step (1.1). Wait up to 2 seconds for it.
    const settledRatio = async (w: BrowserWindow, want: number): Promise<number> => {
      for (let tries = 0; tries < 20; tries += 1) {
        const value = await ratio(w)
        if (near(value, want)) return value
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return ratio(w)
    }
    const base = await ratio(others[0])
    stepSettingsZoom(win, 'in')
    stepSettingsZoom(win, 'in')
    const zoomed = win.webContents.getZoomFactor()
    const zoomedRatio = await settledRatio(win, base * 1.25)
    const othersZoom = others.map((w) => w.webContents.getZoomFactor())
    const othersRatio = await Promise.all(others.map(ratio))
    const saved = getSettings().windowZoom
    updateSettings({ windowZoom: 1.5 })
    const reloaded = new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    win.webContents.reload()
    await reloaded
    const afterReload = win.webContents.getZoomFactor()
    stepSettingsZoom(win, 'reset')
    const reset = win.webContents.getZoomFactor()
    const ok =
      near(zoomed, 1.25) &&
      near(zoomedRatio, base * 1.25) &&
      othersZoom.every((z) => near(z, 1)) &&
      othersRatio.every((r) => near(r, base)) &&
      saved === 1.25 &&
      near(afterReload, 1.5) &&
      near(reset, 1) &&
      getSettings().windowZoom === 1
    if (!ok) {
      console.error(
        `smoke settingsZoom: zoomed=${zoomed} ratio=${zoomedRatio} base=${base} others=${othersZoom.join(',')} othersRatio=${othersRatio.join(',')} saved=${saved} afterReload=${afterReload} reset=${reset}`
      )
    }
    return ok
  })
  registerSmokeCheck('wizard', async () => {
    // The pure machine walks the whole path, gates hold, and a fresh
    // profile (which smoke always is) gets the wizard offered in the DOM.
    const { canAdvance, nextStep, shouldOfferWizard, stepsFor } = await import('../shared/wizard')
    const facts = {
      keyPresent: true,
      connected: true,
      micGranted: true,
      accessibilityGranted: true,
      inputMonitoringActive: true,
      bindingValid: true,
      isMac: process.platform === 'darwin'
    }
    let step: string | null = 'welcome'
    const visited: string[] = []
    while (step) {
      visited.push(step)
      step = nextStep(step as never, facts)
    }
    const walked = visited.join(',') === stepsFor(facts).join(',')
    const gated = !canAdvance('key', { ...facts, connected: false })
    const offered = shouldOfferWizard({ ...facts, keyPresent: false })

    if (!settingsWindow) return false
    for (let i = 0; i < 10; i++) {
      const inDom = await settingsWindow.webContents.executeJavaScript(
        'document.querySelector("[data-wizard]") !== null'
      )
      if (inDom === true) return walked && gated && offered
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
  })

  registerSmokeCheck('settingsRail', async () => {
    // The settings tab (US-069) mounts its rail and every section, a
    // fresh profile's missing key opens the Finish setup card, and the
    // rail search finds a setting by a word its label never says.
    // Registered after the wizard check: it skips the wizard to reach
    // the tab.
    if (!settingsWindow) return false
    const probe = (await settingsWindow.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const skip = [...document.querySelectorAll('.wizard-footer button')].find((b) => b.textContent === 'Skip for now')
      if (skip) {
        skip.click()
        await wait(400)
      }
      const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === 'settings')
      if (!nav) return null
      nav.click()
      await wait(200)
      const field = document.querySelector('.rail-search')
      if (!field) return null
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setValue.call(field, 'shortcut')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(200)
      const first = document.querySelector('.rail-match .rail-match-label')?.textContent ?? null
      setValue.call(field, '')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return {
        items: document.querySelectorAll('.rail .rail-item').length,
        sections: document.querySelectorAll('.settings-content .sec[data-sec]').length,
        finish: document.getElementById('finish-setup') !== null,
        first
      }
    })()`)) as { items: number; sections: number; finish: boolean; first: string | null } | null
    if (!probe) return false
    // 11 sections since Shortcuts joined the essentials (US-164).
    return probe.items === 11 && probe.sections === 11 && probe.finish && probe.first === 'Hotkey'
  })

  registerSmokeCheck('settingsUnbroken', async () => {
    // A note in place of a broken part keeps the window alive (US-163),
    // so it must never hide a startup problem from smoke: once the
    // settings tab is open (settingsRail, just before, skips the wizard
    // a fresh profile gets), no section, page or window note may show.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    let drawn = false
    for (let i = 0; i < 30 && !drawn; i++) {
      drawn = await win.webContents.executeJavaScript('document.querySelector(".settings-content .sec") !== null')
      if (!drawn) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!drawn) return false
    // A moment for effects that throw after the first paint.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const notes = await win.webContents.executeJavaScript('document.querySelectorAll("[data-crashed]").length')
    if (notes !== 0) return false
    // Then every page, 1 at a time, ending back on the settings tab the
    // checks after this one expect.
    const pages = (await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const counts = {}
      for (const label of ['home', 'analytics', 'wrap-up', 'journey', 'settings']) {
        const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === label)
        if (!nav) return null
        nav.click()
        await wait(400)
        counts[label] = document.querySelectorAll('[data-crashed]').length
      }
      return counts
    })()`)) as Record<string, number> | null
    return pages !== null && Object.values(pages).every((n) => n === 0)
  })

  registerSmokeCheck('lookDefaults', async () => {
    // The window's look (US-150): the one the rules pick for this system
    // (the under-window material on a Mac, acrylic on Windows 11 22H2 and
    // up, solid anywhere else, in a headless run, and under Reduce
    // transparency), the page wearing the same one, and a live switch to
    // solid and back reaching the page.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const facts = {
      platform: process.platform,
      systemVersion: process.getSystemVersion(),
      reducedTransparency: nativeTheme.prefersReducedTransparency
    }
    const expected = windowLook(facts)
    const rules =
      windowLook({ ...facts, reducedTransparency: true }) === 'solid' &&
      windowLook({ ...facts, platform: 'linux' }) === 'solid' &&
      windowOptions('glass', 'darwin').vibrancy === 'under-window' &&
      windowOptions('glass', 'win32').backgroundMaterial === 'acrylic' &&
      windowOptions('solid', process.platform).backgroundColor === '#0F0E11'
    const worn = (): Promise<string | undefined> => win.webContents.executeJavaScript('document.documentElement.dataset.look')
    const until = async (want: string): Promise<boolean> => {
      for (let i = 0; i < 30; i++) {
        if ((await worn()) === want) return true
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return false
    }
    const first = shownLook === expected && (await until(expected))
    const other: WindowLook = expected === 'glass' ? 'solid' : 'glass'
    applyLook(win, other)
    const switched = await until(other)
    applyLook(win, expected)
    const back = await until(expected)
    const opaque = win.getBackgroundColor().toUpperCase()
    const ground = expected === 'solid' ? opaque.endsWith('0F0E11') : true
    return rules && first && switched && back && ground
  })

  registerSmokeCheck('homeRail', async () => {
    // Home has its rail (US-147): the search, the Overview line and Hide
    // words are there, the rail hides and comes back with its buttons,
    // and the choice is put back, ending on the settings tab the checks
    // after this one expect.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const probe = (await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const tab = (label) => {
        const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === label)
        if (nav) nav.click()
        return Boolean(nav)
      }
      if (!tab('home')) return null
      await wait(300)
      const rail = document.querySelector('.home-layout .home-rail')
      // A window too narrow for 2 columns tucks the rail away; smoke's is not.
      if (!rail) return { rail: false }
      const parts =
        rail.querySelector('.rail-search') !== null &&
        [...rail.querySelectorAll('.rail-item')].some((b) => b.textContent === 'Overview') &&
        rail.querySelector('#home-hide-words [role=switch]') !== null
      rail.querySelector('[aria-label="Hide sidebar"]').click()
      await wait(200)
      const show = document.querySelector('.home [aria-label="Show sidebar"]')
      const hidden = document.querySelector('.home-rail') === null && show !== null
      if (show) show.click()
      await wait(200)
      const back = document.querySelector('.home-rail') !== null && document.querySelector('.home [aria-label="Show sidebar"]') === null
      const title = document.querySelector('.home h1')?.textContent
      tab('settings')
      await wait(200)
      return { rail: true, parts, hidden, back, title }
    })()`)) as { rail: boolean; parts?: boolean; hidden?: boolean; back?: boolean; title?: string } | null
    return probe !== null && probe.rail && probe.parts === true && probe.hidden === true && probe.back === true && probe.title === 'Home'
  })

  registerSmokeCheck('settingsZoomSharp', async () => {
    // At the top step, 300 percent, every brush canvas on screen paints
    // at the full pixel ratio, not a capped one, so paint stays sharp
    // (US-111). Registered after settingsRail, which skipped the wizard,
    // so the tabs and the current tab's stroke are showing.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    let top = 0
    let sharp = 'no canvas'
    try {
      for (let i = 0; i < 12; i++) stepSettingsZoom(win, 'in')
      top = win.webContents.getZoomFactor()
      for (let i = 0; i < 20 && sharp !== 'ok'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        // Too few pixels is soft; more (the Pro mark's 2x for its lift)
        // is fine.
        sharp = await win.webContents.executeJavaScript(
          `(() => {
            const shown = [...document.querySelectorAll('canvas')].filter((c) => c.clientWidth > 0)
            if (shown.length === 0) return 'no canvas'
            const soft = shown.filter((c) => c.width < c.clientWidth * window.devicePixelRatio - 2)
            return soft.length === 0 ? 'ok' : soft.map((c) => c.className + ' ' + c.width + '/' + c.clientWidth).join(';')
          })()`
        )
      }
    } finally {
      stepSettingsZoom(win, 'reset')
    }
    const ok = Math.abs(top - 3) < 0.01 && sharp === 'ok'
    if (!ok) console.error(`smoke settingsZoomSharp: top=${top} sharp=${sharp}`)
    return ok
  })

  registerSmokeCheck('historyInSettings', async () => {
    // US-148 on the real window: a click on the tray's Hide words reaches
    // both switches and back, Clear all asks before it clears, and a
    // shorter Keep history asks before it removes anything. Nothing is
    // cleared or shortened here: each question is answered keep.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const { recordSession } = await import('./history')
    recordSession({ startedAt: Date.now() - 2000, rawText: 'smoke keep probe', finalText: 'Smoke keep probe.' })
    const before = getSettings().history.hideWords
    const keepBefore = getSettings().history.retentionDays
    const switchIs = (want: boolean): string => `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === 'settings')
      if (nav) nav.click()
      for (let i = 0; i < 60; i++) {
        const sw = document.querySelector('#row-hide-words [role=switch]')
        if (sw && sw.getAttribute('aria-checked') === ${JSON.stringify(String(want))}) return true
        await wait(50)
      }
      return false
    })()`
    if (!clickTrayHideWords()) return false
    const flipped = (await win.webContents.executeJavaScript(switchIs(!before))) as boolean
    clickTrayHideWords()
    const back = (await win.webContents.executeJavaScript(switchIs(before))) as boolean
    const asks = (await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const until = async (test) => {
        for (let i = 0; i < 60 && !test(); i++) await wait(50)
        return test()
      }
      const countBefore = await window.murmur.countHistory()
      const clear = document.querySelector('#row-clear-history button')
      if (!clear || !(await until(() => !clear.disabled))) return 'clear button missing or disabled'
      clear.click()
      if (!(await until(() => document.getElementById('clear-all-confirm') !== null))) return 'clear all did not ask'
      if ((await window.murmur.countHistory()) !== countBefore) return 'clear all cleared without asking'
      await wait(600)
      clear.click()
      if (!(await until(() => document.getElementById('clear-all-confirm') === null))) return 'clear all question stayed open'
      const select = document.querySelector('#row-keep-history select')
      if (!select) return 'keep select missing'
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '-1')
      select.dispatchEvent(new Event('change', { bubbles: true }))
      if (!(await until(() => document.getElementById('keep-shorter-confirm') !== null))) return 'shorter keep did not ask'
      const keep = [...document.querySelectorAll('#keep-shorter-confirm button')].find((b) => b.textContent.trim() === 'keep them')
      if (!keep) return 'no keep them button'
      keep.click()
      return (await until(() => document.getElementById('keep-shorter-confirm') === null)) ? 'ok' : 'keep question stayed open'
    })()`)) as string
    const kept = getSettings().history.retentionDays === keepBefore
    const ok = flipped && back && asks === 'ok' && kept && getSettings().history.hideWords === before
    if (!ok) console.error(`smoke historyInSettings: flipped=${flipped} back=${back} asks=${asks} kept=${kept}`)
    return ok
  })

  registerSmokeCheck('hideWords', async () => {
    // Hide words (US-145) on the real window: a marked word shows on Home
    // and the wrap-up with the switch off, so the probe can see it. With
    // it on, the word is nowhere in the page or in a field, in any
    // attribute, with every panel opened; the numbers and copy stay; and
    // the Home and Settings switches agree. It is saved to disk, and a
    // reload shows nothing, not for one frame. Registered after
    // settingsRail, which skipped the wizard.
    const win = settingsWindow
    if (!win || win.isDestroyed()) return false
    const { recordSession } = await import('./history')
    const { saveNote } = await import('./notes')
    const { noteSaved } = await import('./notes/receipt')
    const word = 'zebrafinch'
    const notesBefore = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-hide-vault')
    const helpers = `
      const word = ${JSON.stringify(word)}
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const until = async (test) => {
        for (let i = 0; i < 60 && !test(); i++) await wait(50)
        return test()
      }
      const seen = () =>
        (document.documentElement.outerHTML + [...document.querySelectorAll('textarea, input')].map((f) => f.value).join(' '))
          .toLowerCase()
          .includes(word)
      const tab = async (name) => {
        const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === name)
        if (nav) nav.click()
        await wait(120)
        return Boolean(nav)
      }
      // One panel of each kind opens at a time, and the last click wins,
      // so this goes oldest first and leaves the newest rows open: the
      // marked ones.
      const openRows = async () => {
        for (const b of [...document.querySelectorAll('.log-said-toggle')].reverse()) {
          if (b.getAttribute('aria-expanded') !== 'true') b.click()
        }
        await wait(120)
      }
      const flip = async (id) => {
        document.querySelector('#' + id + ' [role=switch]').click()
        await until(() => document.querySelector('#' + id + ' [role=switch]').getAttribute('aria-checked') === 'true')
        await wait(120)
      }
      const checked = (id) => document.querySelector('#' + id + ' [role=switch]')?.getAttribute('aria-checked')
    `
    try {
      mkdirSync(join(vault, 'murmur'), { recursive: true })
      updateSettings({ notes: { folder: vault, receipts: true } })
      const now = Date.now()
      recordSession({ startedAt: now - 2000, rawText: `um ${word} sang quietly`, finalText: `The ${word} sang quietly.` })
      recordSession({ startedAt: now - 1000, rawText: `make the ${word} louder`, finalText: `The ${word} sang.`, kind: 'transform' })
      const noted = `Feed the ${word} on Tuesday.`
      noteSaved(saveNote(noted, new Date(now)), noted)

      const shown = (await win.webContents.executeJavaScript(`(async () => {
        ${helpers}
        if (!(await tab('home'))) return null
        const home = await until(() => document.querySelector('.log-text') !== null && document.querySelector('.last-note-line') !== null && seen())
        await openRows()
        const said = document.querySelector('.log-said .log-text')?.textContent.includes(word) === true
        const report = [...document.querySelectorAll('.report-field textarea')].some((f) => f.value.includes(word))
        await tab('wrap-up')
        const wrapup = await until(() => document.querySelector('.log-text') !== null && seen())
        await tab('settings')
        const box = document.querySelector('.trybox')
        if (box) box.value = 'typed ' + word
        const tryBox = box !== null && seen()
        await tab('home')
        await until(() => document.querySelector('#home-hide-words') !== null)
        const off = checked('home-hide-words') === 'false' && checked('row-hide-words') === 'false'
        return { home, said, report, wrapup, tryBox, off }
      })()`)) as Record<string, boolean> | null

      const hidden = (await win.webContents.executeJavaScript(`(async () => {
        ${helpers}
        await until(() => document.querySelector('.log-text') !== null)
        await flip('home-hide-words')
        await openRows()
        const home = !seen()
        const saidCopy = document.body.textContent.includes('Copy what you said')
        const reportOff = document.body.textContent.includes('Turn off Hide words to report this take.') && document.querySelector('.report-field') === null
        const numbers = [...document.querySelectorAll('.log-meta')].some((meta) => meta.textContent.includes('wpm'))
        const copy = document.querySelectorAll('.log-copy').length >= 3
        const same = checked('home-hide-words') === 'true' && checked('row-hide-words') === 'true'
        await tab('wrap-up')
        await until(() => document.querySelector('.log-text') !== null)
        const wrapup = !seen()
        await tab('settings')
        const settings = !seen() && document.querySelector('.trybox') === null
        return { hiddenHome: home, saidCopy, reportOff, numbers, copy, sameOn: same, hiddenWrapup: wrapup, settings }
      })()`)) as Record<string, boolean> | null

      const stored = JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')) as { history?: { hideWords?: unknown } }
      const saved = stored.history?.hideWords === true && getSettings().history.hideWords

      // Watch every change from the first moment of a reload: a restart
      // must not flash the words before the setting arrives.
      const watching = new Promise<void>((resolve) => {
        win.webContents.once('dom-ready', () => {
          void win.webContents
            .executeJavaScript(`(() => {
              window.sawWords = false
              new MutationObserver(() => {
                if (document.documentElement.outerHTML.toLowerCase().includes(${JSON.stringify(word)})) window.sawWords = true
              }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
            })()`)
            .finally(resolve)
        })
      })
      win.webContents.reload()
      await watching
      const reloaded = (await win.webContents.executeJavaScript(`(async () => {
        ${helpers}
        await until(() => document.querySelector('.wizard-footer button, .nav-btn') !== null)
        const skip = [...document.querySelectorAll('.wizard-footer button')].find((b) => b.textContent === 'Skip for now')
        if (skip) skip.click()
        await until(() => document.querySelector('.log-text') !== null)
        await wait(150)
        return { rows: document.querySelector('.log-text') !== null, clean: window.sawWords === false && !seen() }
      })()`)) as Record<string, boolean> | null

      // The other switch turns it back off, and the words return.
      const restored = (await win.webContents.executeJavaScript(`(async () => {
        ${helpers}
        document.querySelector('#row-hide-words [role=switch]').click()
        await until(() => checked('home-hide-words') === 'false')
        return { same: checked('row-hide-words') === 'false', back: await until(seen) }
      })()`)) as Record<string, boolean> | null

      const facts = { ...shown, ...hidden, saved, ...reloaded, ...restored }
      const failed = Object.entries(facts).filter(([, ok]) => !ok).map(([name]) => name)
      const ok = shown !== null && hidden !== null && reloaded !== null && restored !== null && failed.length === 0
      if (!ok) console.error(`smoke hideWords: failed=${failed.join(',')} shown=${shown !== null} hidden=${hidden !== null}`)
      return ok
    } finally {
      await win.webContents.executeJavaScript('window.murmur.clearHistory()').catch(() => undefined)
      updateSettings({ notes: notesBefore, history: { hideWords: false } })
    }
  })

  registerSmokeCheck('widgetLifecycle', async () => {
    // Closing the window must hide it and keep the process alive.
    if (!settingsWindow) return false
    settingsWindow.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    return !settingsWindow.isDestroyed() && !settingsWindow.isVisible()
  })

  app.on('activate', () => {
    showSettingsWindow()
  })

  // Design QA hook: MURMUR_SETTINGS_CAPTURE=/path.png saves a shot of the
  // settings window and exits, no screen needed.
  const settingsCapture = process.env.MURMUR_SETTINGS_CAPTURE
  if (settingsCapture && settingsWindow) {
    await settingsLoaded.catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 900))
    // MURMUR_SETTINGS_PAGE=home, analytics, wrap-up, or journey opens
    // that tab first, so every page can be shot (brushwork design QA).
    const page = process.env.MURMUR_SETTINGS_PAGE
    if (page) {
      const found = await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === ${JSON.stringify(page)})
          if (nav) nav.click()
          return Boolean(nav)
        })()`
      )
      // A misspelled page, or the setup wizard covering the tabs, must
      // fail loudly rather than quietly shoot the wrong screen.
      if (!found) {
        console.error(`[murmur] MURMUR_SETTINGS_PAGE: no tab named ${JSON.stringify(page)}`)
        app.exit(1)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    // MURMUR_SETTINGS_ANCHOR=row-id opens the settings tab, scrolls that
    // row to the top, and unfolds the group it sits in, so any
    // row can be shot, not just the home tab.
    const anchor = process.env.MURMUR_SETTINGS_ANCHOR
    // MURMUR_SETTINGS_SEARCH=words types into the settings search, so a
    // shot shows what the rail finds for them.
    const search = process.env.MURMUR_SETTINGS_SEARCH
    if (anchor || search) {
      await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const nav = [...document.querySelectorAll('.nav-btn')].find((b) => b.textContent === 'settings')
          if (nav) nav.click()
          return true
        })()`
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (search) {
      await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const field = document.querySelector('.rail-search')
          if (!field) return false
          const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          setValue.call(field, ${JSON.stringify(search)})
          field.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    if (anchor) {
      await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const row = document.getElementById(${JSON.stringify(anchor)})
          // A fold is a group now (US-155): open the one the row sits in.
          const fold = row ? row.closest('details') : null
          if (fold) fold.setAttribute('open', '')
          if (row) row.scrollIntoView({ block: 'start' })
          return true
        })()`
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    // MURMUR_SETTINGS_SCROLL=selector scrolls that element to the top of
    // whatever tab is open, so the lower half of a page can be shot, and
    // the activity wall to its newest days.
    const scrollTo = process.env.MURMUR_SETTINGS_SCROLL
    if (scrollTo) {
      await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(scrollTo)})
          if (el) el.scrollIntoView({ block: 'start' })
          // Sideways scrollers (the activity wall) show their newest end.
          for (const x of document.querySelectorAll('.heat-scroll')) x.scrollLeft = x.scrollWidth
          return Boolean(el)
        })()`
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    // MURMUR_SETTINGS_CLICK=selector focuses and clicks that element last
    // (opening a dialog such as the share card, or a hover note), then
    // waits for it to paint. Several selectors joined by || are clicked
    // in turn, each after the last has painted (a confirm, then its yes).
    const clickOn = process.env.MURMUR_SETTINGS_CLICK
    for (const selector of clickOn ? clickOn.split('||').map((x) => x.trim()).filter(Boolean) : []) {
      await settingsWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          // Focus first, as a real click would, so focus-driven notes open.
          if (el) {
            el.focus()
            el.click()
          }
          return Boolean(el)
        })()`
      )
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    // MURMUR_SETTINGS_TYPE=words types them, as real input, into whatever
    // the clicks left focused, so a search can be shot with its results.
    const typed = process.env.MURMUR_SETTINGS_TYPE
    if (typed) {
      for (const keyCode of typed) settingsWindow.webContents.sendInputEvent({ type: 'char', keyCode })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    // MURMUR_SETTINGS_KEYS=Down,Down,Return presses those keys, as real
    // input, in whatever the clicks left focused, each after the last
    // has painted, so keyboard paths can be shot too (the Model list's
    // Enter took the window down on 2026-11-10 with no shot to show it).
    const keys = process.env.MURMUR_SETTINGS_KEYS
    for (const keyCode of keys ? keys.split(',').map((x) => x.trim()).filter(Boolean) : []) {
      settingsWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode })
      settingsWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    // MURMUR_SETTINGS_PROBE=expression prints what it evaluates to in the
    // window just before the shot, for checking state a picture hides.
    const probe = process.env.MURMUR_SETTINGS_PROBE
    if (probe) {
      const value: unknown = await settingsWindow.webContents.executeJavaScript(`(() => { try { return JSON.stringify(${probe}) } catch (e) { return String(e) } })()`)
      console.log(`[murmur] probe ${String(value)}`)
    }
    const image = await settingsWindow.webContents.capturePage()
    const { writeFile } = await import('node:fs/promises')
    await writeFile(settingsCapture, image.toPNG())
    app.exit(0)
    return
  }

  if (isSmoke) {
    await settingsLoaded.catch((error) => console.error('[murmur] settings load failed:', error))
    await runSmokeAndExit()
  }

  // Regression probe: MURMUR_QUIT_TEST=1 quits through the REAL quit path
  // (app.quit, not app.exit) shortly after boot. The process must exit on
  // its own; a hang here is the bug where a window or native hook blocks
  // quitting.
  if (process.env.MURMUR_QUIT_TEST === '1') {
    setTimeout(() => app.quit(), 1200)
  }

  // Crash probe: MURMUR_CRASH_TEST=1 throws after boot so the
  // relaunch-once path can be verified from the command line.
  if (process.env.MURMUR_CRASH_TEST === '1') {
    setTimeout(() => {
      throw new Error('synthetic crash probe')
    }, 1500)
  }

  // Autostart follows the setting. Dev builds skip: registering the dev
  // Electron binary as a login item would be a trap.
  const applyAutostart = (enabled: boolean): void => {
    if (!app.isPackaged) return
    app.setLoginItemSettings({ openAtLogin: enabled })
  }
  applyAutostart(getSettings().autostart)
  onSettingsChanged((s) => applyAutostart(s.autostart))

  registerSmokeCheck('autostart', () => {
    // Round trip the platform API without changing its state.
    const before = app.getLoginItemSettings()
    app.setLoginItemSettings({ openAtLogin: before.openAtLogin })
    return app.getLoginItemSettings().openAtLogin === before.openAtLogin
  })
})
