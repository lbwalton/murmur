// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'
import { initAudio } from './audio'
import { dictationStart, dictationStop, initDictation } from './dictation'
import { initHotkeys, stopHotkeys } from './hotkeys'
import { initInsertion } from './insertion'
import { initOverlay } from './overlay'
import { initPermissions } from './permissions'
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
  if (isSmoke || process.env.MURMUR_SETTINGS_CAPTURE || process.env.MURMUR_QUIT_TEST) {
    const dir = join(tmpdir(), `murmur-smoke-${process.pid}`)
    rmSync(dir, { recursive: true, force: true })
    app.setPath('userData', dir)
  } else {
    app.setPath('userData', join(app.getPath('appData'), 'murmur-dev'))
  }
}

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

  initSettings()
  initAudio()
  initOverlay()
  initTranscribe()
  initInsertion()
  initDictation()

  initHotkeys({
    start: dictationStart,
    stop: () => {
      void dictationStop()
    }
  })
  initPermissions()

  createTray({
    onOpen: showSettingsWindow,
    onQuit: () => app.quit()
  })

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
    const kind = await settingsWindow.webContents.executeJavaScript('typeof window.murmur')
    return kind === 'object'
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
    await settingsLoaded.catch(() => undefined)
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
