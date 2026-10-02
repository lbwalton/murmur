// SPDX-License-Identifier: GPL-3.0-only
// File moves in the notes folder that a planted link cannot redirect
// (US-072). A vault shared through git or a sync service can carry
// symbolic links written by someone else; murmur must never write
// through one, or hand one to the OS to launch.
import { realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'

/** Replace a file's whole text through a temp file beside it. Whatever
 *  already sits at the temp path (a link planted there) is removed, and
 *  the temp file is created exclusively, so a link raced back in fails
 *  the write instead of being followed. */
export function replaceViaTemp(file: string, text: string): void {
  const tmp = `${file}.murmur-tmp`
  rmSync(tmp, { force: true })
  try {
    writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' })
    renameSync(tmp, file)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/** Whether a notes path may be opened in the OS default app: after
 *  following any links it must land on a regular .md or .txt file, so a
 *  link to an app or a script is never launched. */
export function openableNote(file: string): boolean {
  try {
    const real = realpathSync(file)
    return /\.(md|txt)$/i.test(real) && statSync(real).isFile()
  } catch {
    return false
  }
}
