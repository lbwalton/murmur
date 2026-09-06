// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RotatingLog } from './logging'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-logs-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('RotatingLog', () => {
  it('creates the directory and appends timestamped lines', () => {
    const log = new RotatingLog(dir)
    log.write('first thing')
    log.write('second thing')
    const content = readFileSync(log.path(), 'utf8')
    expect(content).toContain('first thing')
    expect(content).toContain('second thing')
    expect(content.trim().split('\n').length).toBe(2)
  })

  it('rotates when the file exceeds the cap and keeps a bounded set', () => {
    const log = new RotatingLog(dir)
    log.write('seed')
    writeFileSync(log.path(), 'x'.repeat(300 * 1024))
    log.write('after rotation one')
    expect(existsSync(`${log.path()}.1`)).toBe(true)
    writeFileSync(log.path(), 'y'.repeat(300 * 1024))
    log.write('after rotation two')
    expect(existsSync(`${log.path()}.2`)).toBe(true)
    writeFileSync(log.path(), 'z'.repeat(300 * 1024))
    log.write('after rotation three')
    // Still exactly .1 and .2: the oldest fell off.
    expect(existsSync(`${log.path()}.3`)).toBe(false)
    expect(readFileSync(log.path(), 'utf8')).toContain('after rotation three')
  })

  it('never throws on an unwritable directory', () => {
    const log = new RotatingLog('/dev/null/not-a-dir')
    expect(() => log.write('into the void')).not.toThrow()
  })
})
