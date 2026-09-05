// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'
import { cancelRecording, initAudio, startRecording, stopRecording } from './audio'
import { initHotkeys, stopHotkeys } from './hotkeys'
import { initSettings } from './settings'
import { isSmoke, registerSmokeCheck, runSmokeAndExit } from './smoke'
import { createTray, getTray } from './tray'

// Development builds get their own userData so the lock, settings, and
// logs never collide with an installed Murmur (or the legacy app still
// running on this machine during the transition).
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'murmur-dev'))
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
    title: 'Murmur',
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
})

// The tray keeps the app alive with every window hidden or closed.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  // Widget-first on macOS: menu bar resident, no Dock icon. A visible
  // window still shows normally; a Dock toggle setting lands later.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()

  initSettings()
  initAudio()

  // Transcription (US-010) consumes the WAV; until then stop just drops it.
  initHotkeys({
    start: () => {
      startRecording()
    },
    stop: () => {
      void stopRecording()
    }
  })
  void cancelRecording

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

  if (isSmoke) {
    await settingsLoaded.catch(() => undefined)
    await runSmokeAndExit()
  }
})
