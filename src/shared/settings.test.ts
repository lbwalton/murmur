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

  it('ships note mode dormant with the default file layout', () => {
    expect(DEFAULT_SETTINGS.notes).toEqual({
      binding: '',
      folder: '',
      pathTemplate: 'murmur/inbox/{date}.md',
      entryTemplate: '## {time}\n\n{text}\n\n',
      sort: false,
      tasksTemplate: 'murmur/todo.md',
      ideasTemplate: 'murmur/ideas.md',
      filedHeadingTemplate: '## {date} {topic}',
      topicHeadings: false,
      reminders: { enabled: false, times: ['08:30', '13:00', '17:30'] },
      connection: { enabled: false, baseUrl: '', llmModel: '', protocol: 'chat', threshold: 0.5 }
    })
    const merged = mergeSettings(DEFAULT_SETTINGS, { notes: { folder: '/tmp/vault' } })
    expect(merged.notes.folder).toBe('/tmp/vault')
    expect(merged.notes.pathTemplate).toBe(DEFAULT_SETTINGS.notes.pathTemplate)
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

  it('drops a reminder time that is not a string', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      notes: { reminders: { enabled: true, times: ['08:30', 123, null, '17:30'] } }
    })
    expect(merged.notes.reminders.times).toEqual(['08:30', '17:30'])
  })

  it('clamps a sort threshold into 0..1 and repairs one that is not a number', () => {
    const at = (threshold: unknown): number =>
      mergeSettings(DEFAULT_SETTINGS, { notes: { connection: { threshold } } }).notes.connection.threshold
    expect(at(1.5)).toBe(1)
    expect(at(-2)).toBe(0)
    expect(at(Number.NaN)).toBe(0.5)
    expect(at('0.7')).toBe(0.5)
    expect(at(0.7)).toBe(0.7)
  })

  it('ships the overlay as the classic pill and repairs an unknown look', () => {
    expect(DEFAULT_SETTINGS.overlay).toEqual({ style: 'bars', look: 'pill' })
    const at = (look: unknown): string => mergeSettings(DEFAULT_SETTINGS, { overlay: { look } }).overlay.look
    expect(at('compact')).toBe('compact')
    expect(at('bare')).toBe('bare')
    expect(at('huge')).toBe('pill')
    expect(at(7)).toBe('pill')
    // A style-only save (the waveform picker) leaves the look alone.
    const merged = mergeSettings({ ...DEFAULT_SETTINGS, overlay: { style: 'bars', look: 'bare' } }, { overlay: { style: 'pulse' } })
    expect(merged.overlay).toEqual({ style: 'pulse', look: 'bare' })
  })

  it('ships time back at 40 wpm and repairs a typing speed that cannot be used', () => {
    expect(DEFAULT_SETTINGS.timeBack).toEqual({ typingWpm: 40, milestones: true })
    const at = (typingWpm: unknown): number =>
      mergeSettings(DEFAULT_SETTINGS, { timeBack: { typingWpm } }).timeBack.typingWpm
    expect(at(65)).toBe(65)
    expect(at('fast')).toBe(40)
    expect(at(Number.NaN)).toBe(40)
    expect(at(0)).toBe(10)
    expect(at(9000)).toBe(200)
    // The switch takes only a boolean; a foreign value keeps the default.
    expect(mergeSettings(DEFAULT_SETTINGS, { timeBack: { milestones: 'yes' } }).timeBack.milestones).toBe(true)
    expect(mergeSettings(DEFAULT_SETTINGS, { timeBack: { milestones: false } }).timeBack.milestones).toBe(false)
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

  it('migrates a pre-connections settings file to the new slots untouched', () => {
    // A stored file from before the polish slot and catalog refresh
    // existed: everything it held survives, the new fields land on
    // their defaults, and behavior stays exactly as it was (polish
    // disabled means cleanup rides the provider block).
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      provider: { baseUrl: 'https://api.groq.com/openai/v1', sttModel: 'whisper-large-v3', llmModel: 'openai/gpt-oss-20b' },
      formatting: { level: 'full', numbers: 'digits' }
    })
    expect(merged.provider.sttModel).toBe('whisper-large-v3')
    expect(merged.provider.llmModel).toBe('openai/gpt-oss-20b')
    expect(merged.polish).toEqual({ enabled: false, baseUrl: '', llmModel: '' })
    expect(merged.catalogRefresh).toBe(true)
    // Keys saved before provenance existed stay unknown, never wrong.
    expect(merged.provider.keySavedForBaseUrl).toBe('')
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
