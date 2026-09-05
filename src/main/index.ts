// SPDX-License-Identifier: GPL-3.0-only
// Murmur main process entry. The shell grows story by story; see prd.json.
import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'
import { isSmoke, registerSmokeCheck, runSmokeAndExit } from './smoke'

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

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) {
    void win.loadURL(`${devServer}/settings/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/settings/index.html'))
  }
  return win
}

function whenLoaded(win: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve())
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      reject(new Error(`renderer failed to load: ${code} ${desc}`))
    })
  })
}

app.whenReady().then(async () => {
  registerSmokeCheck('appReady', () => app.isReady())

  const settingsWindow = createSettingsWindow()
  const settingsLoaded = whenLoaded(settingsWindow)

  registerSmokeCheck('settingsWindow', () => !settingsWindow.isDestroyed())
  registerSmokeCheck('settingsRenderer', async () => {
    await settingsLoaded
    const kind = await settingsWindow.webContents.executeJavaScript('typeof window.murmur')
    return kind === 'object'
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow()
  })

  if (isSmoke) {
    await settingsLoaded.catch(() => undefined)
    await runSmokeAndExit()
  }
})

// Tray-resident lifecycle lands in US-005. Until then the window is the app.
app.on('window-all-closed', () => {
  app.quit()
})
