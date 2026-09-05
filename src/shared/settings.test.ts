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
