// SPDX-License-Identifier: GPL-3.0-only
// Sealed history words (US-138). Only a line's words are sealed, so its
// numbers read with no key at all, and a lost key can cost words but
// never belts, stats, or paintings. Each line is sealed with AES-256-GCM
// under a random key, and that key is wrapped by the system's secure
// storage, the same one that guards API keys. Keys are only ever added:
// if one stops opening, a new one joins it, so a Keychain that comes
// back later opens the old lines again.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { type SessionEvent, countWords } from '../../shared/history'
import { writeDurably } from './durable'

export interface KeyWrap {
  available: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (wrapped: Buffer) => string
}

/** A line as stored. A sealed line's rawText and finalText are empty. */
export type StoredEvent = SessionEvent & { sealed?: string }

export interface HistoryWords {
  rawText: string
  finalText: string
}

interface StoredKey {
  id: string
  wrapped: string
}

const KEY_FILE = 'history-keys.json'
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

function isStoredKey(value: unknown): value is StoredKey {
  const key = value as StoredKey
  return typeof value === 'object' && value !== null && typeof key.id === 'string' && typeof key.wrapped === 'string'
}

export class WordSeal {
  private readonly file: string
  private stored: StoredKey[]
  private readonly keys = new Map<string, Buffer>()
  private active: string | null = null

  constructor(
    dir: string,
    private readonly wrap: KeyWrap
  ) {
    this.file = join(dir, KEY_FILE)
    this.stored = this.readKeys()
    this.openKeys()
  }

  /** A damaged key file is set aside, never overwritten. */
  private readKeys(): StoredKey[] {
    if (!existsSync(this.file)) return []
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      if (Array.isArray(parsed) && parsed.every(isStoredKey)) return parsed
    } catch {
      // Handled below.
    }
    renameSync(this.file, `${this.file}.${Date.now()}.damaged`)
    return []
  }

  private usable(): boolean {
    try {
      return this.wrap.available()
    } catch {
      return false
    }
  }

  /** The newest key that opens is the one new lines use. */
  private openKeys(): void {
    if (!this.usable()) return
    for (const key of this.stored) {
      if (this.keys.has(key.id)) {
        this.active = key.id
        continue
      }
      try {
        const opened = Buffer.from(this.wrap.decrypt(Buffer.from(key.wrapped, 'base64')), 'base64')
        if (opened.length !== KEY_BYTES) continue
        this.keys.set(key.id, opened)
        this.active = key.id
      } catch {
        // It stays on file for the day it opens again.
      }
    }
  }

  /** Ready to seal, adding a key if none opens. False when secure
   *  storage is unavailable or a new key cannot be kept. */
  prepare(): boolean {
    this.openKeys()
    if (this.active !== null) return true
    if (!this.usable()) return false
    try {
      const key = randomBytes(KEY_BYTES)
      const text = key.toString('base64')
      const wrapped = this.wrap.encrypt(text)
      // A key that cannot be opened again would seal words for good.
      if (this.wrap.decrypt(wrapped) !== text) return false
      const id = randomBytes(4).toString('hex')
      const next = [...this.stored, { id, wrapped: wrapped.toString('base64') }]
      // On the disk for good before any line depends on it.
      writeDurably(this.file, `${this.file}.tmp`, JSON.stringify(next), 0o600)
      this.stored = next
      this.keys.set(id, key)
      this.active = id
      return true
    } catch (error) {
      console.error('[murmur] could not make a history key:', error)
      return false
    }
  }

  /** The line as it goes to disk. Throws with no key: call prepare first.
   *  A transform's stroke weighs its instruction, so that count stays
   *  readable, as it does when Keep history removes its words. */
  close(event: SessionEvent): StoredEvent {
    const key = this.active === null ? undefined : this.keys.get(this.active)
    if (key === undefined) throw new Error('no history key')
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES })
    cipher.setAAD(Buffer.from(String(event.at)))
    const body = Buffer.concat([cipher.update(JSON.stringify([event.rawText, event.finalText]), 'utf8'), cipher.final()])
    const sealed = [nonce, cipher.getAuthTag(), body].map((part) => part.toString('base64url'))
    return {
      ...event,
      ...(event.kind === 'transform' ? { instructionWords: event.instructionWords ?? countWords(event.rawText) } : {}),
      rawText: '',
      finalText: '',
      sealed: [this.active, ...sealed].join('.')
    }
  }

  /** The line's words, or null when its key is not here or it was changed. */
  open(event: StoredEvent): HistoryWords | null {
    try {
      const [id, nonce, tag, body] = (event.sealed ?? '').split('.')
      const key = this.keys.get(id)
      if (key === undefined || nonce === undefined || tag === undefined || body === undefined) return null
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'), { authTagLength: TAG_BYTES })
      decipher.setAAD(Buffer.from(String(event.at)))
      decipher.setAuthTag(Buffer.from(tag, 'base64url'))
      const text = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
      const words: unknown = JSON.parse(text)
      if (!Array.isArray(words) || typeof words[0] !== 'string' || typeof words[1] !== 'string') return null
      return { rawText: words[0], finalText: words[1] }
    } catch {
      return null
    }
  }
}
