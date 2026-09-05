// SPDX-License-Identifier: GPL-3.0-only
// Audio capture window preload. Main drives start/stop/cancel/rearm;
// the renderer reports readiness, armed state, and finished WAVs.
// Channel names are literals on purpose: sandboxed preloads must bundle
// to a single file (no shared chunks), and the literals ARE this
// window's IPC allowlist. Keep them in sync with src/shared/ipc.ts.
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  onStart: (cb: () => void): void => {
    ipcRenderer.on('audio:start', () => cb())
  },
  onStop: (cb: () => void): void => {
    ipcRenderer.on('audio:stop', () => cb())
  },
  onCancel: (cb: () => void): void => {
    ipcRenderer.on('audio:cancel', () => cb())
  },
  onRearm: (cb: () => void): void => {
    ipcRenderer.on('audio:rearm', () => cb())
  },
  ready: (): void => {
    ipcRenderer.send('audio:ready')
  },
  armed: (ok: boolean): void => {
    ipcRenderer.send('audio:armed', ok)
  },
  result: (wav: Uint8Array | null): void => {
    ipcRenderer.send('audio:result', wav)
  },
  level: (rms: number): void => {
    ipcRenderer.send('audio:level', rms)
  }
}

export type AudioApi = typeof api

contextBridge.exposeInMainWorld('murmurAudio', api)
