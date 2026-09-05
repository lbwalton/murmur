// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type KeyCipher, KeyStore } from './keystore'

// XOR toy cipher: enough to prove the store never writes plaintext.
const toyCipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => Buffer.from([...Buffer.from(plain, 'utf8')].map((b) => b ^ 0x5a)),
  decrypt: (enc) => Buffer.from([...enc].map((b) => b ^ 0x5a)).toString('utf8')
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-keystore-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('KeyStore', () => {
  it('round-trips a key', () => {
    const store = new KeyStore(dir, toyCipher)
    store.set('gsk_super_secret_value')
    expect(store.get()).toBe('gsk_super_secret_value')
  })

  it('never writes the plaintext to disk', () => {
    const store = new KeyStore(dir, toyCipher)
    store.set('gsk_super_secret_value')
    const onDisk = readFileSync(join(dir, 'key.enc'))
    expect(onDisk.includes('gsk_super_secret_value')).toBe(false)
  })

  it('reports status with a mask and no plaintext', () => {
    const store = new KeyStore(dir, toyCipher)
    expect(store.status()).toEqual({ present: false, masked: null })
    store.set('gsk_abcdefghijklmnop')
    const status = store.status()
    expect(status.present).toBe(true)
    expect(status.masked).toBe('gsk_…mnop')
    expect(JSON.stringify(status).includes('abcdefghijkl')).toBe(false)
  })

  it('clears the key', () => {
    const store = new KeyStore(dir, toyCipher)
    store.set('gsk_super_secret_value')
    store.clear()
    expect(store.get()).toBeNull()
    expect(store.status().present).toBe(false)
  })

  it('refuses to store when encryption is unavailable', () => {
    const store = new KeyStore(dir, { ...toyCipher, available: () => false })
    expect(() => store.set('gsk_x')).toThrow('encryption unavailable')
  })

  it('returns null for an unreadable key file', () => {
    const store = new KeyStore(dir, {
      ...toyCipher,
      decrypt: () => {
        throw new Error('bad payload')
      }
    })
    store.set('gsk_super_secret_value')
    expect(store.get()).toBeNull()
  })
})
