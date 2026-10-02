// SPDX-License-Identifier: GPL-3.0-only
// App-level locks (US-072). murmur's windows only ever show murmur's
// own bundled pages, so in normal use none of this fires: a page that
// tries to leave, open another window, attach a webview, or use a
// browser permission it does not need is refused, and only the hidden
// audio window may open the microphone macOS granted to murmur.
import { BrowserWindow, type WebContents, app, session, webContents } from 'electron'
import { navigationAllowed, permissionAllowed } from './hardening-rules'
import { registerSmokeCheck } from './smoke'
import { writeAppLog } from './window-watch'

let microphoneContentsId: number | null = null

/** The audio window registers itself as the one microphone user. Its
 *  webContents survives a renderer reload, so this holds across revives. */
export function markMicrophoneWindow(contents: WebContents): void {
  microphoneContentsId = contents.id
}

function originOf(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' ? 'file:' : parsed.origin
  } catch {
    return 'unparseable'
  }
}

function lockContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (navigationAllowed(contents.getURL(), url)) return
    event.preventDefault()
    writeAppLog(`[hardening] navigation refused to ${originOf(url)}`)
  })
  contents.on('will-redirect', (event, url) => {
    if (navigationAllowed(contents.getURL(), url)) return
    event.preventDefault()
    writeAppLog(`[hardening] redirect refused to ${originOf(url)}`)
  })
  contents.setWindowOpenHandler(({ url }) => {
    writeAppLog(`[hardening] window open refused to ${originOf(url)}`)
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
    writeAppLog('[hardening] webview refused')
  })
}

/** Call once at startup, before any window exists. The navigation lock
 *  covers every webContents ever created; the permission rules need the
 *  default session, so this must run after app ready. */
export function installHardening(): void {
  app.on('web-contents-created', (_event, contents) => lockContents(contents))
  for (const contents of webContents.getAllWebContents()) lockContents(contents)

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    const allowed = permissionAllowed(permission, contents.id === microphoneContentsId, mediaTypes)
    if (!allowed) writeAppLog(`[hardening] permission refused ${permission}`)
    callback(allowed)
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const mediaTypes = details.mediaType ? [details.mediaType] : []
    return permissionAllowed(permission, contents !== null && contents.id === microphoneContentsId, mediaTypes)
  })

  // A throwaway window proves the lock: a page-initiated navigation and
  // a window.open both go nowhere, and the page stays where it was.
  registerSmokeCheck('navigationLock', async () => {
    const probe = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    try {
      await probe.loadURL('data:text/html,<p>probe</p>')
      const start = probe.webContents.getURL()
      const windowsBefore = BrowserWindow.getAllWindows().length
      const opened = await probe.webContents.executeJavaScript(
        "window.location.href = 'https://example.invalid/'; window.open('https://example.invalid/') === null"
      )
      await new Promise((resolve) => setTimeout(resolve, 400))
      return (
        opened === true &&
        probe.webContents.getURL() === start &&
        BrowserWindow.getAllWindows().length === windowsBefore
      )
    } finally {
      probe.destroy()
    }
  })

  // The microphone answers granted to the audio window and denied to
  // every other murmur window, read through the permissions API so no
  // real mic opens.
  registerSmokeCheck('permissionLock', async () => {
    const query = "navigator.permissions.query({ name: 'microphone' }).then((r) => r.state)"
    const states = await Promise.all(
      webContents
        .getAllWebContents()
        .filter((contents) => contents.getURL().startsWith('file:') || contents.id === microphoneContentsId)
        .map(async (contents) => ({
          audio: contents.id === microphoneContentsId,
          state: (await contents.executeJavaScript(query)) as string
        }))
    )
    const audio = states.filter((s) => s.audio)
    const others = states.filter((s) => !s.audio)
    return (
      audio.length === 1 &&
      audio[0].state === 'granted' &&
      others.length >= 2 &&
      others.every((s) => s.state === 'denied')
    )
  })
}
