// SPDX-License-Identifier: GPL-3.0-only
// Insertion at the cursor: clipboard in, platform paste keystroke, then
// a careful restore. Fails open to the clipboard: whatever happens, the
// dictated text is never lost, and focus is never touched. The restore
// is full fidelity: everything on the clipboard (text, images, rich
// flavors) is captured before we touch it and written back wholesale
// afterward, so a screenshot copied before dictating survives. Smoke
// and copy-only mode skip the keystroke entirely.
import { execFile } from 'node:child_process'
import { ClipboardItem, clipboard } from 'electron'
import { getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { pasteCommand, planRestore } from './plan'

export type InsertOutcome = 'inserted' | 'copied' | 'error'

const PASTE_SETTLE_MS = 250
const KEYSTROKE_TIMEOUT_MS = 3_000
// A clipboard payload beyond this is not worth holding in memory for
// the restore; the text fallback still applies.
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024

type Payload = Blob | Electron.ClipboardBookmark

interface Captured {
  text: string
  items: Array<Record<string, Payload>>
}

// Payloads must be materialized BEFORE the clipboard is overwritten:
// getType reads lazily from the platform pasteboard, and after our
// write there is nothing left to read.
async function captureClipboard(): Promise<Captured> {
  const text = await clipboard.readText().catch(() => '')
  try {
    const items = await clipboard.read()
    const resolved: Array<Record<string, Payload>> = []
    let bytes = 0
    for (const item of items) {
      const entry: Record<string, Payload> = {}
      for (const type of item.types) {
        const payload: Payload = await item.getType(type)
        if (payload instanceof Blob) bytes += payload.size
        entry[type] = payload
      }
      resolved.push(entry)
    }
    if (bytes > MAX_SNAPSHOT_BYTES) return { text, items: [] }
    return { text, items: resolved }
  } catch {
    return { text, items: [] }
  }
}

async function restoreClipboard(captured: Captured): Promise<void> {
  try {
    if (captured.items.length > 0) {
      await clipboard.write(captured.items.map((entry) => new ClipboardItem(entry)))
      return
    }
  } catch (error) {
    // Wholesale restore failed; the text fallback below still applies.
    console.error('[murmur] clipboard restore fell back to text:', error)
  }
  if (captured.text) await clipboard.writeText(captured.text).catch(() => undefined)
}

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

  const captured = await captureClipboard()

  await clipboard.writeText(text)
  const pasted = await sendPasteKeystroke()
  if (!pasted) {
    // Keystroke failed (permissions, platform): the text stays on the
    // clipboard so the dictation is one manual paste away, never lost.
    return 'copied'
  }

  await new Promise((resolve) => setTimeout(resolve, PASTE_SETTLE_MS))
  const mode2 = planRestore(
    { text: captured.text, itemCount: captured.items.length },
    await clipboard.readText(),
    text
  )
  if (mode2 === 'items') await restoreClipboard(captured)
  else if (mode2 === 'text') await clipboard.writeText(captured.text).catch(() => undefined)
  return 'inserted'
}

export function initInsertion(): void {
  registerSmokeCheck('insertion', async () => {
    // Copy path end to end, plus a full capture-and-restore round trip
    // on whatever the machine clipboard holds; the keystroke path is
    // never fired in smoke (it would paste into the user's focus).
    const before = await captureClipboard()
    try {
      const outcome = await insertText('murmur smoke insertion probe')
      const onClipboard = await clipboard.readText()
      if (!(outcome === 'copied' && onClipboard === 'murmur smoke insertion probe')) return false
      await restoreClipboard(before)
      const back = await clipboard.readText()
      return back === before.text
    } catch {
      await restoreClipboard(before)
      return false
    }
  })
}
