// SPDX-License-Identifier: GPL-3.0-only
// Self-update from GitHub releases via electron-updater. Fail open:
// an update problem must never affect dictation, so every path here
// swallows its errors into the console and moves on. Updates download
// quietly and install on quit; a notification says one is ready.
// Dev, smoke, and unpublished builds all no-op.
import { Notification, app } from 'electron'
import { isSmoke, registerSmokeCheck } from './smoke'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

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
  registerSmokeCheck('updater', async () => {
    // The module loads and exposes the check entry point; the real
    // update path needs published releases and a signed build, which
    // only exist outside smoke.
    try {
      const autoUpdater = await loadAutoUpdater()
      return typeof autoUpdater?.checkForUpdates === 'function'
    } catch (error) {
      console.error('[murmur] updater smoke:', error)
      return false
    }
  })
  if (!app.isPackaged || isSmoke) return

  void (async () => {
    try {
      const autoUpdater = await loadAutoUpdater()
      if (!autoUpdater) return
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-downloaded', (info) => {
        if (!Notification.isSupported()) return
        new Notification({
          title: 'murmur update ready',
          body: `Version ${info.version} installs when you quit.`
        }).show()
      })
      autoUpdater.on('error', (error) => {
        console.error('[murmur] updater:', error.message)
      })
      const check = (): void => {
        void autoUpdater.checkForUpdates().catch(() => undefined)
      }
      check()
      setInterval(check, CHECK_INTERVAL_MS).unref()
    } catch (error) {
      console.error('[murmur] updater init failed:', error)
    }
  })()
}
