// SPDX-License-Identifier: GPL-3.0-only
// Insertion at the cursor: clipboard in, platform paste keystroke, then
// a careful restore. Fails open to the clipboard: whatever happens, the
// dictated text is never lost, and focus is never touched. The restore
// is full fidelity: everything on the clipboard (text, images, rich
// flavors) is captured before we touch it and written back wholesale
// afterward, so a screenshot copied before dictating survives. Smoke
// and copy-only mode skip the keystroke entirely.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { ClipboardItem, clipboard } from 'electron'
import { getSettings } from '../settings'
import { isSmoke, registerSmokeCheck } from '../smoke'
import { type SelectionVerdict, copyCommand, judgeSelection, pasteCommand, planRestore } from './plan'

export type InsertOutcome = 'inserted' | 'copied' | 'error'

// How long the paste keystroke gets to be processed before the old
// clipboard comes back. There is no OS signal for "the target app read
// the pasteboard" (reading does not bump the change count), so the
// restore can only outwait the event. 250ms lost that race on a loaded
// system (2026-09-12: a macOS update install starved apps enough that
// the restore landed first and the paste delivered stale content). The
// settle runs in the background and a follow-on insertion flushes it
// early, so the longer wait costs nothing in perceived latency.
const PASTE_SETTLE_MS = 1_500
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

// The one restore in flight. Awaited before any new insertion touches
// the clipboard, so back-to-back dictations can never interleave a
// pending restore with a fresh capture (the restore would clobber the
// successor's text mid-paste).
let pendingRestore: Promise<void> = Promise.resolve()

// Set only while a settle sleep is pending; calling it skips the rest
// of the sleep so a follow-on insertion is never stalled behind it.
let flushSettle: (() => void) | null = null

async function settleAndRestore(captured: Captured, insertedText: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      flushSettle = null
      resolve()
    }, PASTE_SETTLE_MS)
    flushSettle = () => {
      clearTimeout(timer)
      flushSettle = null
      resolve()
    }
  })
  const mode = planRestore(
    { text: captured.text, itemCount: captured.items.length },
    await clipboard.readText().catch(() => ''),
    insertedText
  )
  if (mode === 'items') await restoreClipboard(captured)
  else if (mode === 'text') await clipboard.writeText(captured.text).catch(() => undefined)
}

function sendPasteKeystroke(): Promise<boolean> {
  return runKeystroke(pasteCommand(process.platform))
}

function sendCopyKeystroke(): Promise<boolean> {
  return runKeystroke(copyCommand(process.platform))
}

function runKeystroke(cmd: { file: string; args: string[] } | null): Promise<boolean> {
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

  // Flush any settle still sleeping so this wait is milliseconds, not
  // the remainder of the window. By the time a second dictation reaches
  // here, its predecessor's paste has had a whole record-and-transcribe
  // round to land.
  flushSettle?.()
  await pendingRestore
  const captured = await captureClipboard()

  await clipboard.writeText(text)
  const pasted = await sendPasteKeystroke()
  if (!pasted) {
    // Keystroke failed (permissions, platform): the text stays on the
    // clipboard so the dictation is one manual paste away, never lost.
    return 'copied'
  }

  // Settle and restore in the background: the paste already happened,
  // and holding the overlay in processing for the settle would only
  // delay the inserted feedback. A failed restore never breaks the
  // dictation, but it must be loud in logs.
  pendingRestore = settleAndRestore(captured, text).catch((error) => {
    console.error('[murmur] clipboard restore failed:', error)
  })
  return 'inserted'
}

// How long a copy keystroke gets to land on the clipboard. Apps answer
// Cmd+C in tens of milliseconds, but a loaded system has starved apps
// past a second before (the paste settle's 2026-09-12 lesson), and a
// copy landing after the restore would orphan the selection on the
// user's clipboard. A read that lands returns at once, so only the
// unreadable path pays this wait (review gate 2026-09-22).
const COPY_WAIT_MS = 1_500
const COPY_POLL_MS = 25

export type SelectionRead = SelectionVerdict | { ok: false; reason: 'keystroke' }

/**
 * Read the focused app's selection (US-054): snapshot the clipboard,
 * write a unique marker, send the copy keystroke, and watch for the
 * marker to be replaced. The user's clipboard is put back before this
 * returns, on every path, so the caller holds the selection in memory
 * and the clipboard is theirs again during the model call. A clipboard
 * that holds something other than the marker or the selection by then
 * is a copy the user made, and theirs wins.
 */
export async function readSelection(
  options: { sendCopy?: () => Promise<boolean>; waitMs?: number } = {}
): Promise<SelectionRead> {
  const { sendCopy = isSmoke ? async () => false : sendCopyKeystroke, waitMs = COPY_WAIT_MS } = options
  flushSettle?.()
  await pendingRestore
  const captured = await captureClipboard()
  const marker = `murmur-selection-probe-${randomUUID()}`
  let result: SelectionRead = { ok: false, reason: 'keystroke' }
  try {
    await clipboard.writeText(marker)
    if (!(await sendCopy())) return result
    const deadline = Date.now() + waitMs
    let current = marker
    while (current === marker && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, COPY_POLL_MS))
      current = await clipboard.readText().catch(() => marker)
    }
    result = judgeSelection(marker, current)
    return result
  } finally {
    const now = await clipboard.readText().catch(() => marker)
    const ours = now === marker || (result.ok && now === result.text) || now.trim() === ''
    if (ours) {
      if (captured.items.length > 0 || captured.text) await restoreClipboard(captured)
      else clipboard.clear()
    }
  }
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
      // An empty pre-run clipboard (CI runners) has nothing to restore
      // by design, so the probe text legitimately remains.
      return back === before.text || (before.text === '' && back === 'murmur smoke insertion probe')
    } catch {
      await restoreClipboard(before)
      return false
    }
  })

  registerSmokeCheck('selectionRead', async () => {
    // The selection reader against a simulated copy: a copy that lands
    // is read, a copy that does nothing reads as unreadable, and the
    // clipboard holds exactly what it held before, every time.
    const before = await captureClipboard()
    const probe = 'murmur smoke clipboard before transform'
    try {
      await clipboard.writeText(probe)
      const read = await readSelection({
        sendCopy: async () => {
          await clipboard.writeText('Selected smoke text.')
          return true
        }
      })
      const afterRead = await clipboard.readText()
      const dead = await readSelection({ sendCopy: async () => true, waitMs: 150 })
      const afterDead = await clipboard.readText()
      return (
        read.ok &&
        read.text === 'Selected smoke text.' &&
        afterRead === probe &&
        !dead.ok &&
        dead.reason === 'unchanged' &&
        afterDead === probe
      )
    } finally {
      await restoreClipboard(before)
    }
  })
}
