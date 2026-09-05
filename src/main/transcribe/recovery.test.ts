// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RECOVERY_KEEP, saveRecovery } from './recovery'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-recovery-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('saveRecovery', () => {
  it('writes the wav bytes and returns the path', () => {
    const wav = new Uint8Array([82, 73, 70, 70])
    const file = saveRecovery(wav, dir, () => 1234)
    expect(file.endsWith('recovery-1234.wav')).toBe(true)
    expect(existsSync(file)).toBe(true)
    expect(Array.from(readFileSync(file))).toEqual([82, 73, 70, 70])
  })

  it('prunes to the newest RECOVERY_KEEP files', () => {
    for (let i = 0; i < RECOVERY_KEEP + 5; i++) {
      saveRecovery(new Uint8Array([i]), dir, () => 1_000_000_000_000 + i)
    }
    const names = readdirSync(dir).sort()
    expect(names.length).toBe(RECOVERY_KEEP)
    expect(names[0]).toBe(`recovery-${1_000_000_000_005}.wav`)
  })
})
