// SPDX-License-Identifier: GPL-3.0-only
// Wires the settings store and key store to Electron: userData paths,
// safeStorage cipher, IPC handlers, and smoke checks.
import { app, ipcMain, safeStorage } from 'electron'
import { IpcChannels } from '../../shared/ipc'
import type { Settings } from '../../shared/settings'
import { registerSmokeCheck } from '../smoke'
import { type KeyCipher, KeyStore } from './keystore'
import { SettingsStore } from './store'

let settingsStore: SettingsStore | null = null
let keyStore: KeyStore | null = null

type SettingsListener = (settings: Settings) => void
const listeners = new Set<SettingsListener>()

/** Subscribe to settings updates. Fires after every successful save. */
export function onSettingsChanged(listener: SettingsListener): void {
  listeners.add(listener)
}

function notifySettingsChanged(settings: Settings): void {
  for (const listener of listeners) listener(settings)
}

/** Update settings from main-process code, notifying subscribers. */
export function updateSettings(partial: unknown): Settings {
  if (!settingsStore) throw new Error('settings not initialized')
  const updated = settingsStore.update(partial)
  notifySettingsChanged(updated)
  return updated
}

export function initSettings(): void {
  const dir = app.getPath('userData')
  settingsStore = new SettingsStore(dir)

  const cipher: KeyCipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf)
  }
  keyStore = new KeyStore(dir, cipher)

  // Migrate decommissioned Groq model ids (shut down 2026-08-16, per
  // console.groq.com/docs/deprecations) to their documented replacements
  // so existing profiles get a working cleanup pass again.
  const MODEL_MIGRATIONS: Record<string, string> = {
    'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b'
  }
  const storedLlm = settingsStore.get().provider.llmModel
  const replacement = MODEL_MIGRATIONS[storedLlm]
  if (replacement) settingsStore.update({ provider: { llmModel: replacement } })

  ipcMain.handle(IpcChannels.settingsGet, () => settingsStore?.get())
  ipcMain.handle(IpcChannels.settingsUpdate, (_event, partial: unknown) => {
    return updateSettings(partial)
  })
  ipcMain.handle(IpcChannels.apiKeySet, (_event, key: unknown) => {
    keyStore?.set(String(key))
    return keyStore?.status()
  })
  ipcMain.handle(IpcChannels.apiKeyClear, () => {
    keyStore?.clear()
    return keyStore?.status()
  })
  ipcMain.handle(IpcChannels.apiKeyStatus, () => keyStore?.status())

  // Connection test: a cheap authorized GET against the provider's model
  // list. Proves base URL and key together without spending audio.
  ipcMain.handle('provider:test', async () => {
    const key = keyStore?.get()
    if (!key) return { ok: false, detail: 'no key saved yet' }
    const baseUrl = settingsStore?.get().provider.baseUrl.replace(/\/$/, '')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal
      })
      if (response.status === 401 || response.status === 403) {
        return { ok: false, detail: 'key rejected (401)' }
      }
      return response.ok
        ? { ok: true, detail: 'connected' }
        : { ok: false, detail: `http ${response.status}` }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      return { ok: false, detail: aborted ? 'timed out' : 'network error' }
    } finally {
      clearTimeout(timer)
    }
  })

  registerSmokeCheck('settings', () => {
    if (!settingsStore) return false
    const before = settingsStore.get()
    const updated = settingsStore.update({ sounds: { volume: before.sounds.volume } })
    return updated.provider.baseUrl.length > 0
  })

  registerSmokeCheck('secureKey', () => {
    if (!keyStore) return false
    if (!safeStorage.isEncryptionAvailable()) return false
    const probe = 'smoke-probe-key-value-1234567890'
    keyStore.set(probe)
    const roundTrip = keyStore.get() === probe
    const masked = keyStore.status().masked
    keyStore.clear()
    return roundTrip && masked === 'smok…7890' && !keyStore.status().present
  })
}

/** Main-process access for later subsystems. Never expose to renderers. */
export function getApiKey(): string | null {
  return keyStore?.get() ?? null
}

export function getSettings(): Settings {
  if (!settingsStore) throw new Error('settings not initialized')
  return settingsStore.get()
}
