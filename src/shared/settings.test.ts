// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, maskKey, mergeSettings } from './settings'

describe('mergeSettings', () => {
  it('returns defaults for a missing or invalid store', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, undefined)).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings(DEFAULT_SETTINGS, 'garbage')).toEqual(DEFAULT_SETTINGS)
    expect(mergeSettings(DEFAULT_SETTINGS, [1, 2])).toEqual(DEFAULT_SETTINGS)
  })

  it('fills missing keys from defaults and keeps stored values', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { autostart: true })
    expect(merged.autostart).toBe(true)
    expect(merged.provider.baseUrl).toBe(DEFAULT_SETTINGS.provider.baseUrl)
  })

  it('merges nested objects one field at a time', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { provider: { sttModel: 'custom-model' } })
    expect(merged.provider.sttModel).toBe('custom-model')
    expect(merged.provider.baseUrl).toBe(DEFAULT_SETTINGS.provider.baseUrl)
  })

  it('preserves unknown keys from newer builds', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { futureFeature: { on: true } })
    expect((merged as unknown as Record<string, unknown>).futureFeature).toEqual({ on: true })
  })

  it('discards stored values of the wrong type instead of breaking the app', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      provider: 'groq', // string over object: legacy or foreign settings file
      autostart: 'yes', // string over boolean
      dictionary: { from: 'a', to: 'b' }, // object over array
      sounds: { volume: '1' } // string over number, nested
    })
    expect(merged.provider).toEqual(DEFAULT_SETTINGS.provider)
    expect(merged.autostart).toBe(DEFAULT_SETTINGS.autostart)
    expect(merged.dictionary).toEqual(DEFAULT_SETTINGS.dictionary)
    expect(merged.sounds.volume).toBe(DEFAULT_SETTINGS.sounds.volume)
  })

  it('replaces arrays wholesale', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      dictionary: [{ from: 'labroy', to: 'LaBroi' }]
    })
    expect(merged.dictionary).toEqual([{ from: 'labroy', to: 'LaBroi' }])
  })

  it('never mutates the defaults object', () => {
    const before = structuredClone(DEFAULT_SETTINGS)
    mergeSettings(DEFAULT_SETTINGS, { sounds: { volume: 1 } })
    expect(DEFAULT_SETTINGS).toEqual(before)
  })
})

describe('maskKey', () => {
  it('hides short keys entirely', () => {
    expect(maskKey('abc')).toBe('••••')
    expect(maskKey('12345678')).toBe('••••')
  })

  it('shows only the edges of long keys', () => {
    expect(maskKey('gsk_abcdefghijklmnop')).toBe('gsk_…mnop')
  })
})

describe('sanitized entry lists', () => {
  it('drops malformed dictionary and expansion entries on load', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      dictionary: [{ from: 'a', to: 'b' }, { from: 'x' }, 'junk', null, 42],
      expansions: [{ trigger: 'sig', text: 'Best, LB' }, { trigger: 'broken' }, { text: 'orphan' }]
    })
    expect(merged.dictionary).toEqual([{ from: 'a', to: 'b' }])
    expect(merged.expansions).toEqual([{ trigger: 'sig', text: 'Best, LB' }])
  })

  it('drops malformed provider profiles the same way', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      provider: { profiles: [
        { id: 'abcd1234', name: 'groq', baseUrl: 'https://x', sttModel: 'w', llmModel: 'l' },
        { id: 'oops' },
        'garbage'
      ] }
    })
    expect(merged.provider.profiles.length).toBe(1)
    expect(merged.provider.profiles[0]?.id).toBe('abcd1234')
  })
})
