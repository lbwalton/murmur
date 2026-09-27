// SPDX-License-Identifier: GPL-3.0-only
// Retrying failed takes (US-068). A take whose transcription failed waits
// in the recovery folder with a record of what it was; the home tab lists
// it with Retry and Discard. A retry runs the saved audio through the
// live pipeline with current settings and delivers it without a cursor
// (see deliverRetried). Retries run one at a time, so Retry all and a
// double click can never deliver the same take twice, and the audio is
// removed only after its words are safe.
import { type BrowserWindow, clipboard, ipcMain } from 'electron'
import { deliverRetried } from './dictation'
import { readHistory } from './history'
import { isSmoke, registerSmokeCheck } from './smoke'
import { recoveryDir, setRecoveryListener, transcribeWav } from './transcribe'
import {
  type WaitingTake,
  getRecovery,
  listRecovery,
  markRecoveryFailed,
  readRecoveryWav,
  removeRecovery,
  saveRecovery
} from './transcribe/recovery'

export type RetryResult =
  | { ok: true; kind: WaitingTake['kind']; words: number; location: string }
  | { ok: false; failure: { kind: string; detail: string } }

let getTargetWindow: () => BrowserWindow | null = () => null
let queue: Promise<unknown> = Promise.resolve()

async function log(line: string): Promise<void> {
  try {
    const { writeAppLog } = await import('./window-watch')
    writeAppLog(`[retry] ${line}`)
  } catch {
    // Diagnostics stay best-effort.
  }
}

/** Tell the settings window the waiting list changed. Only that window
 *  hears about takes, never the overlay or audio windows. */
function notifyChanged(): void {
  const win = getTargetWindow()
  if (win && !win.isDestroyed()) win.webContents.send('recovery:changed')
}

async function retryNow(id: string): Promise<RetryResult> {
  const dir = recoveryDir()
  const take = getRecovery(dir, id)
  if (!take) return { ok: false, failure: { kind: 'gone', detail: 'already delivered or discarded' } }
  const result = await transcribeWav(readRecoveryWav(dir, id), false)
  if (!result.ok) {
    markRecoveryFailed(dir, id, { kind: result.kind, detail: result.detail })
    await log(`outcome=failed kind=${take.kind} reason=${result.kind}`)
    notifyChanged()
    return { ok: false, failure: { kind: result.kind, detail: result.detail } }
  }
  const delivered = await deliverRetried(take, result.text)
  if (!delivered.ok) {
    markRecoveryFailed(dir, id, delivered.failure)
    await log(`outcome=failed kind=${take.kind} reason=${delivered.failure.kind}`)
    notifyChanged()
    return delivered
  }
  removeRecovery(dir, id)
  await log(`outcome=delivered kind=${take.kind} location=${delivered.location} words=${delivered.words}`)
  notifyChanged()
  return { ok: true, kind: take.kind, words: delivered.words, location: delivered.location }
}

/** Retry one take, after any retry already running. */
export function retryTake(id: string): Promise<RetryResult> {
  const next = queue.then(() => retryNow(id))
  queue = next.catch(() => undefined)
  return next.catch(async (error) => {
    console.error('[murmur] retry threw:', error)
    await log('outcome=error')
    return { ok: false as const, failure: { kind: 'error', detail: 'the retry failed unexpectedly' } }
  })
}

export function discardTake(id: string): void {
  removeRecovery(recoveryDir(), id)
  void log('discarded')
  notifyChanged()
}

const asId = (value: unknown): string | null =>
  typeof value === 'string' && /^recovery-\d{10,16}$/.test(value) ? value : null

export function initRetry(settingsWindow: () => BrowserWindow | null): void {
  getTargetWindow = settingsWindow
  setRecoveryListener(notifyChanged)

  ipcMain.handle('recovery:list', () => listRecovery(recoveryDir()))
  ipcMain.handle('recovery:retry', (_event, id: unknown) => {
    const valid = asId(id)
    if (!valid) return { ok: false, failure: { kind: 'gone', detail: 'not a saved take' } }
    return retryTake(valid)
  })
  ipcMain.handle('recovery:discard', (_event, id: unknown) => {
    const valid = asId(id)
    if (valid) discardTake(valid)
    return listRecovery(recoveryDir())
  })

  registerSmokeCheck('retry', async () => {
    // The hermetic smoke profile only: a failed take is saved, listed,
    // retried into history and the clipboard with its audio removed; a
    // take saved before records existed lists as a dictation; discard
    // deletes; an id that could leave the folder is refused.
    if (!isSmoke) return false
    const { encodeWavPcm16 } = await import('../shared/wav')
    const dir = recoveryDir()
    const wav = encodeWavPcm16(new Float32Array(16000), 16000)
    const savedAt = 1_790_000_000_000
    saveRecovery(wav, dir, {
      now: () => savedAt,
      take: { kind: 'dictation', startedAt: savedAt - 3000, failure: { kind: 'auth', detail: 'no API key configured' } }
    })
    const id = `recovery-${savedAt}`
    const listed = listRecovery(dir).find((t) => t.id === id)
    const listedOk = listed?.kind === 'dictation' && listed.audioMs === 1000 && listed.failure?.kind === 'auth'

    const clipboardBefore = await clipboard.readText()
    const [first, second] = await Promise.all([retryTake(id), retryTake(id)])
    const last = readHistory().at(-1)
    const onClipboard = await clipboard.readText()
    const deliveredOk =
      first.ok &&
      !second.ok &&
      second.failure.kind === 'gone' &&
      last?.retried === true &&
      last.at === savedAt &&
      last.rawText.length > 0 &&
      onClipboard === last.finalText &&
      getRecovery(dir, id) === null
    await clipboard.writeText(clipboardBefore)

    // A note files like a live note (the smoke profile has no notes
    // folder, so murmur's own data folder takes it); a transform keeps
    // its instruction unsent, since the selection it was for is gone.
    const routed: Array<[WaitingTake['kind'], number]> = [
      ['note', savedAt + 10_000],
      ['transform', savedAt + 20_000]
    ]
    let routedOk = true
    for (const [kind, at] of routed) {
      saveRecovery(wav, dir, {
        now: () => at,
        take: { kind, startedAt: at - 2000, failure: { kind: 'network', detail: 'fetch failed' } }
      })
      const result = await retryTake(`recovery-${at}`)
      const entry = readHistory().at(-1)
      routedOk &&=
        result.ok &&
        result.kind === kind &&
        entry?.kind === kind &&
        entry.retried === true &&
        entry.at === at &&
        (kind !== 'note' || result.location === 'fallback') &&
        (kind !== 'transform' || entry.unsent === true)
    }

    const legacyAt = savedAt + 60_000
    saveRecovery(wav, dir, { now: () => legacyAt })
    const legacy = getRecovery(dir, `recovery-${legacyAt}`)
    const legacyOk = legacy?.kind === 'dictation' && legacy.failure === null && legacy.startedAt === legacyAt - 1000
    discardTake(`recovery-${legacyAt}`)
    const discardOk = getRecovery(dir, `recovery-${legacyAt}`) === null

    let refused = false
    try {
      readRecoveryWav(dir, '../settings')
    } catch {
      refused = true
    }
    return listedOk && deliveredOk && routedOk && legacyOk && discardOk && refused && asId('../x') === null
  })
}
