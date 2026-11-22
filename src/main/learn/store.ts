// SPDX-License-Identifier: GPL-3.0-only
// Where fixes wait while they are counted (US-185). They are words the
// person said, so the file follows the rules history follows: with
// Encrypt saved words on it is sealed by the system's secure storage
// (the one that guards API keys), and when that storage cannot seal it
// the fixes live in memory only and no file is written; fixes older
// than Keep history for are forgotten; Clear all empties it; and
// turning learning off deletes it.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { type Candidate, keepCandidates, usableCandidates } from '../../shared/learn'
import { writeDurably } from '../history/durable'

export interface LearnWrap {
  available: () => boolean
  encrypt: (plain: string) => Buffer
  decrypt: (wrapped: Buffer) => string
}

export interface LearnStoreDeps {
  dir: string
  wrap: LearnWrap
  /** Encrypt saved words, as it is right now. */
  encrypt: () => boolean
  /** Keep history for, in days, as it is right now. */
  retentionDays: () => number
  now?: () => number
}

const FILE = 'learned-fixes.json'

export class LearnStore {
  private list: Candidate[] | null = null

  constructor(private readonly deps: LearnStoreDeps) {}

  private file(): string {
    return join(this.deps.dir, FILE)
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private load(): Candidate[] {
    try {
      if (!existsSync(this.file())) return []
      const stored = JSON.parse(readFileSync(this.file(), 'utf8')) as { sealed?: unknown; fixes?: unknown }
      if (typeof stored.sealed === 'string') {
        if (!this.deps.wrap.available()) return []
        return usableCandidates(JSON.parse(this.deps.wrap.decrypt(Buffer.from(stored.sealed, 'base64'))))
      }
      return usableCandidates(stored.fixes)
    } catch (error) {
      // A file that cannot be read costs counts, never a dictation.
      console.error('[murmur] learn: could not read the waiting fixes:', (error as Error | null)?.name ?? 'error')
      return []
    }
  }

  /** The fixes being counted, without the ones history would have dropped. */
  read(): Candidate[] {
    this.list ??= this.load()
    const kept = keepCandidates(this.list, this.now(), this.deps.retentionDays())
    // A fix history has forgotten leaves the file too, not only memory.
    if (kept.length !== this.list.length) this.write(kept)
    else this.list = kept
    return (this.list ?? []).map((candidate) => ({ ...candidate }))
  }

  /** Keep a new list. Returns false when it lives in memory only. */
  write(list: readonly Candidate[]): boolean {
    this.list = keepCandidates(list, this.now(), this.deps.retentionDays())
    try {
      if (this.list.length === 0) {
        rmSync(this.file(), { force: true })
        rmSync(`${this.file()}.tmp`, { force: true })
        return true
      }
      let text: string
      if (this.deps.encrypt()) {
        if (!this.deps.wrap.available()) {
          // Asked to seal and unable to: nothing readable goes to disk.
          rmSync(this.file(), { force: true })
          rmSync(`${this.file()}.tmp`, { force: true })
          return false
        }
        text = JSON.stringify({ v: 1, sealed: this.deps.wrap.encrypt(JSON.stringify(this.list)).toString('base64') })
      } else {
        text = JSON.stringify({ v: 1, fixes: this.list })
      }
      writeDurably(this.file(), `${this.file()}.tmp`, text, 0o600)
      return true
    } catch (error) {
      console.error('[murmur] learn: could not save the waiting fixes:', (error as Error | null)?.name ?? 'error')
      return false
    }
  }

  /** Forget every fix, in memory and on disk. */
  clear(): void {
    this.list = []
    try {
      rmSync(this.file(), { force: true })
      rmSync(`${this.file()}.tmp`, { force: true })
    } catch (error) {
      console.error('[murmur] learn: could not delete the waiting fixes:', (error as Error | null)?.name ?? 'error')
    }
  }

  /** Write the list again as the settings now ask (sealed or not). */
  resave(): void {
    this.write(this.read())
  }
}
