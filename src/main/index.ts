// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, ipcMain } from 'electron'
import { initAudio } from './audio'
import { dictationStart, dictationStop, initDictation } from './dictation'
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
import { initOverlay } from './overlay'
import { initPermissions } from './permissions'
import { initRecap } from './recap'
import { initTranscribe } from './transcribe'
import { initSettings } from './settings'
import { isSmoke, registerSmokeCheck, runSmokeAndExit } from './smoke'
import { createTray, getTray } from './tray'

// Development builds get their own userData so the lock, settings, and
// logs never collide with an installed murmur (or the legacy app still
// running on this machine during the transition). Smoke is hermetic: a
// wiped temp dir per boot, so no stale state and no lock contention with
// a running dev instance.
if (!app.isPackaged) {
  const isolatedRun =
    isSmoke ||
    process.env.MURMUR_SETTINGS_CAPTURE ||
    process.env.MURMUR_OVERLAY_CAPTURE ||
    process.env.MURMUR_QUIT_TEST
  if (isolatedRun) {
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
    const dir = join(tmpdir(), `murmur-smoke-${process.pid}`)
    app.setPath('userData', dir)
  } else {
    app.setPath('userData', join(app.getPath('appData'), 'murmur-dev'))
  }
}

// Last-resort net: an uncaught main-process exception must log, never
// throw a modal error dialog at the user. File logging with rotation
// arrives with US-022.
process.on('uncaughtException', (error) => {
  console.error('[murmur] uncaught exception:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[murmur] unhandled rejection:', reason)
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

  // Closing the window hides it; the app lives in the tray.
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
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
    return
  }
  settingsWindow.show()
  settingsWindow.focus()
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

  initSettings()
  initAudio()
  initOverlay()
  initTranscribe()
  initFormatter()
  initHistory(() => settingsWindow)
  initRecap({
    openWrapup: () => {
      showSettingsWindow()
      settingsWindow?.webContents.send('nav:goto', 'wrapup')
    }
  })
  initInsertion()
  initDictation()

  initHotkeys({
    start: dictationStart,
    stop: () => {
      void dictationStop()
    }
  })
  initPermissions()

  // Copy for the history view: sandboxed renderers route through main.
  ipcMain.handle('clipboard:copy', async (_event, text: unknown) => {
    await clipboard.writeText(String(text))
  })

  // Capture a new hotkey: global trigger paused, keys intercepted ahead
  // of menu accelerators, binding validated against the real key map,
  // and saved through the normal settings path on success.
  ipcMain.handle('hotkeys:capture', async () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return { ok: false }
    setHotkeysSuppressed(true)
    try {
      // Prefer the global hook (the same source the trigger reads, and
      // it sees pure modifier chords reliably); fall back to window
      // capture when the hook has no permission yet.
      const outcome =
        (await captureHotkeyViaHook()) ?? (await captureHotkeyFromWindow(settingsWindow))
      if (!outcome.binding) return { ok: false, reason: outcome.reason ?? 'cancelled' }
      if (!isBindingParseable(outcome.binding)) return { ok: false, reason: 'needs-modifier' }
      const { updateSettings } = await import('./settings')
      updateSettings({ hotkey: { binding: outcome.binding } })
      return { ok: true, binding: outcome.binding }
    } finally {
      setHotkeysSuppressed(false)
    }
  })

  createTray({
    onOpen: showSettingsWindow,
    onQuit: () => app.quit()
  })

  settingsWindow = createSettingsWindow()
  const settingsLoaded = whenLoaded(settingsWindow)
  // A crashed renderer must be loud in logs, not silent.
  settingsWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[murmur] settings renderer gone:', JSON.stringify(details))
  })

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
})
