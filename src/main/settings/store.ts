// SPDX-License-Identifier: GPL-3.0-only
// Settings persistence. Takes an explicit directory so tests can point it
// at a temp dir without Electron. Writes are atomic (tmp then rename); a
// corrupt file is backed up, never silently destroyed.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings, mergeSettings } from '../../shared/settings'

export class SettingsStore {
  private readonly file: string
  private readonly backupFile: string
  private settings: Settings

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'settings.json')
    this.backupFile = join(dir, 'settings.json.bak')
    this.settings = this.load()
  }

  private load(): Settings {
    if (!existsSync(this.file)) return structuredClone(DEFAULT_SETTINGS)
    const raw = readFileSync(this.file, 'utf8')
    try {
      return mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw))
    } catch {
      // Corrupt file: keep the evidence, recover to defaults.
      writeFileSync(this.backupFile, raw)
      return structuredClone(DEFAULT_SETTINGS)
    }
  }

  get(): Settings {
    return structuredClone(this.settings)
  }

  update(partial: unknown): Settings {
    this.settings = mergeSettings(this.settings, partial)
    this.save()
    return this.get()
  }

  private save(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.settings, null, 2))
    renameSync(tmp, this.file)
  }
}
