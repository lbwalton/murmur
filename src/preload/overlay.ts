// SPDX-License-Identifier: GPL-3.0-only
// Overlay window preload. Channel names are literals on purpose:
// sandboxed preloads must bundle to a single file (no shared chunks),
// and the literals ARE this window's IPC allowlist. Keep them in sync
// with src/shared/ipc.ts. Receive-only: the overlay never sends.
import { contextBridge, ipcRenderer } from 'electron'
import type { OverlayState } from '../shared/overlay-state'

export interface OverlayConfig {
  style: string
  accent?: string
  /** pill, compact, or bare (US-061); the renderer normalizes it. */
  look?: string
}

// The page subscribes once it has mounted, which can be after main's
// first messages arrive: a revived page (US-071) is sent the current
// phase the moment it loads. The preload listens from the start and
// hands a late subscriber the latest state and config, so nothing sent
// at load is lost. Levels are a live stream and are not kept.
let lastState: OverlayState | null = null
let lastConfig: OverlayConfig | null = null
let stateListener: ((state: OverlayState) => void) | null = null
let configListener: ((config: OverlayConfig) => void) | null = null

ipcRenderer.on('overlay:state', (_event, state: OverlayState) => {
  lastState = state
  stateListener?.(state)
})
ipcRenderer.on('overlay:config', (_event, config: OverlayConfig) => {
  lastConfig = config
  configListener?.(config)
})

const api = {
  onState: (cb: (state: OverlayState) => void): void => {
    stateListener = cb
    if (lastState) cb(lastState)
  },
  onLevel: (cb: (level: number) => void): void => {
    ipcRenderer.on('overlay:level', (_event, level: number) => cb(level))
  },
  onConfig: (cb: (config: OverlayConfig) => void): void => {
    configListener = cb
    if (lastConfig) cb(lastConfig)
  }
}

export type OverlayApi = typeof api

contextBridge.exposeInMainWorld('murmurOverlay', api)
