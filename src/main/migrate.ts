// SPDX-License-Identifier: GPL-3.0-only
// One-time dev-to-packaged profile migration. Development runs under
// the murmur-dev userData profile; the packaged app runs under murmur.
// On first packaged launch, practice history, settings, announced
// gamification state, and the founder marker carry over so the journey
// continues unbroken. The encrypted API key does NOT migrate: dev and
// packaged apps hold different OS keychain identities, so the blob
// cannot decrypt across them and the key is re-entered once instead.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MIGRATED_MARKER = 'migrated-from-dev.json'

export const MIGRATABLE_FILES = [
  'settings.json',
  'history.jsonl',
  'achievements-notified.json',
  'promotions-notified.json',
  'founder'
] as const

/**
 * Copy the dev profile into a fresh packaged profile, once ever.
 * Idempotent and non-destructive: a file is copied only when the
 * source has it AND the target does not, and the whole attempt runs
 * a single time, recorded by the marker file in the target.
 */
export function migrateFromDev(sourceDir: string, targetDir: string): { migrated: string[] } {
  const marker = join(targetDir, MIGRATED_MARKER)
  const migrated: string[] = []
  if (existsSync(marker)) return { migrated }

  if (existsSync(sourceDir)) {
    for (const name of MIGRATABLE_FILES) {
      const from = join(sourceDir, name)
      const to = join(targetDir, name)
      if (existsSync(from) && !existsSync(to)) {
        copyFileSync(from, to)
        migrated.push(name)
      }
    }
  }
  writeFileSync(marker, JSON.stringify({ at: Date.now(), from: sourceDir, migrated }))
  return { migrated }
}
