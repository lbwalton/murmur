// SPDX-License-Identifier: GPL-3.0-only
// Profiles hold the whole setup (US-154): saving and applying a full
// profile, an old speech only profile, the changed check behind the
// unsaved bar, and what each saved key is for.
import { describe, expect, it } from 'vitest'
import catalogJson from '../../shared/provider-catalog.json'
import { type ProviderCatalog, validateCatalog } from './catalog'
import {
  describeProfile,
  isFullProfile,
  keyUseLine,
  keyUses,
  profileMatches,
  profilePatch,
  runningNow,
  snapshotProfile
} from './profiles'
import { DEFAULT_SETTINGS, type ProviderProfile, type Settings, mergeSettings } from './settings'

const catalog = validateCatalog(catalogJson) as ProviderCatalog
const GROQ = 'https://api.groq.com/openai/v1'
const OPENROUTER = 'https://openrouter.ai/api/v1'

const withChanges = (patch: Record<string, unknown>, base: Settings = DEFAULT_SETTINGS): Settings =>
  mergeSettings(base, patch)

// Groq speech, Luna cleanup on OpenRouter: LaBroi's second setup.
const lunaSetup = withChanges({
  polish: { enabled: true, baseUrl: OPENROUTER, llmModel: 'openai/gpt-6-luna' },
  notes: { sort: true },
  transform: { binding: 'Alt+Shift+T' }
})

describe('a full profile', () => {
  it('saves speech, cleanup, notes sorting, and Transform, and no key', () => {
    const profile = snapshotProfile(lunaSetup, 'abcd1234', 'Groq speech, Luna cleanup')
    expect(isFullProfile(profile)).toBe(true)
    expect(profile).toMatchObject({
      baseUrl: GROQ,
      sttModel: 'whisper-large-v3-turbo',
      polish: { enabled: true, baseUrl: OPENROUTER, llmModel: 'openai/gpt-6-luna' },
      sort: { enabled: false, protocol: 'chat', threshold: 0.5 },
      transform: { enabled: false }
    })
    expect(JSON.stringify(profile).toLowerCase()).not.toMatch(/key|gsk_|sk-/)
  })

  it('switches every setting it holds at once, and marks itself active', () => {
    const profile = snapshotProfile(lunaSetup, 'abcd1234', 'Luna')
    const elsewhere = withChanges({
      provider: { baseUrl: 'https://api.openai.com/v1', sttModel: 'whisper-1', llmModel: 'gpt-5-nano', profiles: [profile] },
      polish: { enabled: false, baseUrl: '', llmModel: '' },
      notes: { connection: { enabled: true, baseUrl: 'https://api.typesafe.ai/v1', llmModel: 'jev-latest', protocol: 'decide', threshold: 0.8 } },
      transform: { connection: { enabled: true, baseUrl: 'https://api.deepseek.com', llmModel: 'deepseek-flash' } }
    }, lunaSetup)
    expect(profileMatches(profile, elsewhere)).toBe(false)
    const applied = withChanges(profilePatch(profile), elsewhere)
    expect(profileMatches(profile, applied)).toBe(true)
    expect(applied.provider.activeProfile).toBe('abcd1234')
    expect(applied.polish).toEqual({ enabled: true, baseUrl: OPENROUTER, llmModel: 'openai/gpt-6-luna' })
    expect(applied.notes.connection.protocol).toBe('chat')
    expect(applied.transform.connection.enabled).toBe(false)
    // Settings a profile does not hold stay as they were.
    expect(applied.notes.sort).toBe(true)
    expect(applied.transform.binding).toBe('Alt+Shift+T')
  })

  it('reads as changed when any setting it holds moves, and matches again when it moves back', () => {
    const profile = snapshotProfile(lunaSetup, 'abcd1234', 'Luna')
    for (const patch of [
      { provider: { sttModel: 'whisper-large-v3' } },
      { provider: { llmModel: 'openai/gpt-oss-20b' } },
      { polish: { enabled: false } },
      { polish: { llmModel: 'openai/gpt-oss-120b' } },
      { notes: { connection: { threshold: 0.7 } } },
      { transform: { connection: { enabled: true } } }
    ]) {
      expect(profileMatches(profile, withChanges(patch, lunaSetup))).toBe(false)
    }
    // A trailing slash on the same address is the same address.
    expect(profileMatches(profile, withChanges({ provider: { baseUrl: `${GROQ}/` } }, lunaSetup))).toBe(true)
    // Settings outside a profile never mark it changed.
    expect(profileMatches(profile, withChanges({ formatting: { level: 'light' }, notes: { sort: false } }, lunaSetup))).toBe(true)
  })
})

describe('a profile saved before US-154', () => {
  const old: ProviderProfile = { id: '0ld0ld00', name: 'OpenRouter cleanup', baseUrl: GROQ, sttModel: 'whisper-large-v3', llmModel: 'openai/gpt-oss-120b' }

  it('applies its speech settings as before and leaves cleanup alone', () => {
    expect(isFullProfile(old)).toBe(false)
    const applied = withChanges(profilePatch(old), withChanges({ provider: { profiles: [old] } }, lunaSetup))
    expect(applied.provider.sttModel).toBe('whisper-large-v3')
    expect(applied.polish).toEqual(lunaSetup.polish)
    expect(applied.provider.activeProfile).toBe('0ld0ld00')
  })

  it('is compared on speech alone and shows as speech only until saved again', () => {
    const applied = withChanges(profilePatch(old), lunaSetup)
    expect(profileMatches(old, withChanges({ polish: { enabled: false } }, applied))).toBe(true)
    expect(describeProfile(old, catalog)).toEqual({ speech: 'Groq · whisper-large-v3', cleanup: null })
    const resaved = snapshotProfile(applied, old.id, old.name)
    expect(describeProfile(resaved, catalog).cleanup).toBe('OpenRouter · openai/gpt-6-luna')
  })

  it('survives a load, and a damaged cleanup part makes a profile speech only instead of half applied', () => {
    const loaded = mergeSettings(DEFAULT_SETTINGS, {
      provider: {
        profiles: [old, { ...snapshotProfile(lunaSetup, 'abcd1234', 'Luna'), transform: { enabled: 'yes' } }],
        activeProfile: 'abcd1234'
      }
    })
    expect(loaded.provider.profiles.map((p) => isFullProfile(p))).toEqual([false, false])
    expect(loaded.provider.profiles[1]?.polish).toBeUndefined()
    expect(loaded.provider.activeProfile).toBe('abcd1234')
  })

  it('forgets an active pointer at a profile that is gone', () => {
    const loaded = mergeSettings(DEFAULT_SETTINGS, { provider: { profiles: [old], activeProfile: 'deadbeef' } })
    expect(loaded.provider.activeProfile).toBe('')
  })
})

describe('what a card and the strip say', () => {
  it('names speech and cleanup by provider and model', () => {
    expect(describeProfile(snapshotProfile(DEFAULT_SETTINGS, 'a', 'Groq'), catalog)).toEqual({
      speech: 'Groq · whisper-large-v3-turbo',
      cleanup: 'same as speech · openai/gpt-oss-120b'
    })
    expect(describeProfile(snapshotProfile(lunaSetup, 'b', 'Luna'), catalog).cleanup).toBe('OpenRouter · openai/gpt-6-luna')
  })

  it('says what runs now, including the fallbacks the pipeline uses', () => {
    const keys = { ring: [GROQ, OPENROUTER], cleanupKey: true }
    expect(runningNow(lunaSetup, catalog, keys)).toEqual({
      speech: 'Groq · whisper-large-v3-turbo',
      cleanup: 'OpenRouter · openai/gpt-6-luna',
      note: null
    })
    // Its own provider without a key rides speech, and says so.
    const waiting = runningNow(lunaSetup, catalog, { ring: [GROQ], cleanupKey: false })
    expect(waiting.cleanup).toBe('Groq · openai/gpt-oss-120b')
    expect(waiting.note).toMatch(/runs on speech until then/)
    // Below Full formatting no cleanup model runs at all.
    const light = runningNow(withChanges({ formatting: { level: 'light' } }, lunaSetup), catalog, keys)
    expect(light.cleanup).toBe('off')
    expect(light.note).toMatch(/Formatting is Light/)
  })
})

describe('saved keys by what they do', () => {
  const keys = { ring: [GROQ, OPENROUTER, 'https://api.typesafe.ai/v1'], cleanupKey: true }

  it('finds each key by its provider and lists its jobs in this setup', () => {
    expect(keyUses(lunaSetup, keys, GROQ)).toEqual(['speech'])
    expect(keyUses(lunaSetup, keys, `${OPENROUTER}/`)).toEqual(['cleanup', 'notes sorting', 'Transform'])
    expect(keyUses(lunaSetup, keys, 'https://api.typesafe.ai/v1')).toEqual([])
    expect(keyUses(DEFAULT_SETTINGS, keys, GROQ)).toEqual(['speech', 'cleanup'])
  })

  it('follows a separate sort connection only when it has a key', () => {
    const decide = withChanges({
      notes: { connection: { enabled: true, baseUrl: 'https://api.typesafe.ai/v1', llmModel: 'jev-latest', protocol: 'decide' } }
    }, lunaSetup)
    expect(keyUses(decide, keys, 'https://api.typesafe.ai/v1')).toEqual(['notes sorting'])
    expect(keyUses(decide, { ...keys, ring: [GROQ, OPENROUTER] }, OPENROUTER)).toEqual(['cleanup', 'notes sorting', 'Transform'])
  })

  it('reads as 1 sentence', () => {
    expect(keyUseLine([])).toBe('Saved, not used by this setup.')
    expect(keyUseLine(['speech'])).toBe('Used for speech.')
    expect(keyUseLine(['speech', 'cleanup'])).toBe('Used for speech and cleanup.')
    expect(keyUseLine(['cleanup', 'notes sorting', 'Transform'])).toBe('Used for cleanup, notes sorting, and Transform.')
  })
})
