// SPDX-License-Identifier: GPL-3.0-only
// Settings window preload. Every IPC channel this window may use is named
// here explicitly; the renderer never sees ipcRenderer itself.
// Channel names are written as literals on purpose: sandboxed preloads
// must bundle to a single file (no shared chunks), and the literals ARE
// this window's IPC allowlist. Keep them in sync with src/shared/ipc.ts.
import { contextBridge, ipcRenderer } from 'electron'
import type { SessionEvent } from '../shared/history'
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
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openLicense: (): Promise<void> => ipcRenderer.invoke('app:license'),
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
  captureHotkey: (): Promise<{ ok: boolean; binding?: string; reason?: string }> => {
    return ipcRenderer.invoke('hotkeys:capture')
  },
  previewOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:preview'),
  listHistory: (): Promise<SessionEvent[]> => ipcRenderer.invoke('history:list'),
  clearHistory: (): Promise<SessionEvent[]> => ipcRenderer.invoke('history:clear'),
  onHistoryAppended: (cb: (event: SessionEvent) => void): (() => void) => {
    const handler = (_e: unknown, event: SessionEvent): void => cb(event)
    ipcRenderer.on('history:appended', handler)
    // The home view mounts and unmounts with its tab: give it a real
    // unsubscribe so listeners never pile up across switches.
    return () => ipcRenderer.removeListener('history:appended', handler)
  },
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', text),
  getAnalytics: (): Promise<import('../shared/analytics').AnalyticsSummary> => {
    return ipcRenderer.invoke('analytics:summary')
  },
  getHeatmap: (year: number | null): Promise<import('../shared/analytics').HeatmapData> => {
    return ipcRenderer.invoke('analytics:heatmap', year)
  },
  testRecap: (): Promise<string> => ipcRenderer.invoke('recap:test'),
  getRankProgress: (): Promise<import('../shared/ranks').ProgressReport> => {
    return ipcRenderer.invoke('ranks:progress')
  },
  getEarnedAchievements: (): Promise<import('../shared/achievements').EarnedAchievement[]> => {
    return ipcRenderer.invoke('achievements:earned')
  },
  getAchievementDefs: (): Promise<Array<{ id: string; name: string; hint: string }>> => {
    return ipcRenderer.invoke('achievements:defs')
  },
  getCosmetics: (): Promise<import('../shared/cosmetics').CosmeticsReport> => {
    return ipcRenderer.invoke('cosmetics:report')
  },
  getEquivalentLine: (pick: number): Promise<string> => {
    return ipcRenderer.invoke('equivalents:line', pick)
  },
  saveShareCard: (pngDataUrl: string): Promise<boolean> => {
    return ipcRenderer.invoke('sharecard:save', pngDataUrl)
  },
  onNavigate: (cb: (page: string) => void): (() => void) => {
    const handler = (_e: unknown, page: string): void => cb(page)
    ipcRenderer.on('nav:goto', handler)
    return () => ipcRenderer.removeListener('nav:goto', handler)
  }
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
