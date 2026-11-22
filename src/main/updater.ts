// SPDX-License-Identifier: GPL-3.0-only
// Self-update from GitHub releases via electron-updater. Fail open:
// an update problem must never affect dictation, so every path here
// swallows its errors into the console and moves on. By default updates
// download quietly and install on quit; a notification says one is
// ready. Ask first waits for a click, and Off asks GitHub for nothing
// (US-136). The menus can also check now and restart to install now,
// never during a take (US-178). Dev, smoke, and unpublished builds all
// no-op.
import { Notification, app, autoUpdater as nativeUpdater } from 'electron'
import { CancellationToken } from 'electron-updater'
import { ipc } from './ipc'
import { getSettings, onSettingsChanged } from './settings'
import { isSmoke, registerSmokeCheck } from './smoke'
import { writeAppLog } from './window-watch'
import type { UpdateMode } from '../shared/settings'
import {
  NO_UPDATE,
  type RestartWait,
  type UpdateAction,
  type UpdateMenuItem,
  type UpdateOffer,
  restartLook,
  updateMenuItem,
  updatePlan
} from './updater-rules'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
/** How often a clicked restart looks again (restartLook decides). */
const RESTART_POLL_MS = 500
/** A restart that has not closed murmur by then failed. */
const RESTART_GIVE_UP_MS = 60_000

export interface UpdaterHooks {
  /** True while a restart would cost words (takeBusy). */
  busy: () => boolean
  /** Called as murmur starts closing to install, before its windows
   *  close, so closing the settings window quits instead of hiding it. */
  beforeRestart: () => void
}

let offer: UpdateOffer = NO_UPDATE
let actions: Record<UpdateAction, () => void> | null = null
const listeners = new Set<() => void>()
// Held so a click from Action Center still reaches its handler.
let held: Notification[] = []

function setOffer(next: UpdateOffer): void {
  offer = next
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[murmur] updater listener:', error)
    }
  }
}

/** Hear every change to the update state, for the menus. */
export function onUpdateOfferChanged(listener: () => void): void {
  listeners.add(listener)
}

/** The item the menus show now, or null: none in dev, smoke, or Off. */
export function currentUpdateItem(): UpdateMenuItem | null {
  return updateMenuItem(getSettings().updates, offer)
}

/** A click on the menus' update item. */
export function runUpdateAction(action: UpdateAction): void {
  actions?.[action]()
}

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  const notice = new Notification({ title, body })
  if (onClick) notice.on('click', onClick)
  notice.show()
  held = [...held.slice(-3), notice]
}

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

export function initUpdater(hooks: UpdaterHooks): void {
  ipc.handle('updates:offer', (): UpdateOffer => offer)
  ipc.handle('updates:download', (): UpdateOffer => {
    actions?.download()
    return offer
  })
  ipc.handle('updates:check', (): UpdateOffer => {
    actions?.check()
    return offer
  })
  ipc.handle('updates:restart', (): UpdateOffer => {
    actions?.restart()
    return offer
  })
  ipc.handle('updates:openReleases', async () => {
    const { shell } = await import('electron')
    await shell.openExternal('https://github.com/lbwalton/murmur/releases')
  })

  registerSmokeCheck('updater', async () => {
    // The module loads and exposes the check, download, and restart entry
    // points; the real update path needs published releases and a signed
    // build, which only exist outside smoke.
    try {
      const autoUpdater = await loadAutoUpdater()
      return (
        typeof autoUpdater?.checkForUpdates === 'function' &&
        typeof autoUpdater?.downloadUpdate === 'function' &&
        typeof autoUpdater?.quitAndInstall === 'function' &&
        updatePlan(getSettings().updates).check &&
        !updatePlan('off').check &&
        updateMenuItem('auto', { ...NO_UPDATE, live: true })?.action === 'check' &&
        updateMenuItem('off', { ...NO_UPDATE, live: true }) === null
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
      // A check someone asked for: a newer version downloads at once,
      // and nothing newer is said out loud.
      let asked = false
      // On a Mac, the system's installer (Squirrel) fetches the update from
      // electron-updater after the download; a restart before it has it
      // would wait on it with every window closed.
      let installerReady = process.platform !== 'darwin'
      nativeUpdater.on('update-downloaded', () => {
        installerReady = true
      })
      // Set once murmur starts closing to install; its windows are gone.
      let closing = false
      nativeUpdater.on('before-quit-for-update', () => {
        closing = true
        hooks.beforeRestart()
      })
      const mode = (): UpdateMode => getSettings().updates
      const apply = (): void => {
        const plan = updatePlan(mode())
        autoUpdater.autoDownload = plan.autoDownload
        autoUpdater.autoInstallOnAppQuit = plan.installOnQuit
      }
      apply()

      const download = (): void => {
        if (offer.available === null || offer.downloading || mode() === 'off') return
        setOffer({ ...offer, downloading: true })
        running = new CancellationToken()
        void autoUpdater.downloadUpdate(running).catch((error: Error) => {
          setOffer({ ...offer, downloading: false, percent: null })
          console.error('[murmur] updater:', error.message)
        })
      }

      const check = (byHand: boolean): void => {
        // Read every time, so Off holds from the moment it is chosen.
        apply()
        if (!updatePlan(mode()).check) return
        if (byHand) {
          if (offer.checking || offer.downloading || offer.ready !== null) return
          asked = true
          setOffer({ ...offer, checking: true, checked: null })
        }
        void autoUpdater
          .checkForUpdates()
          .then((result) => {
            // The check's token cancels only a download the check started;
            // a download started from its update-available has its own.
            if (result?.downloadPromise && result.cancellationToken) running = result.cancellationToken
            // No answer at all means the updater is not active here.
            if (byHand && result === null && offer.checking) {
              asked = false
              setOffer({ ...offer, checking: false })
            }
          })
          .catch((error: Error) => {
            console.error('[murmur] updater check:', error.message)
            if (!byHand) return
            asked = false
            setOffer({ ...offer, checking: false, checked: 'failed' })
            notify("murmur couldn't check for updates", 'Check your internet connection and try again.')
          })
      }

      const giveUp = (version: string | null): void => {
        if (closing) {
          // The windows are gone, so murmur cannot keep working as it is;
          // open it again on the version it has.
          writeAppLog(`[updater] restart to install ${version} stalled; reopening`)
          app.relaunch()
          app.exit(0)
          return
        }
        writeAppLog(`[updater] restart to install ${version} did not happen`)
        setOffer({ ...offer, restarting: false, restartPending: false })
        notify("murmur couldn't restart to update", `Version ${version} installs when you quit murmur.`)
      }

      const installNow = (): void => {
        const version = offer.ready
        writeAppLog(`[updater] restarting to install ${version}`)
        // Windows: install silently and open murmur again. A Mac always
        // opens it again once the update is in place.
        autoUpdater.quitAndInstall(true, true)
        setTimeout(() => giveUp(version), RESTART_GIVE_UP_MS).unref()
      }

      const restart = (): void => {
        if (offer.ready === null || offer.restarting) return
        // Never during a take: every look waits for the words to land.
        setOffer({ ...offer, restarting: true, restartPending: hooks.busy() })
        let wait: RestartWait = { quiet: 0, unready: 0 }
        const timer = setInterval(() => {
          const look = restartLook(wait, hooks.busy(), installerReady)
          wait = look.wait
          const pending = look.step === 'wait-take'
          if (pending !== offer.restartPending) setOffer({ ...offer, restartPending: pending })
          if (look.step === 'go') {
            clearInterval(timer)
            installNow()
          } else if (look.step === 'give-up') {
            clearInterval(timer)
            giveUp(offer.ready)
          }
        }, RESTART_POLL_MS)
      }

      actions = { check: () => check(true), download, restart }
      setOffer({ ...offer, live: true })

      autoUpdater.on('update-available', (info) => {
        const byHand = asked
        asked = false
        if (info.version === offer.ready) {
          setOffer({ ...offer, checking: false })
          return
        }
        // Automatic fetches it itself; the menus say it is on its way.
        if (updatePlan(mode()).autoDownload) {
          setOffer({ ...offer, checking: false, available: info.version, downloading: true })
          return
        }
        if (byHand) {
          setOffer({ ...offer, checking: false, available: info.version })
          download()
          return
        }
        // Every check says this again until it is installed.
        if (info.version === offer.available) return
        setOffer({ ...offer, available: info.version })
        notify(
          'murmur update available',
          `Version ${info.version} is ready to download. Click to download it.`,
          () => download()
        )
      })
      autoUpdater.on('download-progress', (progress) => {
        // Whole steps only, so the menus rebuild at most 100 times.
        const percent = Math.max(0, Math.min(100, Math.floor(progress.percent)))
        if (offer.downloading && percent !== offer.percent) setOffer({ ...offer, percent })
      })
      autoUpdater.on('update-not-available', () => {
        if (!asked) return
        asked = false
        setOffer({ ...offer, checking: false, checked: 'newest' })
        notify('murmur is up to date', `You have ${app.getVersion()}, the newest version.`)
      })
      autoUpdater.on('update-downloaded', (info) => {
        running = null
        // A later check finds the same file already downloaded and says
        // so again; only the first time is news.
        const news = info.version !== offer.ready
        setOffer({
          ...offer,
          available: null,
          downloading: false,
          percent: null,
          checking: false,
          checked: null,
          ready: info.version
        })
        if (!news) return
        notify(
          'murmur update ready',
          `Version ${info.version} installs when you quit. Click to restart murmur and install it now.`,
          () => restart()
        )
      })
      autoUpdater.on('error', (error) => {
        setOffer({ ...offer, downloading: false, percent: null })
        console.error('[murmur] updater:', error.message)
      })
      check(false)
      setInterval(() => check(false), CHECK_INTERVAL_MS).unref()
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
        }
        const still = updatePlan(last).autoDownload && offer.downloading
        setOffer({ ...offer, downloading: still, percent: still ? offer.percent : null, checked: null })
        check(false)
      })
    } catch (error) {
      console.error('[murmur] updater init failed:', error)
    }
  })()
}
