// SPDX-License-Identifier: GPL-3.0-only
// Failed transcriptions never lose audio: the WAV lands here, capped to
// the most recent files so the folder cannot grow without bound. Beside
// each WAV a small record says what the take was and why it failed, so
// the home tab can offer it back for a retry (US-068). Takes saved
// before those records existed still list, as dictations.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RECOVERY_KEEP = 20

export type TakeKind = 'dictation' | 'note' | 'transform'

export interface TakeFailure {
  /** The transcription error kind (auth, network, timeout, server,
   *  badrequest), or nospeech when a retry heard nothing. */
  kind: string
  detail: string
}

/** What a live take knows about itself when its transcription fails. */
export interface TakeRecord {
  kind: TakeKind
  /** When the hotkey went down. */
  startedAt: number
  failure: TakeFailure
}

/** A saved take as the home tab sees it. No audio, no words. */
export interface WaitingTake {
  id: string
  /** When the take failed and was saved: the time it is logged at. */
  savedAt: number
  startedAt: number
  /** Length of the saved audio (silence already trimmed). */
  audioMs: number
  kind: TakeKind
  /** Null for a take saved before records existed. */
  failure: TakeFailure | null
}

const ID = /^recovery-(\d{10,16})$/

function wavPath(dir: string, id: string): string {
  if (!ID.test(id)) throw new Error('not a recovery id')
  return join(dir, `${id}.wav`)
}

function recordPath(dir: string, id: string): string {
  if (!ID.test(id)) throw new Error('not a recovery id')
  return join(dir, `${id}.json`)
}

/** Save a WAV (and, for a live take, its record) into the recovery
 *  folder. Returns the WAV's path. */
export function saveRecovery(
  wav: Uint8Array,
  dir: string,
  options: { now?: () => number; take?: TakeRecord } = {}
): string {
  mkdirSync(dir, { recursive: true })
  const id = `recovery-${(options.now ?? Date.now)()}`
  const file = wavPath(dir, id)
  writeFileSync(file, wav)
  if (options.take) writeFileSync(recordPath(dir, id), JSON.stringify(options.take))
  pruneRecovery(dir)
  return file
}

/** Keep only the newest RECOVERY_KEEP takes (names sort by timestamp),
 *  and drop any record whose audio is gone. */
export function pruneRecovery(dir: string): void {
  const names = readdirSync(dir)
  const takes = names
    .filter((name) => /^recovery-\d+\.wav$/.test(name))
    .map((name) => name.slice(0, -'.wav'.length))
    .sort()
  const dropped = new Set(takes.slice(0, Math.max(0, takes.length - RECOVERY_KEEP)))
  const kept = new Set(takes.filter((id) => !dropped.has(id)))
  for (const name of names) {
    const match = /^(recovery-\d+)\.(wav|json)$/.exec(name)
    if (!match) continue
    if (dropped.has(match[1]) || (match[2] === 'json' && !kept.has(match[1]))) {
      rmSync(join(dir, name), { force: true })
    }
  }
}

/** Audio length from a PCM WAV header: data bytes over byte rate. */
export function wavDurationMs(wav: Uint8Array): number {
  if (wav.length < 12) return 0
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const ascii = (offset: number): string =>
    String.fromCharCode(wav[offset], wav[offset + 1], wav[offset + 2], wav[offset + 3])
  if (ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') return 0
  let byteRate = 0
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = ascii(offset)
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ' && offset + 20 <= wav.length) byteRate = view.getUint32(offset + 16, true)
    if (id === 'data') {
      const bytes = Math.min(size, wav.length - offset - 8)
      return byteRate > 0 ? Math.round((bytes / byteRate) * 1000) : 0
    }
    offset += 8 + size + (size % 2)
  }
  return 0
}

function readRecord(dir: string, id: string): TakeRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(recordPath(dir, id), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const r = parsed as Record<string, unknown>
    const kind = r.kind === 'note' || r.kind === 'transform' ? r.kind : 'dictation'
    const failure = r.failure as Record<string, unknown> | undefined
    return {
      kind,
      startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
      failure: {
        kind: typeof failure?.kind === 'string' ? failure.kind : 'unknown',
        detail: typeof failure?.detail === 'string' ? failure.detail : ''
      }
    }
  } catch {
    return null
  }
}

/** One saved take, or null when its audio is gone or the id is bad. */
export function getRecovery(dir: string, id: string): WaitingTake | null {
  const match = ID.exec(id)
  if (!match || !existsSync(join(dir, `${id}.wav`))) return null
  const savedAt = Number(match[1])
  const audioMs = wavDurationMs(readFileSync(wavPath(dir, id)))
  const record = readRecord(dir, id)
  return {
    id,
    savedAt,
    startedAt: record && record.startedAt > 0 ? record.startedAt : savedAt - audioMs,
    audioMs,
    kind: record?.kind ?? 'dictation',
    failure: record?.failure ?? null
  }
}

/** Every waiting take, newest first. */
export function listRecovery(dir: string): WaitingTake[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^recovery-\d+\.wav$/.test(name))
    .map((name) => getRecovery(dir, name.slice(0, -'.wav'.length)))
    .filter((take): take is WaitingTake => take !== null)
    .sort((a, b) => b.savedAt - a.savedAt)
}

export function readRecoveryWav(dir: string, id: string): Uint8Array {
  return new Uint8Array(readFileSync(wavPath(dir, id)))
}

/** Record why a retry failed, keeping the take's kind and start. */
export function markRecoveryFailed(dir: string, id: string, failure: TakeFailure): void {
  const take = getRecovery(dir, id)
  if (!take) return
  const record: TakeRecord = { kind: take.kind, startedAt: take.startedAt, failure }
  writeFileSync(recordPath(dir, id), JSON.stringify(record))
}

/** Delete a take's audio and record. */
export function removeRecovery(dir: string, id: string): void {
  rmSync(wavPath(dir, id), { force: true })
  rmSync(recordPath(dir, id), { force: true })
}
