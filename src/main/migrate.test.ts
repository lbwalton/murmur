// SPDX-License-Identifier: GPL-3.0-only
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATED_MARKER, migrateFromDev } from './migrate'

let root: string
let source: string
let target: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'murmur-migrate-'))
  source = join(root, 'murmur-dev')
  target = join(root, 'murmur')
  mkdirSync(source)
  mkdirSync(target)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('migrateFromDev', () => {
  it('carries the dev profile into a fresh packaged profile', () => {
    writeFileSync(join(source, 'settings.json'), '{"a":1}')
    writeFileSync(join(source, 'history.jsonl'), '{"words":3}\n')
    writeFileSync(join(source, 'founder'), '')
    const { migrated } = migrateFromDev(source, target)
    expect(migrated.sort()).toEqual(['founder', 'history.jsonl', 'settings.json'])
    expect(readFileSync(join(target, 'history.jsonl'), 'utf8')).toBe('{"words":3}\n')
    expect(readFileSync(join(target, MIGRATED_MARKER), 'utf8')).toContain('murmur-dev')
  })

  it('never overwrites data the packaged app already has', () => {
    writeFileSync(join(source, 'history.jsonl'), 'dev\n')
    writeFileSync(join(target, 'history.jsonl'), 'packaged\n')
    const { migrated } = migrateFromDev(source, target)
    expect(migrated).toEqual([])
    expect(readFileSync(join(target, 'history.jsonl'), 'utf8')).toBe('packaged\n')
  })

  it('runs once ever: the marker stops later attempts', () => {
    migrateFromDev(source, target)
    writeFileSync(join(source, 'history.jsonl'), 'late arrival\n')
    const second = migrateFromDev(source, target)
    expect(second.migrated).toEqual([])
  })

  it('handles a missing dev profile by just writing the marker', () => {
    rmSync(source, { recursive: true })
    const { migrated } = migrateFromDev(source, target)
    expect(migrated).toEqual([])
    expect(readFileSync(join(target, MIGRATED_MARKER), 'utf8')).toContain('"migrated":[]')
  })

  it('does not touch the encrypted key store', () => {
    writeFileSync(join(source, 'key.enc'), 'secret-blob')
    const { migrated } = migrateFromDev(source, target)
    expect(migrated).toEqual([])
  })
})
