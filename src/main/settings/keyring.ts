// SPDX-License-Identifier: GPL-3.0-only
// The key ring: one encrypted key per provider base URL, plus a plain
// index of which base URLs hold keys. Base URLs are not secrets; key
// material never enters the index and never leaves the encrypted
// per-provider files. The legacy single-slot files migrate here once,
// assigned by their own unambiguous full prefix, then by recorded
// provenance, and otherwise stay put as an unassigned key the user
// resolves in the UI; nothing is ever silently dropped.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type KeyCipher, type KeyStatus, KeyStore } from './keystore'

export interface RingEntry {
  baseUrl: string
  masked: string
}

export interface RingStatus {
  /** The active provider's key state: what the setup field speaks for. */
  active: KeyStatus
  /** Every saved key, provider-labeled by base URL. */
  list: RingEntry[]
  /** A pre-ring key that could not be auto-assigned. */
  legacy: KeyStatus
}

const normalizeUrl = (u: string): string => u.replace(/\/$/, '')

export class KeyRing {
  private readonly dir: string
  private readonly indexFile: string

  constructor(
    userData: string,
    private readonly cipher: KeyCipher
  ) {
    this.dir = join(userData, 'keys')
    mkdirSync(this.dir, { recursive: true })
    this.indexFile = join(this.dir, 'index.json')
  }

  private readIndex(): string[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.indexFile, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
    } catch {
      return []
    }
  }

  private writeIndex(urls: string[]): void {
    writeFileSync(this.indexFile, JSON.stringify(urls, null, 2))
  }

  private storeFor(baseUrl: string): KeyStore {
    const file = `${createHash('sha256').update(normalizeUrl(baseUrl)).digest('hex').slice(0, 16)}.enc`
    return new KeyStore(this.dir, this.cipher, file)
  }

  set(baseUrl: string, key: string): void {
    const url = normalizeUrl(baseUrl)
    this.storeFor(url).set(key)
    const urls = this.readIndex()
    if (!urls.includes(url)) this.writeIndex([...urls, url])
  }

  get(baseUrl: string): string | null {
    if (baseUrl === '') return null
    return this.storeFor(baseUrl).get()
  }

  clear(baseUrl: string): void {
    const url = normalizeUrl(baseUrl)
    this.storeFor(url).clear()
    this.writeIndex(this.readIndex().filter((u) => u !== url))
  }

  status(baseUrl: string): KeyStatus {
    if (baseUrl === '') return { present: false, masked: null }
    return this.storeFor(baseUrl).status()
  }

  list(): RingEntry[] {
    return this.readIndex()
      .map((baseUrl) => ({ baseUrl, masked: this.storeFor(baseUrl).status().masked ?? '' }))
      .filter((entry) => entry.masked !== '')
  }
}

/**
 * One-time move of the legacy single-slot keys into the ring. The
 * primary key assigns by its own FULL prefix when exactly one catalog
 * provider claims it (far stronger than the four-character mask), else
 * by recorded provenance; an unresolvable key stays in the legacy
 * store for the user. The polish key follows the cleanup base URL
 * when one is set.
 */
export function migrateLegacyKeys(input: {
  legacy: KeyStore
  polishLegacy: KeyStore
  ring: KeyRing
  provenanceBaseUrl: string
  polishBaseUrl: string
  prefixOwners: Array<{ baseUrl: string; prefixes: string[] }>
}): void {
  const key = input.legacy.get()
  if (key) {
    const owners = input.prefixOwners.filter((o) => o.prefixes.some((p) => key.startsWith(p)))
    const target = owners.length === 1 ? owners[0].baseUrl : input.provenanceBaseUrl
    if (target !== '') {
      input.ring.set(target, key)
      input.legacy.clear()
    }
  }
  const polishKey = input.polishLegacy.get()
  if (polishKey && input.polishBaseUrl !== '') {
    input.ring.set(input.polishBaseUrl, polishKey)
    input.polishLegacy.clear()
  }
}
