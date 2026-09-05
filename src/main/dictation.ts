// SPDX-License-Identifier: GPL-3.0-only
// The dictation flow: hotkey events drive recording, transcription, and
// the overlay. Until insertion lands (US-011) the final text is placed
// on the clipboard, so a dictation is never silently lost.
import { clipboard } from 'electron'
import { cancelRecording, startRecording, stopRecording } from './audio'
import { insertText } from './insertion'
import { getOverlayPhase, setOverlayPhase } from './overlay'
import { SMOKE_TRANSCRIPT, transcribeWav } from './transcribe'
import { registerSmokeCheck } from './smoke'

export function dictationStart(): void {
  const phase = getOverlayPhase()
  if (phase !== 'idle' && phase !== 'inserted' && phase !== 'error' && phase !== 'nospeech') {
    return
  }
  if (!setOverlayPhase('recording')) return
  startRecording()
}

export async function dictationStop(): Promise<void> {
  if (getOverlayPhase() !== 'recording') return
  setOverlayPhase('processing')
  const wav = await stopRecording()
  if (!wav) {
    setOverlayPhase('error')
    return
  }

  const result = await transcribeWav(wav)
  if (!result.ok) {
    setOverlayPhase('error')
    return
  }
  if (result.text.trim().length === 0) {
    setOverlayPhase('nospeech')
    return
  }

  // Formatting (US-013+) slots in here before delivery.
  const outcome = await insertText(result.text)
  setOverlayPhase(outcome === 'error' ? 'error' : 'inserted')
}

export function dictationCancel(): void {
  cancelRecording()
  setOverlayPhase('idle')
}

export function initDictation(): void {
  registerSmokeCheck('dictationLoop', async () => {
    // Full loop against the synthetic mic and mock provider: record,
    // stop, transcribe, deliver. The user clipboard is restored after.
    const clipboardBefore = await clipboard.readText()
    try {
      dictationStart()
      if (getOverlayPhase() !== 'recording') return false
      await new Promise((resolve) => setTimeout(resolve, 500))
      await dictationStop()
      const delivered = await clipboard.readText()
      return getOverlayPhase() === 'inserted' && delivered === SMOKE_TRANSCRIPT
    } finally {
      await clipboard.writeText(clipboardBefore)
    }
  })
}
