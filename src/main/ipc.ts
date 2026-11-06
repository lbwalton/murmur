// SPDX-License-Identifier: GPL-3.0-only
// The 1 place IPC handlers are registered (US-139). Each call has to come
// from the main frame of 1 of murmur's own bundled pages, and that page
// has to be allowed the channel. A refused call is logged by channel and
// origin only, and reaches no handler.
import { pathToFileURL } from 'node:url'
import { type IpcMainEvent, type IpcMainInvokeEvent, app, ipcMain } from 'electron'
import { channelAllowed, pageRole } from './ipc-rules'
import { isSmoke } from './smoke'
import { devRendererUrl, writeAppLog } from './window-watch'

let rendererRoot = ''

/** The folder windows load their pages from, given the same way those
 *  windows build their paths, so the comparison cannot drift from them. */
export function setRendererRoot(path: string): void {
  rendererRoot = pathToFileURL(path).href
}

function allowed(event: IpcMainEvent | IpcMainInvokeEvent, channel: string): boolean {
  const frame = event.senderFrame
  const url = frame?.url ?? ''
  const role = pageRole(url, { rendererRoot, devServer: devRendererUrl(app.isPackaged) })
  if (frame !== null && frame !== undefined && frame.parent === null && role !== null && channelAllowed(role, channel)) {
    return true
  }
  let origin = 'unknown'
  try {
    origin = new URL(url).protocol
  } catch {
    // Nothing to name.
  }
  writeAppLog(`[ipc] refused ${channel} from ${origin}`)
  return false
}

type Handle = (event: IpcMainInvokeEvent, ...args: never[]) => unknown
type Listener = (event: IpcMainEvent, ...args: never[]) => void

const wrapped = new Map<Listener, (event: IpcMainEvent, ...args: unknown[]) => void>()
const listeners = new Map<string, Listener[]>()

export const ipc = {
  handle(channel: string, handler: Handle): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!allowed(event, channel)) throw new Error('refused')
      return handler(event, ...(args as never[]))
    })
  },

  on(channel: string, listener: Listener): void {
    const guarded = (event: IpcMainEvent, ...args: unknown[]): void => {
      if (allowed(event, channel)) listener(event, ...(args as never[]))
    }
    wrapped.set(listener, guarded)
    listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    ipcMain.on(channel, guarded)
  },

  /** Smoke's stand-in for a window: it runs headlessly, so it hands a
   *  listener a value directly. Outside smoke this does nothing. */
  simulate(channel: string, ...args: unknown[]): void {
    if (!isSmoke) return
    for (const listener of listeners.get(channel) ?? []) listener({} as IpcMainEvent, ...(args as never[]))
  },

  /** A refused call does not use up the 1 time. */
  once(channel: string, listener: Listener): void {
    const guarded = (event: IpcMainEvent, ...args: unknown[]): void => {
      if (!allowed(event, channel)) return
      ipcMain.removeListener(channel, guarded)
      wrapped.delete(listener)
      listener(event, ...(args as never[]))
    }
    wrapped.set(listener, guarded)
    ipcMain.on(channel, guarded)
  },

  removeListener(channel: string, listener: Listener): void {
    const guarded = wrapped.get(listener)
    if (guarded === undefined) return
    ipcMain.removeListener(channel, guarded)
    wrapped.delete(listener)
  }
}
