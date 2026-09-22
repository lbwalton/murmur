// SPDX-License-Identifier: GPL-3.0-only
// Wires the settings store and the key ring to Electron: userData
// paths, safeStorage cipher, IPC handlers, and smoke checks. Keys live
// one per provider base URL; the legacy single-slot files migrate into
// the ring at boot.
import { app, ipcMain, safeStorage } from 'electron'
import bundledCatalog from '../../../shared/provider-catalog.json'
import { validateCatalog } from '../../shared/catalog'
import { IpcChannels } from '../../shared/ipc'
import type { Settings } from '../../shared/settings'
import { registerSmokeCheck } from '../smoke'
import { type KeyCipher, KeyStore } from './keystore'
import { KeyRing, type RingStatus, migrateLegacyKeys } from './keyring'
import { SettingsStore } from './store'

let settingsStore: SettingsStore | null = null
let ring: KeyRing | null = null
let legacyStore: KeyStore | null = null
let polishLegacyStore: KeyStore | null = null

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

function ringStatus(): RingStatus {
  const settings = settingsStore?.get()
  return {
    active: ring?.status(settings?.provider.baseUrl ?? '') ?? { present: false, masked: null },
    list: ring?.list() ?? [],
    legacy: legacyStore?.status() ?? { present: false, masked: null }
  }
}

export function initSettings(): void {
  const dir = app.getPath('userData')
  settingsStore = new SettingsStore(dir)

  const cipher: KeyCipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (buf) => safeStorage.decryptString(buf)
  }
  ring = new KeyRing(dir, cipher)
  legacyStore = new KeyStore(dir, cipher)
  polishLegacyStore = new KeyStore(dir, cipher, 'polish-key.enc')

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

  // Legacy single-slot keys move into the ring, assigned by their own
  // full prefix when unambiguous (the bundled catalog is the authority
  // for prefixes; a refreshed catalog never runs this path again).
  const catalog = validateCatalog(bundledCatalog)
  const stored = settingsStore.get()
  migrateLegacyKeys({
    legacy: legacyStore,
    polishLegacy: polishLegacyStore,
    ring,
    provenanceBaseUrl: stored.provider.keySavedForBaseUrl,
    polishBaseUrl: stored.polish.baseUrl,
    prefixOwners: (catalog?.providers ?? [])
      .filter((p) => (p.keyPrefixes ?? []).length > 0)
      .map((p) => ({ baseUrl: p.baseUrl, prefixes: p.keyPrefixes ?? [] }))
  })

  ipcMain.handle(IpcChannels.settingsGet, () => settingsStore?.get())
  ipcMain.handle(IpcChannels.settingsUpdate, (_event, partial: unknown) => {
    // provider.profiles is written ONLY by the dedicated Pro-gated
    // profiles handlers; the generic channel must never carry it, or a
    // renderer could inject entries whose ids feed file paths.
    if (partial && typeof partial === 'object') {
      const p = partial as { provider?: { profiles?: unknown } }
      if (p.provider && typeof p.provider === 'object') delete p.provider.profiles
    }
    return updateSettings(partial)
  })

  // The ring speaks for the ACTIVE provider: saving files the key
  // under the current base URL, clearing removes only that one.
  ipcMain.handle(IpcChannels.apiKeySet, (_event, key: unknown) => {
    const baseUrl = settingsStore?.get().provider.baseUrl ?? ''
    if (baseUrl !== '') ring?.set(baseUrl, String(key))
    return ringStatus()
  })
  ipcMain.handle(IpcChannels.apiKeyClear, () => {
    ring?.clear(settingsStore?.get().provider.baseUrl ?? '')
    return ringStatus()
  })
  ipcMain.handle(IpcChannels.apiKeyStatus, () => ringStatus())
  ipcMain.handle('apikey:removeFor', (_event, baseUrl: unknown) => {
    if (typeof baseUrl === 'string' && baseUrl !== '') ring?.clear(baseUrl)
    return ringStatus()
  })
  // The unassigned pre-ring key: the user assigns it to whatever
  // provider is active, or removes it entirely.
  ipcMain.handle('apikey:assignLegacy', () => {
    const key = legacyStore?.get()
    const baseUrl = settingsStore?.get().provider.baseUrl ?? ''
    // Assigning must never overwrite a provider's existing key: that
    // is the exact silent replacement this story exists to end
    // (review gate finding). The UI hides Assign in that state; this
    // guard holds even against a misbehaving renderer.
    if (key && baseUrl !== '' && !ring?.status(baseUrl).present) {
      ring?.set(baseUrl, key)
      legacyStore?.clear()
    }
    return ringStatus()
  })
  ipcMain.handle('apikey:removeLegacy', () => {
    legacyStore?.clear()
    return ringStatus()
  })

  // The cleanup connection's key rides the same ring, keyed by the
  // cleanup base URL; a not-yet-migrated polish key still answers.
  ipcMain.handle('polishkey:set', (_event, key: unknown) => {
    const baseUrl = settingsStore?.get().polish.baseUrl ?? ''
    if (baseUrl !== '') ring?.set(baseUrl, String(key))
    return polishKeyStatus()
  })
  ipcMain.handle('polishkey:clear', () => {
    const current = settingsStore?.get()
    const polishUrl = current?.polish.baseUrl ?? ''
    const strip = (u: string): string => u.replace(/\/$/, '')
    // A shared base URL means ONE ring key serving both connections;
    // the speech surface owns it, so the cleanup Remove must never
    // delete it out from under dictation (review gate finding).
    const shared = polishUrl !== '' && strip(polishUrl) === strip(current?.provider.baseUrl ?? '')
    if (polishUrl !== '' && !shared) ring?.clear(polishUrl)
    polishLegacyStore?.clear()
    return polishKeyStatus()
  })
  ipcMain.handle('polishkey:status', () => polishKeyStatus())

  function polishKeyStatus(): { present: boolean; masked: string | null } {
    const baseUrl = settingsStore?.get().polish.baseUrl ?? ''
    const inRing = ring?.status(baseUrl)
    if (inRing?.present) return inRing
    return polishLegacyStore?.status() ?? { present: false, masked: null }
  }

  // Connection test: a cheap authorized GET against the provider's model
  // list. Proves base URL and key together without spending audio.
  const probeConnection = async (
    baseUrl: string,
    key: string | null
  ): Promise<{ ok: boolean; detail: string }> => {
    if (!key) return { ok: false, detail: 'no key saved yet' }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal
      })
      if (response.status === 401 || response.status === 403) {
        // The real status matters: 403 can mean a blocked network or
        // account state, not a wrong key.
        return { ok: false, detail: `key rejected (http ${response.status})` }
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
  }
  ipcMain.handle('provider:test', async () => {
    return probeConnection(settingsStore?.get().provider.baseUrl ?? '', getApiKey())
  })
  ipcMain.handle('provider:testPolish', async () => {
    const polish = settingsStore?.get().polish
    if (!polish?.baseUrl) return { ok: false, detail: 'no cleanup base URL set' }
    return probeConnection(polish.baseUrl, getPolishApiKey())
  })

  // Generic slot access for connections that are not the speech or
  // cleanup slot (the sort connection, US-051): the ring keyed by base
  // URL, and a clear that never deletes a key another slot shares.
  ipcMain.handle('apikey:setFor', (_event, baseUrl: unknown, key: unknown) => {
    if (typeof baseUrl === 'string' && baseUrl !== '') ring?.set(baseUrl, String(key))
    return keyStatusFor(baseUrl)
  })
  ipcMain.handle('apikey:statusFor', (_event, baseUrl: unknown) => keyStatusFor(baseUrl))
  ipcMain.handle('apikey:clearFor', (_event, baseUrl: unknown) => {
    if (typeof baseUrl === 'string' && baseUrl !== '' && !sharedSlotUrl(baseUrl)) ring?.clear(baseUrl)
    return keyStatusFor(baseUrl)
  })
  ipcMain.handle('provider:testFor', async (_event, baseUrl: unknown) => {
    if (typeof baseUrl !== 'string' || baseUrl === '') return { ok: false, detail: 'no base URL set' }
    return probeConnection(baseUrl, ring?.get(baseUrl) ?? null)
  })

  function keyStatusFor(baseUrl: unknown): { present: boolean; masked: string | null } {
    if (typeof baseUrl !== 'string' || baseUrl === '') return { present: false, masked: null }
    return ring?.status(baseUrl) ?? { present: false, masked: null }
  }

  // The speech slot and an enabled cleanup slot own their keys; a
  // third slot pointed at the same base URL rides them and must never
  // remove them. A cleanup URL left behind with cleanup on Same owns
  // nothing (review gate 2026-09-20).
  function sharedSlotUrl(baseUrl: string): boolean {
    const strip = (u: string): string => u.replace(/\/$/, '')
    const current = settingsStore?.get()
    const owners = [
      current?.provider.baseUrl ?? '',
      current?.polish.enabled ? (current.polish.baseUrl ?? '') : ''
    ].filter((u) => u !== '')
    return owners.some((u) => strip(u) === strip(baseUrl))
  }

  registerSmokeCheck('settings', () => {
    if (!settingsStore) return false
    const before = settingsStore.get()
    const updated = settingsStore.update({ sounds: { volume: before.sounds.volume } })
    return updated.provider.baseUrl.length > 0
  })

  registerSmokeCheck('secureKey', () => {
    if (!ring || !safeStorage.isEncryptionAvailable()) return false
    // Two providers round trip through the real cipher, list correctly,
    // and clear without touching each other.
    const a = 'https://smoke-a.example/v1'
    const b = 'https://smoke-b.example/v1'
    ring.set(a, 'smoke-ring-a-1234567890')
    ring.set(b, 'smoke-ring-b-0987654321')
    const isolated = ring.get(a) === 'smoke-ring-a-1234567890' && ring.get(b) === 'smoke-ring-b-0987654321'
    const listed = ring.list().filter((e) => e.baseUrl.startsWith('https://smoke-')).length === 2
    const maskedOk = ring.status(a).masked === 'smok…7890'
    ring.clear(a)
    const cleared = !ring.status(a).present && ring.get(b) !== null
    ring.clear(b)
    const emptied = ring.list().every((e) => !e.baseUrl.startsWith('https://smoke-'))
    return isolated && listed && maskedOk && cleared && emptied
  })
}

/** The active provider's key: ring first, then the not-yet-assigned
 *  legacy key so dictation keeps working until the user resolves it.
 *  Never expose to renderers. */
export function getApiKey(): string | null {
  const baseUrl = settingsStore?.get().provider.baseUrl ?? ''
  return ring?.get(baseUrl) ?? legacyStore?.get() ?? null
}

/** The key saved under any base URL, or null. Never expose to renderers. */
export function getApiKeyFor(baseUrl: string): string | null {
  return baseUrl !== '' ? (ring?.get(baseUrl) ?? null) : null
}

/** The cleanup connection's key, or null when none is saved. */
export function getPolishApiKey(): string | null {
  const baseUrl = settingsStore?.get().polish.baseUrl ?? ''
  return ring?.get(baseUrl) ?? polishLegacyStore?.get() ?? null
}

export function getSettings(): Settings {
  if (!settingsStore) throw new Error('settings not initialized')
  return settingsStore.get()
}

/** Base URLs holding saved keys, for the diagnostics report. Base
 *  URLs only; never key material. */
export function listSavedKeyBaseUrls(): string[] {
  return (ring?.list() ?? []).map((entry) => entry.baseUrl)
}

/** Whether the ring holds a key for a base URL (for profile apply). */
export function ringHasKeyFor(baseUrl: string): boolean {
  return ring?.status(baseUrl).present ?? false
}

/** File a key under a base URL (pre-ring profile blob migration). */
export function ringSetKey(baseUrl: string, key: string): void {
  if (baseUrl !== '') ring?.set(baseUrl, key)
}

/** Remove the key under a base URL (smoke cleanup). */
export function ringClearKey(baseUrl: string): void {
  if (baseUrl !== '') ring?.clear(baseUrl)
}
