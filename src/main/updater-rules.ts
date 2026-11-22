// SPDX-License-Identifier: GPL-3.0-only
// What each update setting does (US-136), kept free of Electron so it
// can be unit tested.
import type { OverlayPhase } from '../shared/overlay-state'
import type { UpdateMode } from '../shared/settings'

export interface UpdatePlan {
  /** Ask GitHub at all. Off makes no request of any kind. */
  check: boolean
  /** Fetch the update without asking. */
  autoDownload: boolean
  /** Install what was downloaded when murmur quits. Windows honors this
   *  at quit; on a Mac the file is already with the system by then. */
  installOnQuit: boolean
}

export function updatePlan(mode: UpdateMode): UpdatePlan {
  return { check: mode !== 'off', autoDownload: mode === 'auto', installOnQuit: mode !== 'off' }
}

export interface UpdateOffer {
  /** The updater is running here. Dev, smoke, and a build whose updater
   *  failed to load show no update controls at all. */
  live: boolean
  /** The version waiting for a click, or downloading, or null. */
  available: string | null
  downloading: boolean
  /** How much of the download is in, 0 to 100, once it reports. */
  percent: number | null
  /** A downloaded version waiting for the app to quit, or null. */
  ready: string | null
  /** A check someone asked for is running (US-178). */
  checking: boolean
  /** What the last check someone asked for found, for Settings to say. */
  checked: 'newest' | 'failed' | null
  /** Restart to update was clicked and is under way (US-178). */
  restarting: boolean
  /** That restart is waiting for a take to land. */
  restartPending: boolean
}

export const NO_UPDATE: UpdateOffer = {
  live: false,
  available: null,
  downloading: false,
  percent: null,
  ready: null,
  checking: false,
  checked: null,
  restarting: false,
  restartPending: false
}

/** What a click on the update item does (US-178). */
export type UpdateAction = 'check' | 'download' | 'restart'

export interface UpdateMenuItem {
  label: string
  /** Null shows the item greyed out: something is already under way. */
  action: UpdateAction | null
}

/**
 * The 1 update item the tray menu and the Mac's murmur menu carry
 * (US-178), or null to show none. Off shows none, so Off still asks
 * GitHub for nothing.
 */
export function updateMenuItem(mode: UpdateMode, offer: UpdateOffer): UpdateMenuItem | null {
  if (mode === 'off' || !offer.live) return null
  if (offer.ready !== null) {
    if (offer.restartPending) return { label: 'Restart after this take', action: null }
    if (offer.restarting) return { label: 'Restarting…', action: null }
    return { label: `Restart to update to ${offer.ready}`, action: 'restart' }
  }
  if (offer.downloading) {
    // No percent here: each new label rebuilds the menus, and an open
    // menu can close or freeze on a rebuild. Settings shows the percent.
    return { label: offer.available ? `Downloading ${offer.available}…` : 'Downloading the update…', action: null }
  }
  if (offer.checking) return { label: 'Checking for updates…', action: null }
  if (offer.available !== null) return { label: `Download ${offer.available}`, action: 'download' }
  return { label: 'Check for updates', action: 'check' }
}

export interface TakeState {
  phase: OverlayPhase
  handsFreeLocked: boolean
  parking: boolean
  /** A paste's clipboard restore has not finished. */
  clipboardPending: boolean
}

/**
 * True while a restart would cost words: a take recording, words on
 * their way or landing, a paste whose clipboard has not come back yet,
 * or a hands-free take locked or parking for Retry.
 */
export function takeBusy(take: TakeState): boolean {
  return (
    take.handsFreeLocked ||
    take.parking ||
    take.clipboardPending ||
    take.phase === 'recording' ||
    take.phase === 'processing' ||
    take.phase === 'inserted'
  )
}

/** Looks in a row with no take and the installer ready before a restart
 *  goes ahead, so a take that starts at the same moment still wins. */
export const RESTART_QUIET_LOOKS = 2
/** Looks with no take but the installer still not ready before giving up
 *  (2 minutes at 1 look every 500 ms). */
export const RESTART_UNREADY_LOOKS = 240

export interface RestartWait {
  quiet: number
  unready: number
}

export type RestartStep = 'wait-take' | 'wait-installer' | 'wait' | 'go' | 'give-up'

/**
 * 1 look of a restart that was clicked (US-178). A take resets the count,
 * so it waits as long as you keep dictating. On a Mac the system's
 * installer has to have the update in hand first, or the restart would
 * hang; if it never does, the restart gives up.
 */
export function restartLook(
  wait: RestartWait,
  busy: boolean,
  installerReady: boolean
): { wait: RestartWait; step: RestartStep } {
  if (busy) return { wait: { quiet: 0, unready: wait.unready }, step: 'wait-take' }
  if (!installerReady) {
    const unready = wait.unready + 1
    return { wait: { quiet: 0, unready }, step: unready >= RESTART_UNREADY_LOOKS ? 'give-up' : 'wait-installer' }
  }
  const quiet = wait.quiet + 1
  return { wait: { quiet, unready: wait.unready }, step: quiet >= RESTART_QUIET_LOOKS ? 'go' : 'wait' }
}
