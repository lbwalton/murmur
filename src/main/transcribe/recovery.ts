// SPDX-License-Identifier: GPL-3.0-only
// Failed transcriptions never lose audio: the WAV lands here, capped to
// the most recent files so the folder cannot grow without bound.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RECOVERY_KEEP = 20

/** Save a WAV into the recovery folder. Returns the file path. */
export function saveRecovery(
  wav: Uint8Array,
  dir: string,
  now: () => number = () => Date.now()
): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `recovery-${now()}.wav`)
  writeFileSync(file, wav)
  pruneRecovery(dir)
  return file
}

/** Keep only the newest RECOVERY_KEEP files (names sort by timestamp). */
export function pruneRecovery(dir: string): void {
  const files = readdirSync(dir)
    .filter((name) => /^recovery-\d+\.wav$/.test(name))
    .sort()
  for (const name of files.slice(0, Math.max(0, files.length - RECOVERY_KEEP))) {
    rmSync(join(dir, name), { force: true })
  }
}
