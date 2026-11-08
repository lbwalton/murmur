// SPDX-License-Identifier: GPL-3.0-only
// What each update setting does (US-136), kept free of Electron so it
// can be unit tested.
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
  /** The version waiting for a click, or null. */
  available: string | null
  downloading: boolean
  /** A downloaded version waiting for the app to quit, or null. */
  ready: string | null
}

export const NO_UPDATE: UpdateOffer = { available: null, downloading: false, ready: null }
