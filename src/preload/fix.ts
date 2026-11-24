// SPDX-License-Identifier: GPL-3.0-only
// Fix a word panel preload (US-184). Channel names are literals on
// purpose: sandboxed preloads must bundle to a single file, and the
// literals ARE this window's IPC allowlist. Keep them in step with
// FIX_SENDS in src/main/ipc-rules.ts; a unit test reads this file and
// fails if they drift.
import { contextBridge, ipcRenderer } from 'electron'

export interface FixAsk {
  /** Which question this is: an answer to an older one is dropped. */
  id: number
  /** The selected word or phrase. */
  heard: string
}

// The page subscribes once it has loaded, which can be after main's
// first question arrives; the preload listens from the start and hands
// a late subscriber the latest question.
let last: FixAsk | null = null
let listener: ((ask: FixAsk) => void) | null = null

ipcRenderer.on('fix:ask', (_event, ask: FixAsk) => {
  last = ask
  listener?.(ask)
})

const api = {
  onAsk: (cb: (ask: FixAsk) => void): void => {
    listener = cb
    if (last) cb(last)
  },
  save: (id: number, written: string): void => ipcRenderer.send('fix:save', id, written),
  cancel: (id: number): void => ipcRenderer.send('fix:cancel', id)
}

export type FixApi = typeof api

contextBridge.exposeInMainWorld('murmurFix', api)
