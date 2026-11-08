// SPDX-License-Identifier: GPL-3.0-only
// Provider profiles, the pure half (US-154). A profile holds the whole
// setup: speech, cleanup, and the notes sorting and Transform
// connections, never a key. main/profiles.ts saves and applies them
// through these functions, and the window uses the same ones to say what
// a profile runs, whether the setup changed since, and what each saved
// key is for, so what is shown and what runs come from one place.
import { type ProviderCatalog, providerForBaseUrl } from './catalog'
import type { ProfileConnection, ProviderProfile, Settings } from './settings'

const strip = (url: string): string => url.trim().replace(/\/+$/, '')
const sameUrl = (a: string, b: string): boolean => a !== '' && b !== '' && strip(a) === strip(b)

/** A profile saved before US-154 holds speech only. */
export function isFullProfile(profile: ProviderProfile): boolean {
  return profile.polish !== undefined && profile.sort !== undefined && profile.transform !== undefined
}

const connection = (c: ProfileConnection): ProfileConnection => ({
  enabled: c.enabled,
  baseUrl: c.baseUrl,
  llmModel: c.llmModel
})

/** The setup running now, under a name. Keys stay in the key ring. */
export function snapshotProfile(settings: Settings, id: string, name: string): ProviderProfile {
  const sort = settings.notes.connection
  return {
    id,
    name,
    baseUrl: settings.provider.baseUrl,
    sttModel: settings.provider.sttModel,
    llmModel: settings.provider.llmModel,
    polish: connection(settings.polish),
    sort: { ...connection(sort), protocol: sort.protocol, threshold: sort.threshold },
    transform: connection(settings.transform.connection)
  }
}

/** The settings change that applies a profile and marks it active. A
 *  speech only profile changes speech only, as profiles always did. */
export function profilePatch(profile: ProviderProfile): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    provider: {
      baseUrl: profile.baseUrl,
      sttModel: profile.sttModel,
      llmModel: profile.llmModel,
      activeProfile: profile.id
    }
  }
  if (profile.polish && profile.sort && profile.transform) {
    patch.polish = connection(profile.polish)
    patch.notes = { connection: { ...profile.sort } }
    patch.transform = { connection: connection(profile.transform) }
  }
  return patch
}

const connectionMatches = (a: ProfileConnection, b: ProfileConnection): boolean =>
  a.enabled === b.enabled && strip(a.baseUrl) === strip(b.baseUrl) && a.llmModel === b.llmModel

/** Whether the setup running now still holds everything the profile
 *  saved. A speech only profile is compared on speech alone. */
export function profileMatches(profile: ProviderProfile, settings: Settings): boolean {
  const speech =
    strip(profile.baseUrl) === strip(settings.provider.baseUrl) &&
    profile.sttModel === settings.provider.sttModel &&
    profile.llmModel === settings.provider.llmModel
  if (!speech) return false
  if (!profile.polish || !profile.sort || !profile.transform) return true
  const sort = settings.notes.connection
  return (
    connectionMatches(profile.polish, settings.polish) &&
    connectionMatches(profile.sort, sort) &&
    profile.sort.protocol === sort.protocol &&
    profile.sort.threshold === sort.threshold &&
    connectionMatches(profile.transform, settings.transform.connection)
  )
}

/** A provider's name: the catalog's when the base URL is a preset's,
 *  else the address's host, so a custom endpoint still reads as a place. */
export function providerName(catalog: ProviderCatalog | null, baseUrl: string): string {
  if (baseUrl.trim() === '') return 'no provider set'
  const preset = catalog ? providerForBaseUrl(catalog, baseUrl) : null
  if (preset) return preset.name
  try {
    return new URL(baseUrl).host || baseUrl
  } catch {
    return baseUrl
  }
}

const line = (catalog: ProviderCatalog | null, baseUrl: string, model: string): string =>
  `${providerName(catalog, baseUrl)} · ${model.trim() === '' ? 'no model set' : model}`

/** What a profile card says it runs. cleanup is null for a speech only
 *  profile: it does not know its cleanup until it is saved again. */
export function describeProfile(
  profile: ProviderProfile,
  catalog: ProviderCatalog | null
): { speech: string; cleanup: string | null } {
  const speech = line(catalog, profile.baseUrl, profile.sttModel)
  if (!profile.polish) return { speech, cleanup: null }
  return {
    speech,
    cleanup: profile.polish.enabled
      ? line(catalog, profile.polish.baseUrl, profile.polish.llmModel)
      : `same as speech · ${profile.llmModel.trim() === '' ? 'no model set' : profile.llmModel}`
  }
}

/** Which keys are saved, as the window knows them: the ring's base URLs
 *  and whether the cleanup slot's key (ring or a pre-ring file) is there. */
export interface KeysKnown {
  ring: string[]
  cleanupKey: boolean
}

export type Slot = 'speech' | 'cleanup' | 'notes sorting' | 'Transform'

/** Where each slot runs right now, with the same fallbacks the pipeline
 *  uses (main/formatter): a separate slot is in force only when it has a
 *  base URL, a model, and a key, else it rides the one beneath it. */
export function connectionsNow(
  settings: Settings,
  keys: KeysKnown
): Record<Slot, { baseUrl: string; model: string; own: boolean; waiting: boolean } | null> {
  const hasKey = (url: string): boolean => keys.ring.some((u) => sameUrl(u, url))
  const polish = settings.polish
  const polishReady = polish.enabled && polish.baseUrl !== '' && polish.llmModel !== '' && keys.cleanupKey
  const cleanup = polishReady
    ? { baseUrl: polish.baseUrl, model: polish.llmModel, own: true, waiting: false }
    : { baseUrl: settings.provider.baseUrl, model: settings.provider.llmModel, own: false, waiting: polish.enabled }
  const ride = (slot: ProfileConnection): { baseUrl: string; model: string; own: boolean; waiting: boolean } =>
    slot.enabled && slot.baseUrl !== '' && slot.llmModel !== '' && hasKey(slot.baseUrl)
      ? { baseUrl: slot.baseUrl, model: slot.llmModel, own: true, waiting: false }
      : { ...cleanup, own: false, waiting: slot.enabled }
  return {
    speech: { baseUrl: settings.provider.baseUrl, model: settings.provider.sttModel, own: true, waiting: false },
    cleanup: settings.formatting.level === 'full' ? cleanup : null,
    // Sorting runs only while it is on, Transform only once it has a chord.
    'notes sorting': settings.notes.sort ? ride(settings.notes.connection) : null,
    Transform: settings.transform.binding !== '' ? ride(settings.transform.connection) : null
  }
}

/** What the strip at the top of Provider and keys says (US-152). */
export function runningNow(
  settings: Settings,
  catalog: ProviderCatalog | null,
  keys: KeysKnown
): { speech: string; cleanup: string; note: string | null } {
  const now = connectionsNow(settings, keys)
  const speech = line(catalog, settings.provider.baseUrl, settings.provider.sttModel)
  const cleanup = now.cleanup
  if (!cleanup) {
    return {
      speech,
      cleanup: 'off',
      note: `Formatting is ${settings.formatting.level === 'off' ? 'Off' : 'Light'}, so no cleanup model runs. Full turns it on, under Dictation.`
    }
  }
  return {
    speech,
    cleanup: line(catalog, cleanup.baseUrl, cleanup.model),
    note: cleanup.waiting
      ? 'Cleanup has its own provider, but it needs a base URL, a model, and a key first, so it runs on speech until then.'
      : null
  }
}

/** What a saved key is for in the setup running now, in slot order. */
export function keyUses(settings: Settings, keys: KeysKnown, baseUrl: string): Slot[] {
  const now = connectionsNow(settings, keys)
  return (Object.keys(now) as Slot[]).filter((slot) => {
    const c = now[slot]
    return c !== null && sameUrl(c.baseUrl, baseUrl)
  })
}

/** 1 sentence for a saved key's row. */
export function keyUseLine(uses: Slot[]): string {
  if (uses.length === 0) return 'Saved, not used by this setup.'
  const list =
    uses.length === 1
      ? uses[0]
      : uses.length === 2
        ? `${uses[0]} and ${uses[1]}`
        : `${uses.slice(0, -1).join(', ')}, and ${uses[uses.length - 1]}`
  return `Used for ${list}.`
}
