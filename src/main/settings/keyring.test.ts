// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type KeyCipher, KeyStore } from './keystore'
import { KeyRing, migrateLegacyKeys } from './keyring'

const toyCipher: KeyCipher = {
  available: () => true,
  encrypt: (plain) => Buffer.from([...Buffer.from(plain, 'utf8')].map((b) => b ^ 0x5a)),
  decrypt: (enc) => Buffer.from([...enc].map((b) => b ^ 0x5a)).toString('utf8')
}

const GROQ = 'https://api.groq.com/openai/v1'
const OPENAI = 'https://api.openai.com/v1'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-keyring-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('KeyRing', () => {
  it('keeps one key per base URL and lists them all', () => {
    const ring = new KeyRing(dir, toyCipher)
    ring.set(GROQ, 'gsk_groqgroqgroq1234')
    ring.set(OPENAI, 'sk-openaiopenai98765')
    expect(ring.get(GROQ)).toBe('gsk_groqgroqgroq1234')
    expect(ring.get(OPENAI)).toBe('sk-openaiopenai98765')
    const list = ring.list()
    expect(list.map((e) => e.baseUrl).sort()).toEqual([GROQ, OPENAI].sort())
    expect(list.find((e) => e.baseUrl === GROQ)?.masked).toBe('gsk_…1234')
  })

  it('treats trailing slashes as the same provider and clears cleanly', () => {
    const ring = new KeyRing(dir, toyCipher)
    ring.set(`${GROQ}/`, 'gsk_groqgroqgroq1234')
    expect(ring.get(GROQ)).toBe('gsk_groqgroqgroq1234')
    ring.clear(GROQ)
    expect(ring.get(`${GROQ}/`)).toBeNull()
    expect(ring.list()).toEqual([])
    expect(ring.status('')).toEqual({ present: false, masked: null })
  })

  it('never writes plaintext key material anywhere in its directory', () => {
    const ring = new KeyRing(dir, toyCipher)
    ring.set(GROQ, 'gsk_secretsecret1234')
    for (const file of readdirSync(join(dir, 'keys'))) {
      const raw = readFileSync(join(dir, 'keys', file))
      expect(raw.includes('gsk_secretsecret1234')).toBe(false)
    }
  })
})

describe('migrateLegacyKeys', () => {
  const owners = [{ baseUrl: GROQ, prefixes: ['gsk_'] }]

  it('assigns a legacy key by its own full prefix and empties the slot', () => {
    const legacy = new KeyStore(dir, toyCipher)
    const polishLegacy = new KeyStore(dir, toyCipher, 'polish-key.enc')
    const ring = new KeyRing(dir, toyCipher)
    legacy.set('gsk_legacylegacy1234')
    migrateLegacyKeys({
      legacy,
      polishLegacy,
      ring,
      provenanceBaseUrl: '',
      polishBaseUrl: '',
      prefixOwners: owners
    })
    expect(ring.get(GROQ)).toBe('gsk_legacylegacy1234')
    expect(legacy.get()).toBeNull()
  })

  it('falls back to recorded provenance, and otherwise leaves the key untouched', () => {
    const legacy = new KeyStore(dir, toyCipher)
    const polishLegacy = new KeyStore(dir, toyCipher, 'polish-key.enc')
    const ring = new KeyRing(dir, toyCipher)
    legacy.set('sk-unknownformat1234')
    migrateLegacyKeys({
      legacy,
      polishLegacy,
      ring,
      provenanceBaseUrl: OPENAI,
      polishBaseUrl: '',
      prefixOwners: owners
    })
    expect(ring.get(OPENAI)).toBe('sk-unknownformat1234')

    // Round two: no prefix hit, no provenance: the key stays legacy.
    legacy.set('sk-stillunknown98765')
    migrateLegacyKeys({
      legacy,
      polishLegacy,
      ring,
      provenanceBaseUrl: '',
      polishBaseUrl: '',
      prefixOwners: owners
    })
    expect(legacy.get()).toBe('sk-stillunknown98765')
  })

  it('moves the polish key under the cleanup base URL when one is set', () => {
    const legacy = new KeyStore(dir, toyCipher)
    const polishLegacy = new KeyStore(dir, toyCipher, 'polish-key.enc')
    const ring = new KeyRing(dir, toyCipher)
    polishLegacy.set('sk-polishpolish12345')
    migrateLegacyKeys({
      legacy,
      polishLegacy,
      ring,
      provenanceBaseUrl: '',
      polishBaseUrl: OPENAI,
      prefixOwners: owners
    })
    expect(ring.get(OPENAI)).toBe('sk-polishpolish12345')
    expect(polishLegacy.get()).toBeNull()
  })
})
