// SPDX-License-Identifier: GPL-3.0-only
// Overlay window preload. Channel names are literals on purpose:
// sandboxed preloads must bundle to a single file (no shared chunks),
// and the literals ARE this window's IPC allowlist. Keep them in sync
// with src/shared/ipc.ts. Receive-only: the overlay never sends.
import { contextBridge, ipcRenderer } from 'electron'
import type { OverlayState } from '../shared/overlay-state'

export interface OverlayConfig {
  style: 'bars' | 'speckle'
}

const api = {
  onState: (cb: (state: OverlayState) => void): void => {
    ipcRenderer.on('overlay:state', (_event, state: OverlayState) => cb(state))
  },
  onLevel: (cb: (level: number) => void): void => {
    ipcRenderer.on('overlay:level', (_event, level: number) => cb(level))
  },
  onConfig: (cb: (config: OverlayConfig) => void): void => {
    ipcRenderer.on('overlay:config', (_event, config: OverlayConfig) => cb(config))
  }
}

export type OverlayApi = typeof api

contextBridge.exposeInMainWorld('murmurOverlay', api)
