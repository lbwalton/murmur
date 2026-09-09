// SPDX-License-Identifier: GPL-3.0-only
// Provider profiles (murmur Pro): save the current provider setup
// (endpoint, models, and the matching API key) under a name and switch
// between setups in one click. Keys move as ENCRYPTED FILE COPIES of
// the safeStorage blob: plaintext never surfaces here. The free single
// provider setup is untouched; profiles are additive convenience.
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { getSettings, updateSettings } from './settings'
import { readLicenseStatus } from './license'
import { registerSmokeCheck } from './smoke'

export type ProfileResult =
  | { ok: true; settings: ReturnType<typeof getSettings> }
  | { ok: false; reason: 'pro' | 'not-found' | 'bad-name' }

// Ids come from randomUUID().slice(0, 8): exactly eight hex chars.
// Enforced again before any id touches a file path, so even an entry
// smuggled into settings by other means cannot traverse directories.
const PROFILE_ID = /^[0-9a-f]{8}$/

function keyFile(profileId?: string): string {
  const dir = app.getPath('userData')
  if (profileId && !PROFILE_ID.test(profileId)) throw new Error('invalid profile id')
  return profileId ? join(dir, `key-${profileId}.enc`) : join(dir, 'key.enc')
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
    if (existsSync(keyFile())) copyFileSync(keyFile(), keyFile(id))
    const settings = updateSettings({ provider: { profiles: [...current.profiles, profile] } })
    return { ok: true, settings }
  })

  ipcMain.handle('profiles:apply', (_event, id: unknown): ProfileResult => {
    if (!readLicenseStatus().pro) return { ok: false, reason: 'pro' }
    const profile = getSettings().provider.profiles.find((p) => p.id === id)
    if (!profile || !PROFILE_ID.test(profile.id)) return { ok: false, reason: 'not-found' }
    // The key travels with the profile when it has one; otherwise the
    // active key stays, since users often share one key across setups.
    if (existsSync(keyFile(profile.id))) copyFileSync(keyFile(profile.id), keyFile())
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
