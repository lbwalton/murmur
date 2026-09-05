// SPDX-License-Identifier: GPL-3.0-only
// Insertion at the cursor: clipboard in, platform paste keystroke, then
// a careful restore. Fails open to the clipboard: whatever happens, the
// dictated text is never lost, and focus is never touched. Smoke and
// copy-only mode skip the keystroke entirely.
import { execFile } from 'node:child_process'
import { clipboard } from 'electron'
import { getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { pasteCommand, planRestore } from './plan'

export type InsertOutcome = 'inserted' | 'copied' | 'error'

const PASTE_SETTLE_MS = 250
const KEYSTROKE_TIMEOUT_MS = 3_000

function sendPasteKeystroke(): Promise<boolean> {
  const cmd = pasteCommand(process.platform)
  if (!cmd) return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile(cmd.file, cmd.args, { timeout: KEYSTROKE_TIMEOUT_MS }, (error) => {
      resolve(!error)
    })
  })
}

/**
 * Deliver final text to the focused app. Paste mode does the clipboard
 * dance; copy mode (setting, smoke, or keystroke failure) leaves the
 * text on the clipboard for a manual paste.
 */
export async function insertText(text: string): Promise<InsertOutcome> {
  const mode = getSettings().insertion.mode
  if (mode === 'copy' || isSmoke) {
    await clipboard.writeText(text)
    return 'copied'
  }

  const items = await clipboard.read().catch(() => [])
  const snapshot = {
    text: await clipboard.readText(),
    hasNonText: items.some((item) => item.types.some((t) => !t.startsWith('text/')))
  }

  await clipboard.writeText(text)
  const pasted = await sendPasteKeystroke()
  if (!pasted) {
    // Keystroke failed (permissions, platform): the text stays on the
    // clipboard so the dictation is one manual paste away, never lost.
    return 'copied'
  }

  await new Promise((resolve) => setTimeout(resolve, PASTE_SETTLE_MS))
  const plan = planRestore(snapshot, await clipboard.readText(), text)
  if (plan.restore) await clipboard.writeText(plan.value)
  return 'inserted'
}

export function initInsertion(): void {
  registerSmokeCheck('insertion', async () => {
    // Copy path end to end; the keystroke path is never fired in smoke
    // (it would paste into whatever the user has focused).
    const before = await clipboard.readText()
    try {
      const outcome = await insertText('murmur smoke insertion probe')
      const onClipboard = await clipboard.readText()
      return outcome === 'copied' && onClipboard === 'murmur smoke insertion probe'
    } finally {
      await clipboard.writeText(before)
    }
  })
}
