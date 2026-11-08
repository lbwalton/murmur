// SPDX-License-Identifier: GPL-3.0-only
// A write that survives a power cut: the text reaches the disk in a temp
// file, the rename swaps it in whole, and the folder records the rename.
// Without the first step a cut can leave an empty file under the real
// name. A failure throws with the old file in place and no temp left.
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function writeDurably(file: string, tmp: string, text: string, mode?: number): void {
  try {
    const handle = openSync(tmp, 'w', mode)
    try {
      writeFileSync(handle, text)
      fsyncSync(handle)
    } finally {
      closeSync(handle)
    }
    renameSync(tmp, file)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
  // Windows cannot open a folder this way, so there the rename is as far
  // as this goes.
  if (process.platform === 'win32') return
  const folder = openSync(dirname(file), 'r')
  try {
    fsyncSync(folder)
  } finally {
    closeSync(folder)
  }
}
