// SPDX-License-Identifier: GPL-3.0-only
// Provider profiles (murmur Pro): save the current provider setup
// (endpoint and models) under a name and switch between setups in one
// click. Since the key ring (US-049) keys every credential by its base
// URL, profiles no longer carry keys at all: applying one switches the
// base URL and the ring supplies that provider's key automatically.
// Pre-ring profiles that shipped with their own key-<id>.enc blob get
// that key folded into the ring on first apply, decrypted only through
// the same store mechanism every key read uses. The free single
// provider setup is untouched; profiles are additive convenience.
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, safeStorage } from 'electron'
import { getSettings, ringHasKeyFor, ringSetKey, updateSettings } from './settings'
import { KeyStore } from './settings/keystore'
import { readLicenseStatus } from './license'
import { registerSmokeCheck } from './smoke'

export type ProfileResult =
  | { ok: true; settings: ReturnType<typeof getSettings> }
  | { ok: false; reason: 'pro' | 'not-found' | 'bad-name' }

// Ids come from randomUUID().slice(0, 8): exactly eight hex chars.
// Enforced again before any id touches a file path, so even an entry
// smuggled into settings by other means cannot traverse directories.
const PROFILE_ID = /^[0-9a-f]{8}$/

function keyFile(profileId: string): string {
  if (!PROFILE_ID.test(profileId)) throw new Error('invalid profile id')
  return join(app.getPath('userData'), `key-${profileId}.enc`)
}

export function initProfiles(): void {
  ipcMain.handle('profiles:save', (_event, name: unknown): ProfileResult => {
    if (!readLicenseStatus().pro) return { ok: false, reason: 'pro' }
    if (typeof name !== 'string' || name.trim().length === 0) return { ok: false, reason: 'bad-name' }
    const current = getSettings().provider
    const id = randomUUID().slice(0, 8)
    const profile = {
      id,
      name: name.trim().slice(0, 40),
      baseUrl: current.baseUrl,
      sttModel: current.sttModel,
      llmModel: current.llmModel
    }
    // No key snapshot: the ring already holds this base URL's key and
    // will still hold it whenever this profile is applied.
    const settings = updateSettings({ provider: { profiles: [...current.profiles, profile] } })
    return { ok: true, settings }
  })

  ipcMain.handle('profiles:apply', (_event, id: unknown): ProfileResult => {
    if (!readLicenseStatus().pro) return { ok: false, reason: 'pro' }
    const profile = getSettings().provider.profiles.find((p) => p.id === id)
    if (!profile || !PROFILE_ID.test(profile.id)) return { ok: false, reason: 'not-found' }
    // A pre-ring profile may still carry its own key blob: fold it
    // into the ring once (never over a key already there), then the
    // blob retires. The blob is deleted ONLY when the ring truly holds
    // a key for this base URL afterward; a failed decrypt (locked
    // keychain, restored profile) leaves it in place for the next
    // apply, and a failed fold never blocks the settings switch.
    if (existsSync(keyFile(profile.id))) {
      try {
        if (!ringHasKeyFor(profile.baseUrl)) {
          const cipher = {
            available: () => safeStorage.isEncryptionAvailable(),
            encrypt: (plain: string) => safeStorage.encryptString(plain),
            decrypt: (buf: Buffer) => safeStorage.decryptString(buf)
          }
          const legacyProfileKey = new KeyStore(app.getPath('userData'), cipher, `key-${profile.id}.enc`).get()
          if (legacyProfileKey) ringSetKey(profile.baseUrl, legacyProfileKey)
        }
        if (ringHasKeyFor(profile.baseUrl)) rmSync(keyFile(profile.id), { force: true })
      } catch (error) {
        console.error('[murmur] profile key fold failed; blob kept for retry:', error)
      }
    }
    const settings = updateSettings({
      provider: { baseUrl: profile.baseUrl, sttModel: profile.sttModel, llmModel: profile.llmModel }
    })
    return { ok: true, settings }
  })

  ipcMain.handle('profiles:delete', (_event, id: unknown): ProfileResult => {
    if (!readLicenseStatus().pro) return { ok: false, reason: 'pro' }
    const provider = getSettings().provider
    const profile = provider.profiles.find((p) => p.id === id)
    if (!profile || !PROFILE_ID.test(profile.id)) return { ok: false, reason: 'not-found' }
    rmSync(keyFile(profile.id), { force: true })
    const settings = updateSettings({
      provider: { profiles: provider.profiles.filter((p) => p.id !== id) }
    })
    return { ok: true, settings }
  })

  registerSmokeCheck('profilesGate', () => {
    // Without a license the gate must hold: the smoke profile has no
    // key, so status is non-pro and no profiles can exist.
    return readLicenseStatus().pro === false && getSettings().provider.profiles.length === 0
  })
}
