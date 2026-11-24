// SPDX-License-Identifier: GPL-3.0-only
// The waiting fixes on disk (US-185): sealed when history is, never
// readable on disk when sealing was asked for and cannot be done,
// forgotten on history's schedule, and gone on clear.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Candidate } from '../../shared/learn'
import { LearnStore, type LearnWrap } from './store'

const day = 24 * 60 * 60 * 1000
const fix = (heard: string, written: string, last: number): Candidate => ({ heard, written, count: 2, first: last, last })

// A stand-in for the system's secure storage: reversible, and plainly
// not the words themselves.
const wrap = (available = true): LearnWrap => ({
  available: () => available,
  encrypt: (plain) => Buffer.from([...Buffer.from(plain, 'utf8')].map((byte) => byte ^ 0x5a)),
  decrypt: (wrapped) => Buffer.from([...wrapped].map((byte) => byte ^ 0x5a)).toString('utf8')
})

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-learn-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const file = (): string => join(dir, 'learned-fixes.json')
const store = (over: Partial<ConstructorParameters<typeof LearnStore>[0]> = {}): LearnStore =>
  new LearnStore({ dir, wrap: wrap(), encrypt: () => true, retentionDays: () => 90, now: () => 100 * day, ...over })

describe('the waiting fixes on disk', () => {
  it('is sealed when Encrypt saved words is on: no word of a fix is readable in the file', () => {
    const s = store()
    expect(s.write([fix('shiv on', 'Siobhan', 99 * day)])).toBe(true)
    const text = readFileSync(file(), 'utf8')
    expect(text).not.toMatch(/shiv|Siobhan/)
    expect(JSON.parse(text)).toHaveProperty('sealed')
    // A new store, as after a restart, opens it again.
    expect(store().read()).toEqual([fix('shiv on', 'Siobhan', 99 * day)])
  })

  it('writes nothing readable when it was asked to seal and cannot: the fixes stay in memory', () => {
    writeFileSync(file(), JSON.stringify({ v: 1, fixes: [fix('old word', 'Old Word', 99 * day)] }))
    const s = store({ wrap: wrap(false) })
    expect(s.write([fix('shiv on', 'Siobhan', 99 * day)])).toBe(false)
    expect(existsSync(file())).toBe(false)
    expect(s.read()).toHaveLength(1)
    expect(store({ wrap: wrap(false) }).read()).toEqual([])
  })

  it('is plain when Encrypt saved words is off, as history is', () => {
    const s = store({ encrypt: () => false })
    s.write([fix('shiv on', 'Siobhan', 99 * day)])
    expect(JSON.parse(readFileSync(file(), 'utf8')).fixes).toHaveLength(1)
    // Turning sealing on writes it sealed at the next save.
    const sealed = store()
    sealed.resave()
    expect(readFileSync(file(), 'utf8')).not.toMatch(/shiv|Siobhan/)
    expect(sealed.read()).toHaveLength(1)
  })

  it('forgets fixes older than Keep history for, on read and on write', () => {
    const s = store({ encrypt: () => false, retentionDays: () => 30 })
    s.write([fix('shiv on', 'Siobhan', 60 * day), fix('git hub', 'GitHub', 95 * day)])
    expect(s.read().map((c) => c.heard)).toEqual(['git hub'])
    expect(readFileSync(file(), 'utf8')).not.toContain('Siobhan')
    // Keep no text keeps no fix, and leaves no file.
    const none = store({ encrypt: () => false, retentionDays: () => -1 })
    none.write([fix('git hub', 'GitHub', 99 * day)])
    expect(none.read()).toEqual([])
    expect(existsSync(file())).toBe(false)
  })

  it('takes a fix history has forgotten out of the file too, the next time it is read', () => {
    let today = 100 * day
    const s = store({ encrypt: () => false, retentionDays: () => 30, now: () => today })
    s.write([fix('shiv on', 'Siobhan', 99 * day), fix('git hub', 'GitHub', 99 * day)])
    expect(readFileSync(file(), 'utf8')).toContain('Siobhan')
    // 45 days on, with nothing new learned: a read is enough.
    today = 145 * day
    expect(s.read()).toEqual([])
    expect(existsSync(file())).toBe(false)
    // And after a restart, with 1 fix still young enough to keep.
    today = 100 * day
    s.write([fix('shiv on', 'Siobhan', 60 * day), fix('git hub', 'GitHub', 99 * day)])
    today = 100 * day
    const restarted = store({ encrypt: () => false, retentionDays: () => 30, now: () => 125 * day })
    expect(restarted.read().map((c) => c.heard)).toEqual(['git hub'])
    expect(readFileSync(file(), 'utf8')).not.toContain('Siobhan')
  })

  it('leaves no half-written file behind when the list empties', () => {
    const s = store({ encrypt: () => false })
    s.write([fix('shiv on', 'Siobhan', 99 * day)])
    writeFileSync(`${file()}.tmp`, 'left from a cut write')
    s.write([])
    expect(existsSync(file())).toBe(false)
    expect(existsSync(`${file()}.tmp`)).toBe(false)
  })

  it('is gone after clear, in memory and on disk', () => {
    const s = store()
    s.write([fix('shiv on', 'Siobhan', 99 * day)])
    s.clear()
    expect(s.read()).toEqual([])
    expect(existsSync(file())).toBe(false)
    expect(store().read()).toEqual([])
  })

  it('reads a broken or tampered file as nothing, and trusts no entry in it', () => {
    writeFileSync(file(), '{ not json')
    expect(store().read()).toEqual([])
    writeFileSync(file(), JSON.stringify({ v: 1, sealed: 'bm90IHNlYWxlZA==' }))
    expect(store().read()).toEqual([])
    writeFileSync(file(), JSON.stringify({ v: 1, fixes: [{ heard: 'there', written: 'their', count: 9, first: 1, last: 99 * day }, 'x'] }))
    expect(store({ encrypt: () => false }).read()).toEqual([])
  })

  it('hands out copies: a caller cannot change what is kept by changing what it read', () => {
    const s = store()
    s.write([fix('shiv on', 'Siobhan', 99 * day)])
    s.read()[0].count = 99
    expect(s.read()[0].count).toBe(2)
  })
})
