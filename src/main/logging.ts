// SPDX-License-Identifier: GPL-3.0-only
// Rotating error log in userData/logs. Small, capped, and never the
// reason anything else fails: every write is wrapped.
import { existsSync, mkdirSync, renameSync, rmSync, statSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 256 * 1024
const KEEP = 2

export class RotatingLog {
  private readonly dir: string
  private readonly file: string

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'logs')
    this.file = join(this.dir, 'murmur.log')
  }

  /** Append one line, rotating first when the file is over budget. */
  write(message: string): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      this.rotateIfNeeded()
      appendFileSync(this.file, `${new Date().toISOString()} ${message}\n`)
    } catch {
      // Logging must never take the app down.
    }
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.file) || statSync(this.file).size < MAX_BYTES) return
    rmSync(`${this.file}.${KEEP}`, { force: true })
    for (let i = KEEP - 1; i >= 1; i--) {
      if (existsSync(`${this.file}.${i}`)) renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`)
    }
    renameSync(this.file, `${this.file}.1`)
  }

  path(): string {
    return this.file
  }
}
