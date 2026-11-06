// SPDX-License-Identifier: GPL-3.0-only
// Self-update from GitHub releases via electron-updater. Fail open:
// an update problem must never affect dictation, so every path here
// swallows its errors into the console and moves on. By default updates
// download quietly and install on quit; a notification says one is
// ready. Ask first waits for a click, and Off asks GitHub for nothing
// (US-136). Dev, smoke, and unpublished builds all no-op.
import { Notification, app } from 'electron'
import { CancellationToken } from 'electron-updater'
import { ipc } from './ipc'
import { getSettings, onSettingsChanged } from './settings'
import { isSmoke, registerSmokeCheck } from './smoke'
import type { UpdateMode } from '../shared/settings'
import { NO_UPDATE, type UpdateOffer, updatePlan } from './updater-rules'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let offer: UpdateOffer = NO_UPDATE
let download: (() => void) | null = null
// Held so a click from Action Center still reaches its handler.
let offerNotice: Notification | null = null

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
  ipc.handle('updates:offer', (): UpdateOffer => offer)
  ipc.handle('updates:download', (): UpdateOffer => {
    download?.()
    return offer
  })
  ipc.handle('updates:openReleases', async () => {
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
      let running: CancellationToken | null = null
      const mode = (): UpdateMode => getSettings().updates
      const apply = (): void => {
        const plan = updatePlan(mode())
        autoUpdater.autoDownload = plan.autoDownload
        autoUpdater.autoInstallOnAppQuit = plan.installOnQuit
      }
      apply()
      download = () => {
        if (offer.available === null || offer.downloading || mode() !== 'ask') return
        offer = { ...offer, downloading: true }
        running = new CancellationToken()
        void autoUpdater.downloadUpdate(running).catch((error: Error) => {
          offer = { ...offer, downloading: false }
          console.error('[murmur] updater:', error.message)
        })
      }
      autoUpdater.on('update-available', (info) => {
        if (updatePlan(mode()).autoDownload) return
        // Every check says this again until it is installed.
        if (info.version === offer.available || info.version === offer.ready) return
        offer = { ...offer, available: info.version }
        if (!Notification.isSupported()) return
        offerNotice = new Notification({
          title: 'murmur update available',
          body: `Version ${info.version} is ready to download. Click to download it.`
        })
        offerNotice.on('click', () => download?.())
        offerNotice.show()
      })
      autoUpdater.on('update-downloaded', (info) => {
        running = null
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
        apply()
        if (!updatePlan(mode()).check) return
        void autoUpdater
          .checkForUpdates()
          .then((result) => {
            if (result?.cancellationToken) running = result.cancellationToken
          })
          .catch(() => undefined)
      }
      check()
      setInterval(check, CHECK_INTERVAL_MS).unref()
      // Turning updates on should not wait 4 hours for the first check.
      let last = mode()
      onSettingsChanged((settings) => {
        if (settings.updates === last) return
        last = settings.updates
        apply()
        // Leaving Automatic stops a download that nobody asked for now,
        // and Off stops any.
        if (!updatePlan(last).autoDownload) {
          running?.cancel()
          running = null
          offer = { ...offer, downloading: false }
        }
        check()
      })
    } catch (error) {
      console.error('[murmur] updater init failed:', error)
    }
  })()
}
