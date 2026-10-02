// SPDX-License-Identifier: GPL-3.0-only
// The decisions behind the app-level locks in hardening.ts, kept free
// of Electron so they can be unit tested (US-072).

/** Chromium switches that hand another program a live handle on every
 *  window, preload bridge and microphone grant included. No fuse covers
 *  them, so a packaged build refuses to start with either. */
export const REFUSED_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe'] as const

/** The refused switch a launch carries, or null. Dev runs keep them:
 *  debugging an unpackaged build is how murmur gets built. */
export function refusedSwitch(isPackaged: boolean, hasSwitch: (name: string) => boolean): string | null {
  if (!isPackaged) return null
  return REFUSED_SWITCHES.find((name) => hasSwitch(name)) ?? null
}

/** The browser permission rule: the hidden audio window may use the
 *  microphone, and no window may use anything else. mediaTypes lists
 *  what a media request or check names (Chromium sometimes says
 *  unknown for an audio check); the camera is never allowed. */
export function permissionAllowed(
  permission: string,
  isAudioWindow: boolean,
  mediaTypes: readonly string[] = []
): boolean {
  if (permission !== 'media' || !isAudioWindow) return false
  return mediaTypes.every((type) => type !== 'video')
}

/** Whether a page may navigate from where it is to url. murmur's pages
 *  never navigate; the one move allowed is a reload of the same page
 *  (the dev server's full reload does exactly that). */
export function navigationAllowed(currentUrl: string, url: string): boolean {
  return currentUrl !== '' && url === currentUrl
}
