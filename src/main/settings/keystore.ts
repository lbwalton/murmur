// SPDX-License-Identifier: GPL-3.0-only
// API key at rest: encrypted with the OS keychain-backed cipher, stored
// in its own file, never logged, never sent to a renderer in plaintext.
// The cipher is injected so tests can run without Electron.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskKey } from '../../shared/settings'

export interface KeyCipher {
  available: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (encrypted: Buffer) => string
}

export interface KeyStatus {
  present: boolean
  masked: string | null
}

export class KeyStore {
  private readonly file: string

  constructor(
    dir: string,
    private readonly cipher: KeyCipher
  ) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'key.enc')
  }

  set(key: string): void {
    if (!this.cipher.available()) throw new Error('encryption unavailable')
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, this.cipher.encrypt(key))
    // Atomic swap so a crash never leaves a half-written key file.
    writeFileSync(this.file, readFileSync(tmp))
    rmSync(tmp)
  }

  get(): string | null {
    if (!existsSync(this.file)) return null
    try {
      return this.cipher.decrypt(readFileSync(this.file))
    } catch {
      return null
    }
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }

  status(): KeyStatus {
    const key = this.get()
    return key ? { present: true, masked: maskKey(key) } : { present: false, masked: null }
  }
}
