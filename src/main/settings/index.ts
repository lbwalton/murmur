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

export function initSettings(): void {
  const dir = app.getPath('userData')
  settingsStore = new SettingsStore(dir)

  const cipher: KeyCipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf)
  }
  keyStore = new KeyStore(dir, cipher)

  ipcMain.handle(IpcChannels.settingsGet, () => settingsStore?.get())
  ipcMain.handle(IpcChannels.settingsUpdate, (_event, partial: unknown) => {
    return settingsStore?.update(partial)
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
