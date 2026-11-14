// SPDX-License-Identifier: GPL-3.0-only
// Provider profiles (murmur Pro): save the current setup under a name and
// switch between setups in one click. Since US-154 a profile holds the
// whole setup (speech, cleanup, and the notes sorting and Transform
// connections; shared/profiles.ts says what), and the one applied or
// saved last is marked active so the window can say when it changed. Since the key ring (US-049) keys every credential by its base
// URL, profiles no longer carry keys at all: applying one switches the
// base URL and the ring supplies that provider's key automatically.
// Pre-ring profiles that shipped with their own key-<id>.enc blob get
// that key folded into the ring on first apply, decrypted only through
// the same store mechanism every key read uses. The free single
// provider setup is untouched; profiles are additive convenience.
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { ipc } from './ipc'
import { MAX_NAME_CHARS } from './ipc-rules'
import { isFullProfile, profileMatches, profilePatch, snapshotProfile } from '../shared/profiles'
import { getSettings, ringClearKey, ringHasKeyFor, ringSetKey, updateSettings } from './settings'
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

const validName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_NAME_CHARS

// The 5 actions, past the Pro gate. The handlers gate them; the smoke
// round trip calls them directly, since the real signing key never
// exists in smoke and no test key may ever unlock Pro.
function saveProfile(name: string): ProfileResult {
  const current = getSettings()
  const profile = snapshotProfile(current, randomUUID().slice(0, 8), name.trim().slice(0, 40))
  // No key snapshot: the ring holds each base URL's key and will still
  // hold it whenever this profile is applied.
  const settings = updateSettings({
    provider: { profiles: [...current.provider.profiles, profile], activeProfile: profile.id }
  })
  return { ok: true, settings }
}

function resaveProfile(id: unknown): ProfileResult {
  const current = getSettings()
  const found = current.provider.profiles.find((p) => p.id === id)
  if (!found || !PROFILE_ID.test(found.id)) return { ok: false, reason: 'not-found' }
  const profile = snapshotProfile(current, found.id, found.name)
  const settings = updateSettings({
    provider: {
      profiles: current.provider.profiles.map((p) => (p.id === found.id ? profile : p)),
      activeProfile: found.id
    }
  })
  return { ok: true, settings }
}

function applyProfile(id: unknown): ProfileResult {
  const profile = getSettings().provider.profiles.find((p) => p.id === id)
  if (!profile || !PROFILE_ID.test(profile.id)) return { ok: false, reason: 'not-found' }
  foldLegacyKey(profile.id, profile.baseUrl)
  return { ok: true, settings: updateSettings(profilePatch(profile)) }
}

// A new name only (US-157): the setup it holds, its keys, and whether it
// is the active one all stay as they are.
function renameProfile(id: unknown, name: string): ProfileResult {
  const current = getSettings()
  const found = current.provider.profiles.find((p) => p.id === id)
  if (!found || !PROFILE_ID.test(found.id)) return { ok: false, reason: 'not-found' }
  const settings = updateSettings({
    provider: {
      profiles: current.provider.profiles.map((p) => (p.id === found.id ? { ...p, name: name.trim().slice(0, 40) } : p))
    }
  })
  return { ok: true, settings }
}

const renameAction = ({ id, name }: { id: unknown; name: unknown }): ProfileResult =>
  validName(name) ? renameProfile(id, name) : { ok: false, reason: 'bad-name' }

function deleteProfile(id: unknown): ProfileResult {
  const provider = getSettings().provider
  const profile = provider.profiles.find((p) => p.id === id)
  if (!profile || !PROFILE_ID.test(profile.id)) return { ok: false, reason: 'not-found' }
  rmSync(keyFile(profile.id), { force: true })
  const settings = updateSettings({
    provider: {
      profiles: provider.profiles.filter((p) => p.id !== id),
      activeProfile: provider.activeProfile === id ? '' : provider.activeProfile
    }
  })
  return { ok: true, settings }
}

// A pre-ring profile may still carry its own key blob: fold it into the
// ring once (never over a key already there), then the blob retires.
// The blob is deleted ONLY when the ring truly holds a key for this base
// URL afterward; a failed decrypt (locked keychain, restored profile)
// leaves it in place for the next apply, and a failed fold never blocks
// the settings switch.
function foldLegacyKey(profileId: string, baseUrl: string): void {
  if (!existsSync(keyFile(profileId))) return
  try {
    if (!ringHasKeyFor(baseUrl)) {
      const cipher = {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (plain: string) => safeStorage.encryptString(plain),
        decrypt: (buf: Buffer) => safeStorage.decryptString(buf)
      }
      const legacyProfileKey = new KeyStore(app.getPath('userData'), cipher, `key-${profileId}.enc`).get()
      if (legacyProfileKey) ringSetKey(baseUrl, legacyProfileKey)
    }
    if (ringHasKeyFor(baseUrl)) rmSync(keyFile(profileId), { force: true })
  } catch (error) {
    console.error('[murmur] profile key fold failed; blob kept for retry:', error)
  }
}

const gated =
  <A>(action: (arg: A) => ProfileResult) =>
  (_event: unknown, arg: A): ProfileResult =>
    readLicenseStatus().pro ? action(arg) : { ok: false, reason: 'pro' }

export function initProfiles(): void {
  ipc.handle(
    'profiles:save',
    gated((name: unknown) => (validName(name) ? saveProfile(name) : { ok: false, reason: 'bad-name' }))
  )
  ipc.handle('profiles:resave', gated(resaveProfile))
  ipc.handle('profiles:apply', gated(applyProfile))
  ipc.handle('profiles:delete', gated(deleteProfile))
  ipc.handle(
    'profiles:rename',
    gated((arg: unknown) => {
      const { id, name } = (typeof arg === 'object' && arg !== null ? arg : {}) as { id?: unknown; name?: unknown }
      return renameAction({ id, name })
    })
  )

  registerSmokeCheck('profilesGate', () => {
    // Without a license the gate holds: the smoke profile has no Pro
    // key, so every action answers pro and changes nothing.
    const before = getSettings()
    const refused = [
      gated((name: unknown) => (validName(name) ? saveProfile(name) : { ok: false, reason: 'bad-name' }))(null, 'x'),
      gated(applyProfile)(null, 'abcd1234'),
      gated(resaveProfile)(null, 'abcd1234'),
      gated(deleteProfile)(null, 'abcd1234'),
      gated(renameAction)(null, { id: 'abcd1234', name: 'x' })
    ].every((r) => !r.ok && r.reason === 'pro')
    const held = readLicenseStatus().pro === false && getSettings().provider.profiles.length === before.provider.profiles.length
    return refused && held && fullRoundTrip()
  })
}

// The whole setup goes into a profile and comes back out of it (US-154):
// save, change everything it holds, apply, match; an old speech only
// profile applies speech and leaves cleanup; resave makes it whole; the
// smoke profile's settings are put back after.
function fullRoundTrip(): boolean {
  const start = getSettings()
  const restore = (): void => {
    updateSettings({
      provider: { ...start.provider },
      polish: { ...start.polish },
      notes: { connection: { ...start.notes.connection } },
      transform: { connection: { ...start.transform.connection } }
    })
  }
  try {
    updateSettings({
      provider: { baseUrl: 'https://smoke-speech.example/v1', sttModel: 'smoke-stt', llmModel: 'smoke-llm' },
      polish: { enabled: true, baseUrl: 'https://smoke-cleanup.example/v1', llmModel: 'smoke-luna' },
      notes: { connection: { enabled: true, baseUrl: 'https://smoke-sort.example/v1', llmModel: 'smoke-sort', protocol: 'chat', threshold: 0.6 } },
      transform: { connection: { enabled: true, baseUrl: 'https://smoke-edit.example/v1', llmModel: 'smoke-edit' } }
    })
    // A real ring key for the cleanup address, so the check below can
    // prove the profile holds no key, not just that none was around.
    ringSetKey('https://smoke-cleanup.example/v1', 'smoke-ring-profile-key-0000')
    const saved = saveProfile('smoke full')
    if (!saved.ok) return false
    const profile = saved.settings.provider.profiles.find((p) => p.id === saved.settings.provider.activeProfile)
    if (!profile || !isFullProfile(profile) || JSON.stringify(profile).includes('smoke-ring-profile-key')) return false
    updateSettings({
      provider: { baseUrl: 'https://smoke-other.example/v1', sttModel: 'other', llmModel: 'other' },
      polish: { enabled: false, baseUrl: '', llmModel: '' },
      notes: { connection: { enabled: false, protocol: 'decide', threshold: 0.9 } },
      transform: { connection: { enabled: false, baseUrl: '', llmModel: '' } }
    })
    const changed = !profileMatches(profile, getSettings())
    const applied = applyProfile(profile.id)
    const back = applied.ok && profileMatches(profile, applied.settings) && applied.settings.polish.llmModel === 'smoke-luna'
    // An old profile, as a pre-US-154 build saved it.
    const old = { id: 'aaaa0000', name: 'old', baseUrl: 'https://smoke-old.example/v1', sttModel: 'old-stt', llmModel: 'old-llm' }
    updateSettings({ provider: { profiles: [...getSettings().provider.profiles, old] } })
    const oldApplied = applyProfile(old.id)
    const speechOnly =
      oldApplied.ok &&
      oldApplied.settings.provider.sttModel === 'old-stt' &&
      oldApplied.settings.polish.llmModel === 'smoke-luna' &&
      oldApplied.settings.provider.activeProfile === old.id
    const resaved = resaveProfile(old.id)
    const whole = resaved.ok && resaved.settings.provider.profiles.some((p) => p.id === old.id && isFullProfile(p))
    // A rename changes the name and nothing else (US-157).
    const before = getSettings().provider.profiles.find((p) => p.id === old.id)
    const renamed = renameAction({ id: old.id, name: '  smoke renamed  ' })
    const after = renamed.ok ? renamed.settings.provider.profiles.find((p) => p.id === old.id) : undefined
    const nameOnly =
      before !== undefined &&
      after?.name === 'smoke renamed' &&
      JSON.stringify({ ...after, name: before.name }) === JSON.stringify(before) &&
      renamed.ok &&
      renamed.settings.provider.activeProfile === old.id &&
      [renameAction({ id: old.id, name: '   ' }), renameAction({ id: 'ffff9999', name: 'x' })].every((r) => !r.ok)
    const removed = [deleteProfile(profile.id), deleteProfile(old.id)].every((r) => r.ok)
    const gone = getSettings().provider.profiles.length === start.provider.profiles.length && getSettings().provider.activeProfile === ''
    return changed && back && speechOnly && whole && nameOnly && removed && gone
  } finally {
    ringClearKey('https://smoke-cleanup.example/v1')
    restore()
  }
}
