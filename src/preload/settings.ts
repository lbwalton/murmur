// SPDX-License-Identifier: GPL-3.0-only
// Settings window preload. Every IPC channel this window may use is named
// here explicitly; the renderer never sees ipcRenderer itself.
import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type { Settings } from '../shared/settings'

export interface KeyStatus {
  present: boolean
  masked: string | null
}

const api = {
  appVersion: (): string => process.env.npm_package_version ?? '0.1.0',
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IpcChannels.settingsGet),
  updateSettings: (partial: Partial<Settings>): Promise<Settings> => {
    return ipcRenderer.invoke(IpcChannels.settingsUpdate, partial)
  },
  setApiKey: (key: string): Promise<KeyStatus> => ipcRenderer.invoke(IpcChannels.apiKeySet, key),
  clearApiKey: (): Promise<KeyStatus> => ipcRenderer.invoke(IpcChannels.apiKeyClear),
  getApiKeyStatus: (): Promise<KeyStatus> => ipcRenderer.invoke(IpcChannels.apiKeyStatus)
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
