// SPDX-License-Identifier: GPL-3.0-only
// Self-update from GitHub releases via electron-updater. Fail open:
// an update problem must never affect dictation, so every path here
// swallows its errors into the console and moves on. By default updates
// download quietly and install on quit; a notification says one is
// ready. Ask first waits for a click, and Off asks GitHub for nothing
// (US-136). Dev, smoke, and unpublished builds all no-op.
import { Notification, app, ipcMain } from 'electron'
import { getSettings, onSettingsChanged } from './settings'
import { isSmoke, registerSmokeCheck } from './smoke'
import { NO_UPDATE, type UpdateOffer, updatePlan } from './updater-rules'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let offer: UpdateOffer = NO_UPDATE
let download: (() => void) | null = null

// electron-updater exposes autoUpdater behind a lazy getter, which the
// CJS-to-ESM interop cannot surface as a named export; it reliably
// lives on default instead.
async function loadAutoUpdater(): Promise<import('electron-updater').AppUpdater | null> {
  const mod = (await import('electron-updater')) as unknown as {
    autoUpdater?: import('electron-updater').AppUpdater
    default?: { autoUpdater?: import('electron-updater').AppUpdater }
  }
  return mod.autoUpdater ?? mod.default?.autoUpdater ?? null
}

export function initUpdater(): void {
  ipcMain.handle('updates:offer', (): UpdateOffer => offer)
  ipcMain.handle('updates:download', (): UpdateOffer => {
    download?.()
    return offer
  })
  ipcMain.handle('updates:openReleases', async () => {
    const { shell } = await import('electron')
    await shell.openExternal('https://github.com/lbwalton/murmur/releases')
  })

  registerSmokeCheck('updater', async () => {
    // The module loads and exposes the check entry point; the real
    // update path needs published releases and a signed build, which
    // only exist outside smoke.
    try {
      const autoUpdater = await loadAutoUpdater()
      return (
        typeof autoUpdater?.checkForUpdates === 'function' &&
        typeof autoUpdater?.downloadUpdate === 'function' &&
        updatePlan(getSettings().updates).check &&
        !updatePlan('off').check
      )
    } catch (error) {
      console.error(`smoke updater: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  })
  if (!app.isPackaged || isSmoke) return

  void (async () => {
    try {
      const autoUpdater = await loadAutoUpdater()
      if (!autoUpdater) return
      autoUpdater.autoInstallOnAppQuit = true
      const apply = (): void => {
        autoUpdater.autoDownload = updatePlan(getSettings().updates).autoDownload
      }
      apply()
      download = () => {
        if (offer.available === null || offer.downloading) return
        offer = { ...offer, downloading: true }
        void autoUpdater.downloadUpdate().catch((error: Error) => {
          offer = { ...offer, downloading: false }
          console.error('[murmur] updater:', error.message)
        })
      }
      autoUpdater.on('update-available', (info) => {
        if (updatePlan(getSettings().updates).autoDownload) return
        offer = { ...offer, available: info.version }
        if (!Notification.isSupported()) return
        const notice = new Notification({
          title: 'murmur update available',
          body: `Version ${info.version} is ready to download. Click to download it.`
        })
        notice.on('click', () => download?.())
        notice.show()
      })
      autoUpdater.on('update-downloaded', (info) => {
        offer = { available: null, downloading: false, ready: info.version }
        if (!Notification.isSupported()) return
        new Notification({
          title: 'murmur update ready',
          body: `Version ${info.version} installs when you quit.`
        }).show()
      })
      autoUpdater.on('error', (error) => {
        offer = { ...offer, downloading: false }
        console.error('[murmur] updater:', error.message)
      })
      const check = (): void => {
        // Read every time, so Off holds from the moment it is chosen.
        if (!updatePlan(getSettings().updates).check) return
        apply()
        void autoUpdater.checkForUpdates().catch(() => undefined)
      }
      check()
      setInterval(check, CHECK_INTERVAL_MS).unref()
      // Turning updates on should not wait 4 hours for the first check.
      let last = getSettings().updates
      onSettingsChanged((settings) => {
        if (settings.updates === last) return
        last = settings.updates
        check()
      })
    } catch (error) {
      console.error('[murmur] updater init failed:', error)
    }
  })()
}
