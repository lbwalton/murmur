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

export interface ProviderTestResult {
  ok: boolean
  detail: string
}

export interface PermissionsStatus {
  microphone: string
  accessibility: boolean
  inputMonitoring: boolean
}

export interface HotkeysStatus {
  hookStarted: boolean
  bindingValid: boolean
}

const api = {
  appVersion: (): string => process.env.npm_package_version ?? '0.1.0',
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: Partial<Settings>): Promise<Settings> => {
    return ipcRenderer.invoke('settings:update', partial)
  },
  setApiKey: (key: string): Promise<KeyStatus> => ipcRenderer.invoke('apikey:set', key),
  clearApiKey: (): Promise<KeyStatus> => ipcRenderer.invoke('apikey:clear'),
  getApiKeyStatus: (): Promise<KeyStatus> => ipcRenderer.invoke('apikey:status'),
  testProvider: (): Promise<ProviderTestResult> => ipcRenderer.invoke('provider:test'),
  getPermissions: (): Promise<PermissionsStatus> => ipcRenderer.invoke('perms:status'),
  openPermissionPane: (pane: 'microphone' | 'accessibility' | 'input'): Promise<void> => {
    return ipcRenderer.invoke('perms:open', pane)
  },
  getHotkeysStatus: (): Promise<HotkeysStatus> => ipcRenderer.invoke('hotkeys:status'),
  captureHotkey: (): Promise<{ ok: boolean; binding?: string }> => {
    return ipcRenderer.invoke('hotkeys:capture')
  },
  previewOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:preview')
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
