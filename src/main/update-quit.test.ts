// SPDX-License-Identifier: GPL-3.0-only
// A restart to update closes every window before before-quit fires, and
// on a Mac it waits for that. A window that cannot be closed has to be
// released on before-quit-for-update too, or the restart hangs with
// dictation dead (found in the US-178 review gate).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

describe('windows that cannot be closed (US-178)', () => {
  const unclosable = sources(join(__dirname)).filter((path) => /closable:\s*false/.test(readFileSync(path, 'utf8')))

  it('exist, so this check is looking at something', () => {
    expect(unclosable.length).toBeGreaterThan(0)
  })

  it('are each released when murmur restarts to update', () => {
    for (const path of unclosable) {
      expect(readFileSync(path, 'utf8'), path).toMatch(/autoUpdater\.on\('before-quit-for-update'/)
    }
  })
})
