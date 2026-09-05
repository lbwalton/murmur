// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import { SettingsStore } from './store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('SettingsStore', () => {
  it('starts from defaults with no file', () => {
    const store = new SettingsStore(dir)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists updates across instances', () => {
    const store = new SettingsStore(dir)
    store.update({ autostart: true, provider: { sttModel: 'custom' } })
    const reloaded = new SettingsStore(dir)
    expect(reloaded.get().autostart).toBe(true)
    expect(reloaded.get().provider.sttModel).toBe('custom')
    expect(reloaded.get().provider.baseUrl).toBe(DEFAULT_SETTINGS.provider.baseUrl)
  })

  it('preserves unknown keys through a load and save cycle', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ futureFeature: 42 }))
    const store = new SettingsStore(dir)
    store.update({ autostart: true })
    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    expect(onDisk.futureFeature).toBe(42)
    expect(onDisk.autostart).toBe(true)
  })

  it('recovers from a corrupt file and keeps a backup', () => {
    writeFileSync(join(dir, 'settings.json'), '{not json at all')
    const store = new SettingsStore(dir)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(readFileSync(join(dir, 'settings.json.bak'), 'utf8')).toBe('{not json at all')
  })

  it('get returns a copy, not a live reference', () => {
    const store = new SettingsStore(dir)
    const snapshot = store.get()
    snapshot.autostart = true
    expect(store.get().autostart).toBe(false)
  })
})
