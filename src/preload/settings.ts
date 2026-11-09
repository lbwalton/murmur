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

export interface RingEntry {
  baseUrl: string
  masked: string
}

export interface RingStatus {
  active: KeyStatus
  list: RingEntry[]
  legacy: KeyStatus
}

export interface ProviderTestResult {
  ok: boolean
  detail: string
  /** Whether the provider's model list names the model being tested
   *  (US-154): null when no model was asked about or the list could
   *  not be read. */
  listed?: boolean | null
  /** The model id the test asked the provider about. */
  model?: string
  /** Every model the test asked about, in order: the speech test also
   *  asks about the cleanup model while cleanup runs on speech. */
  models?: Array<{ id: string; listed: boolean | null }>
}

export interface PermissionsStatus {
  microphone: string
  accessibility: boolean
  inputMonitoring: boolean
}

export interface HotkeysStatus {
  hookStarted: boolean
  bindingValid: boolean
  pasteBindingValid: boolean
  noteBindingValid: boolean
  transformBindingValid: boolean
}

export type NotesStatus = import('../main/notes').NotesStatus

const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openLicense: (): Promise<void> => ipcRenderer.invoke('app:license'),
  getLicenseStatus: (): Promise<import('../main/license').LicenseStatus> => {
    return ipcRenderer.invoke('license:status')
  },
  setLicenseKey: (key: string): Promise<import('../main/license').LicenseStatus> => {
    return ipcRenderer.invoke('license:set', key)
  },
  openBuyPage: (): Promise<void> => ipcRenderer.invoke('license:buy'),
  deactivateLicense: (): Promise<import('../main/license').LicenseStatus> => {
    return ipcRenderer.invoke('license:deactivate')
  },
  reactivateLicense: (): Promise<import('../main/license').LicenseStatus> => {
    return ipcRenderer.invoke('license:reactivate')
  },
  removeLicense: (): Promise<import('../main/license').LicenseStatus> => {
    return ipcRenderer.invoke('license:remove')
  },
  saveProviderProfile: (name: string): Promise<import('../main/profiles').ProfileResult> => {
    return ipcRenderer.invoke('profiles:save', name)
  },
  applyProviderProfile: (id: string): Promise<import('../main/profiles').ProfileResult> => {
    return ipcRenderer.invoke('profiles:apply', id)
  },
  /** Save the setup running now over a profile, keeping its name (US-154). */
  resaveProviderProfile: (id: string): Promise<import('../main/profiles').ProfileResult> => {
    return ipcRenderer.invoke('profiles:resave', id)
  },
  deleteProviderProfile: (id: string): Promise<import('../main/profiles').ProfileResult> => {
    return ipcRenderer.invoke('profiles:delete', id)
  },
  /** A new name for a profile; nothing else about it changes (US-157). */
  renameProviderProfile: (id: string, name: string): Promise<import('../main/profiles').ProfileResult> => {
    return ipcRenderer.invoke('profiles:rename', { id, name })
  },
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  /** The inputs murmur's capture window sees, by name, and the one in use (US-110). */
  listMics: (): Promise<import('../shared/mic').MicReport> => ipcRenderer.invoke('mics:list'),
  onMicsChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('mics:changed', handler)
    return () => ipcRenderer.removeListener('mics:changed', handler)
  },
  updateSettings: (partial: Partial<Settings>): Promise<Settings> => {
    return ipcRenderer.invoke('settings:update', partial)
  },
  setApiKey: (key: string): Promise<RingStatus> => ipcRenderer.invoke('apikey:set', key),
  clearApiKey: (): Promise<RingStatus> => ipcRenderer.invoke('apikey:clear'),
  getApiKeyStatus: (): Promise<RingStatus> => ipcRenderer.invoke('apikey:status'),
  removeKeyFor: (baseUrl: string): Promise<RingStatus> => ipcRenderer.invoke('apikey:removeFor', baseUrl),
  assignLegacyKey: (): Promise<RingStatus> => ipcRenderer.invoke('apikey:assignLegacy'),
  removeLegacyKey: (): Promise<RingStatus> => ipcRenderer.invoke('apikey:removeLegacy'),
  setPolishKey: (key: string): Promise<KeyStatus> => ipcRenderer.invoke('polishkey:set', key),
  clearPolishKey: (): Promise<KeyStatus> => ipcRenderer.invoke('polishkey:clear'),
  getPolishKeyStatus: (): Promise<KeyStatus> => ipcRenderer.invoke('polishkey:status'),
  testProvider: (): Promise<ProviderTestResult> => ipcRenderer.invoke('provider:test'),
  getUpdateOffer: (): Promise<import('../main/updater-rules').UpdateOffer> => ipcRenderer.invoke('updates:offer'),
  downloadUpdate: (): Promise<import('../main/updater-rules').UpdateOffer> => ipcRenderer.invoke('updates:download'),
  openReleases: (): Promise<void> => ipcRenderer.invoke('updates:openReleases'),
  saveDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('diag:save'),
  openLogFolder: (): Promise<void> => ipcRenderer.invoke('diag:openLogs'),
  testPolishProvider: (): Promise<ProviderTestResult> => ipcRenderer.invoke('provider:testPolish'),
  setKeyFor: (baseUrl: string, key: string): Promise<KeyStatus> => {
    return ipcRenderer.invoke('apikey:setFor', baseUrl, key)
  },
  getKeyStatusFor: (baseUrl: string): Promise<KeyStatus> => ipcRenderer.invoke('apikey:statusFor', baseUrl),
  clearKeyFor: (baseUrl: string): Promise<KeyStatus> => ipcRenderer.invoke('apikey:clearFor', baseUrl),
  testConnectionFor: (baseUrl: string, model?: string): Promise<ProviderTestResult> => {
    return ipcRenderer.invoke('provider:testFor', baseUrl, model)
  },
  testDecisionFor: (baseUrl: string): Promise<ProviderTestResult> => {
    return ipcRenderer.invoke('provider:testDecideFor', baseUrl)
  },
  sortLastNote: (): Promise<NotesStatus> => ipcRenderer.invoke('notes:sortLast'),
  fileHeldLine: (id: number): Promise<NotesStatus> => ipcRenderer.invoke('notes:fileHeld', id),
  skipHeldLine: (id: number): Promise<NotesStatus> => ipcRenderer.invoke('notes:skipHeld', id),
  tickHeldMatch: (id: number): Promise<NotesStatus> => ipcRenderer.invoke('notes:tickHeld', id),
  testNotesReminder: (): Promise<{
    outcome: 'shown' | 'empty' | 'missing' | 'suppressed'
    body: string
    open: number
  }> => ipcRenderer.invoke('notes:testReminder'),
  getCatalog: (): Promise<import('../shared/catalog').ProviderCatalog> => {
    return ipcRenderer.invoke('catalog:get')
  },
  getPermissions: (): Promise<PermissionsStatus> => ipcRenderer.invoke('perms:status'),
  openPermissionPane: (pane: 'microphone' | 'accessibility' | 'input'): Promise<void> => {
    return ipcRenderer.invoke('perms:open', pane)
  },
  getHotkeysStatus: (): Promise<HotkeysStatus> => ipcRenderer.invoke('hotkeys:status'),
  captureHotkey: (
    target: 'dictation' | 'pasteLast' | 'note' | 'transform' = 'dictation'
  ): Promise<{ ok: boolean; binding?: string; reason?: string }> => {
    return ipcRenderer.invoke('hotkeys:capture', target)
  },
  chooseNotesFolder: (): Promise<NotesStatus> => ipcRenderer.invoke('notes:chooseFolder'),
  getNotesStatus: (): Promise<NotesStatus> => ipcRenderer.invoke('notes:status'),
  openTodayNote: (): Promise<'file' | 'folder' | 'none'> => ipcRenderer.invoke('notes:openToday'),
  getLastNote: (): Promise<import('../shared/receipt').LastNote | null> => ipcRenderer.invoke('notes:last'),
  openLastNote: (): Promise<'opened' | 'refused' | 'failed' | 'none'> => ipcRenderer.invoke('notes:openLast'),
  revealLastNote: (): Promise<'shown' | 'refused' | 'none'> => ipcRenderer.invoke('notes:revealLast'),
  onLastNoteChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('notes:lastChanged', handler)
    return () => ipcRenderer.removeListener('notes:lastChanged', handler)
  },
  previewOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:preview'),
  listHistory: (): Promise<SessionEvent[]> => ipcRenderer.invoke('history:list'),
  /** Empties the log; answers with how many entries it removed. */
  clearHistory: (): Promise<number> => ipcRenderer.invoke('history:clear'),
  countHistory: (): Promise<number> => ipcRenderer.invoke('history:count'),
  /** Whether saved words are sealed, for the switch beside Keep history. */
  getHistorySealStatus: (): Promise<import('../shared/history').SealStatus> => ipcRenderer.invoke('history:sealStatus'),
  /** Today's painting and the four weeks before it (US-098). */
  listPaintings: (): Promise<import('../shared/painting').PaintingBook> => ipcRenderer.invoke('paintings:list'),
  onHistoryAppended: (cb: (event: SessionEvent) => void): (() => void) => {
    const handler = (_e: unknown, event: SessionEvent): void => cb(event)
    ipcRenderer.on('history:appended', handler)
    // The home view mounts and unmounts with its tab: give it a real
    // unsubscribe so listeners never pile up across switches.
    return () => ipcRenderer.removeListener('history:appended', handler)
  },
  /** An existing entry changed, such as a held take's words coming back. */
  onHistoryChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('history:changed', handler)
    return () => ipcRenderer.removeListener('history:changed', handler)
  },
  listWaitingTakes: (): Promise<import('../main/transcribe/recovery').WaitingTake[]> => {
    return ipcRenderer.invoke('recovery:list')
  },
  retryTake: (id: string): Promise<import('../main/retry').RetryResult> => ipcRenderer.invoke('recovery:retry', id),
  discardTake: (id: string): Promise<import('../main/transcribe/recovery').WaitingTake[]> => {
    return ipcRenderer.invoke('recovery:discard', id)
  },
  onWaitingTakesChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('recovery:changed', handler)
    return () => ipcRenderer.removeListener('recovery:changed', handler)
  },
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', text),
  getKeepImpact: (retentionDays: number): Promise<{ takes: number; recordings: number }> =>
    ipcRenderer.invoke('history:keepImpact', retentionDays),
  /** Null opens a blank message, for a report copied by hand. */
  openReportMail: (body: string | null): Promise<void> => ipcRenderer.invoke('report:mail', body),
  getAnalytics: (): Promise<import('../shared/analytics').AnalyticsSummary> => {
    return ipcRenderer.invoke('analytics:summary')
  },
  getRecentDays: (): Promise<Array<{ day: string; words: number; sessions: number }>> => {
    return ipcRenderer.invoke('analytics:days')
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
  saveShareCard: (pngDataUrl: string, kind: 'belt' | 'day' | 'week' = 'belt', day?: string): Promise<boolean> => {
    return ipcRenderer.invoke('sharecard:save', pngDataUrl, kind, day)
  },
  /** Settings changed from outside this window, such as Hide words in the
   *  tray menu (US-148): the window takes the new settings as they are. */
  onSettingsPushed: (cb: (settings: Settings) => void): (() => void) => {
    const handler = (_e: unknown, settings: Settings): void => cb(settings)
    ipcRenderer.on('settings:pushed', handler)
    return () => ipcRenderer.removeListener('settings:pushed', handler)
  },
  onNavigate: (cb: (page: string) => void): (() => void) => {
    const handler = (_e: unknown, page: string): void => cb(page)
    ipcRenderer.on('nav:goto', handler)
    return () => ipcRenderer.removeListener('nav:goto', handler)
  }
}

export type SettingsApi = typeof api

contextBridge.exposeInMainWorld('murmur', api)
