// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, ipcMain } from 'electron'
import { initAudio } from './audio'
import { dictationStart, dictationStop, initDictation, pasteLastDictation } from './dictation'
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
import { initOverlay } from './overlay'
import { initPermissions } from './permissions'
import { initRecap } from './recap'
import { initNotes, openTodayNote } from './notes'
import { getLastNote, onLastNoteChanged, openLastNote } from './notes/receipt'
import { initTransform } from './transform'
import { initTranscribe } from './transcribe'
import { getSettings, initSettings, onSettingsChanged } from './settings'
import { isSmoke, registerSmokeCheck, runSmokeAndExit } from './smoke'
import { devRendererUrl, watchWindow } from './window-watch'
import { createTray, getTray, setTrayInboxVisible, setTrayLastNoteVisible } from './tray'
import { installHardening } from './hardening'
import { reviveOnDeath } from './revive'
import { refusedSwitch } from './hardening-rules'

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

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    show: !isSmoke,
    backgroundColor: '#0F0E11',
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

  // Closing the window hides it; the app lives in the tray.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  const devServer = devRendererUrl()
  if (devServer) {
    void win.loadURL(`${devServer}/settings/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/settings/index.html'))
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

app.on('before-quit', () => {
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
  installHardening()

  // Widget-first on macOS: menu bar resident, no Dock icon. A visible
  // window still shows normally; a Dock toggle setting lands later.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()

  // Minimal menu: macOS needs Edit roles for Cmd+V in fields; everything
  // else stays out so stray accelerators cannot surprise the user. Other
  // platforms get no menu bar at all.
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
  const { initCatalog } = await import('./catalog')
  initCatalog()
  initHistory(() => settingsWindow)
  initAudio()
  initOverlay()
  const { initUpdater } = await import('./updater')
  initUpdater()
  const { initLicense } = await import('./license')
  initLicense()
  const { initProfiles } = await import('./profiles')
  initProfiles()
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

  initHotkeys({
    start: dictationStart,
    stop: () => {
      void dictationStop()
    },
    pasteLast: () => {
      void pasteLastDictation()
    },
    note: {
      start: () => dictationStart('note'),
      stop: () => {
        void dictationStop('note')
      }
    },
    transform: {
      start: () => dictationStart('transform'),
      stop: () => {
        void dictationStop('transform')
      }
    }
  })
  initPermissions()

  // Share card: the journey page draws a PNG locally; main only offers
  // the save dialog and writes bytes. Nothing leaves the machine.
  ipcMain.handle('sharecard:save', async (_event, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return false
    const { dialog } = await import('electron')
    const { writeFile } = await import('node:fs/promises')
    const target = settingsWindow
    if (!target || target.isDestroyed()) return false
    const { canceled, filePath } = await dialog.showSaveDialog(target, {
      defaultPath: 'murmur-belt.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return false
    await writeFile(filePath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'))
    return true
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:license', async () => {
    const { shell } = await import('electron')
    await shell.openExternal('https://www.gnu.org/licenses/gpl-3.0.html')
  })

  // Copy for the history view: sandboxed renderers route through main.
  ipcMain.handle('clipboard:copy', async (_event, text: unknown) => {
    await clipboard.writeText(String(text))
  })

  // Capture a new hotkey: global trigger paused, keys intercepted ahead
  // of menu accelerators, binding validated against the real key map,
  // and saved through the normal settings path on success. The target
  // picks which binding is being set: the dictation trigger, or one of
  // the chords (paste-last, note) with their stricter rules.
  ipcMain.handle('hotkeys:capture', async (_event, target: unknown) => {
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
    }
  })
  // The inbox item exists only while there is a folder to open.
  setTrayInboxVisible(getSettings().notes.folder.trim() !== '')
  onSettingsChanged((s) => setTrayInboxVisible(s.notes.folder.trim() !== ''))
  // Open last note appears once a note has been saved, and stays.
  setTrayLastNoteVisible(getLastNote() !== null)
  onLastNoteChanged((note) => setTrayLastNoteVisible(note !== null))
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
    return probe.items === 9 && probe.sections === 9 && probe.finish && probe.first === 'Hotkey'
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
    // row to the top, and unfolds any disclosure in its panel, so any
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
          const panel = row ? row.closest('.panel') : null
          for (const d of panel ? panel.querySelectorAll('details') : []) d.setAttribute('open', '')
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
