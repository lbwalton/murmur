// SPDX-License-Identifier: GPL-3.0-only
// Append-only JSONL session log in userData. Corrupt lines are skipped,
// never fatal; retention pruning rewrites the file; clear empties it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type SessionEvent, isSessionEvent } from '../../shared/history'

export class HistoryLog {
  private readonly file: string

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'history.jsonl')
  }

  append(event: SessionEvent): void {
    appendFileSync(this.file, `${JSON.stringify(event)}\n`)
  }

  /** All valid events, oldest first. Corrupt lines are skipped. */
  readAll(): SessionEvent[] {
    if (!existsSync(this.file)) return []
    const events: SessionEvent[] = []
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const parsed: unknown = JSON.parse(line)
        if (isSessionEvent(parsed)) events.push(parsed)
      } catch {
        // A torn write or hand-edit never takes the log down.
      }
    }
    return events
  }

  /** Drop events older than retentionDays. 0 or negative keeps everything. */
  prune(retentionDays: number, now: () => number = () => Date.now()): void {
    if (retentionDays <= 0 || !existsSync(this.file)) return
    const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000
    const kept = this.readAll().filter((e) => e.at >= cutoff)
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''))
    renameSync(tmp, this.file)
  }

  clear(): void {
    writeFileSync(this.file, '')
  }
}
