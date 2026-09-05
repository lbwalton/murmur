// SPDX-License-Identifier: GPL-3.0-only
// Settings window preload. Every IPC channel this window may use is named
// here explicitly; the renderer never sees ipcRenderer itself.
// Channel names are written as literals on purpose: sandboxed preloads
// must bundle to a single file (no shared chunks), and the literals ARE
// this window's IPC allowlist. Keep them in sync with src/shared/ipc.ts.
import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../shared/settings'

export interface KeyStatus {
  present: boolean
  masked: string | null
}

const api = {
  appVersion: (): string => process.env.npm_package_version ?? '0.1.0',
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: Partial<Settings>): Promise<Settings> => {
    return ipcRenderer.invoke('settings:update', partial)
  },
  setApiKey: (key: string): Promise<KeyStatus> => ipcRenderer.invoke('apikey:set', key),
  clearApiKey: (): Promise<KeyStatus> => ipcRenderer.invoke('apikey:clear'),
  getApiKeyStatus: (): Promise<KeyStatus> => ipcRenderer.invoke('apikey:status')
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
