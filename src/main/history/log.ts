// SPDX-License-Identifier: GPL-3.0-only
// Append-only JSONL session log in userData. Corrupt lines are skipped,
// never fatal; retention pruning rewrites the file; clear empties it.
// With sealing on, each line's words are sealed (see seal.ts). Rewrites
// work on the lines as stored, so a line nobody can open still keeps
// its words for the day its key comes back.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type SealStatus, type SessionEvent, hasText, isSessionEvent, textCutoff, withoutText } from '../../shared/history'
import type { StoredEvent, WordSeal } from './seal'

const carriesWords = (line: StoredEvent): boolean => hasText(line) || line.sealed !== undefined

function wordless(line: StoredEvent): StoredEvent {
  if (line.sealed === undefined) return withoutText(line)
  const { sealed: _sealed, ...entry } = line
  return entry
}

export class HistoryLog {
  private readonly file: string
  private readonly tmp: string
  private wantsSealing = false
  private sealing = false

  constructor(
    dir: string,
    private readonly seal: WordSeal | null = null
  ) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'history.jsonl')
    this.tmp = `${this.file}.tmp`
  }

  /** A line that cannot be sealed still lands: the take matters more,
   *  and the next launch seals it. */
  private stored(event: SessionEvent): StoredEvent {
    if (!this.sealing || this.seal === null || !hasText(event)) return event
    try {
      return this.seal.close(event)
    } catch (error) {
      console.error('[murmur] could not seal a history line:', error)
      return event
    }
  }

  append(event: SessionEvent): void {
    appendFileSync(this.file, `${JSON.stringify(this.stored(event))}\n`)
  }

  /** Every valid line as stored, oldest first. */
  private readLines(): StoredEvent[] {
    if (!existsSync(this.file)) return []
    const lines: StoredEvent[] = []
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue
      try {
        const parsed: unknown = JSON.parse(line)
        if (!isSessionEvent(parsed)) continue
        // A sealed field that is not text was never written here, so it
        // goes and the line keeps its numbers.
        const { sealed, ...entry } = parsed as StoredEvent & { sealed?: unknown }
        lines.push(typeof sealed === 'string' ? { ...entry, sealed } : entry)
      } catch {
        // A torn write or hand-edit never takes the log down.
      }
    }
    return lines
  }

  /** A line with its words back, or the line itself when none can open. */
  private opened(line: StoredEvent): StoredEvent {
    if (line.sealed === undefined) return line
    const words = this.seal?.open(line) ?? null
    if (words === null) return line
    const { sealed: _sealed, ...entry } = line
    return { ...entry, ...words }
  }

  /** All valid events, oldest first. Corrupt lines are skipped, and a
   *  line that cannot be opened reads as an entry with no words. */
  readAll(): SessionEvent[] {
    return this.readLines().map((line) => {
      const { sealed, ...entry } = this.opened(line)
      return sealed === undefined ? entry : { ...entry, unreadable: true }
    })
  }

  /** Every event for what only measures: nothing is opened, so stats
   *  after a take never pay for decrypting the whole log. */
  readNumbers(): SessionEvent[] {
    return this.readLines().map(({ sealed: _sealed, ...entry }) => entry)
  }

  /** Drop events older than retentionDays. 0 or negative keeps everything. */
  prune(retentionDays: number, now: () => number = () => Date.now()): void {
    if (retentionDays <= 0 || !existsSync(this.file)) return
    const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000
    this.rewrite(this.readLines().filter((e) => e.at >= cutoff))
  }

  /** Take the words out of events older than cutoff, keeping their
   *  numbers. Rewrites the file only when something changes. */
  scrubText(cutoff: number): void {
    const lines = this.readLines()
    const old = (line: StoredEvent): boolean => line.at < cutoff && carriesWords(line)
    if (!lines.some(old)) return
    this.rewrite(lines.map((line) => (old(line) ? wordless(line) : line)))
  }

  /** Put the words back on an entry that lost them (US-137). */
  fillWords(at: number, rawText: string, finalText: string): void {
    this.rewrite(
      this.readLines().map((line) => {
        if (line.at !== at) return line
        const { sealed: _sealed, ...entry } = line
        return this.stored({ ...entry, rawText, finalText })
      })
    )
  }

  /** Apply the Keep history setting (US-137). */
  applyRetention(retentionDays: number, now: () => number = () => Date.now()): void {
    const cutoff = textCutoff(retentionDays, now())
    if (cutoff === null) this.prune(retentionDays, now)
    else this.scrubText(cutoff)
  }

  /** How many events the setting would change right now. */
  countAffected(retentionDays: number, now: number = Date.now()): number {
    const cutoff = textCutoff(retentionDays, now)
    const lines = this.readLines()
    if (cutoff !== null) return lines.filter((line) => line.at < cutoff && carriesWords(line)).length
    if (retentionDays <= 0) return 0
    const oldest = now - retentionDays * 24 * 60 * 60 * 1000
    return lines.filter((line) => line.at < oldest).length
  }

  /** Follow the switch (US-138). The whole file is sealed or opened on
   *  the side, checked, and swapped in at once, so a failure throws and
   *  leaves it as it was; the next launch tries again. New lines follow
   *  the switch either way. Lines no key opens stay sealed. */
  setSealing(on: boolean): void {
    this.wantsSealing = on
    this.sealing = on && (this.seal?.prepare() ?? false)
    if (on && !this.sealing) return
    // A rewrite cut short may have left plain words beside the file.
    if (this.sealing) rmSync(this.tmp, { force: true })
    const lines = this.readLines()
    const next = lines.map((line) => (this.sealing ? this.sealedAndChecked(line) : this.opened(line)))
    if (next.some((line, index) => line !== lines[index])) this.rewrite(next)
  }

  private sealedAndChecked(line: StoredEvent): StoredEvent {
    if (line.sealed !== undefined || !hasText(line) || this.seal === null) return line
    const closed = this.seal.close(line)
    const back = this.seal.open(closed)
    if (back?.rawText !== line.rawText || back.finalText !== line.finalText) throw new Error('a sealed line did not open')
    return closed
  }

  sealStatus(): SealStatus {
    const lines = this.readLines()
    return {
      state: this.sealing ? 'sealed' : this.wantsSealing ? 'unavailable' : 'plain',
      unreadable: lines.filter((line) => line.sealed !== undefined && this.opened(line).sealed !== undefined).length,
      pending: this.sealing ? lines.filter(hasText).length : 0
    }
  }

  private rewrite(lines: StoredEvent[]): void {
    try {
      writeFileSync(this.tmp, lines.map((e) => JSON.stringify(e)).join('\n') + (lines.length ? '\n' : ''))
      renameSync(this.tmp, this.file)
    } catch (error) {
      rmSync(this.tmp, { force: true })
      throw error
    }
  }

  clear(): void {
    writeFileSync(this.file, '')
  }
}
