// SPDX-License-Identifier: GPL-3.0-only
// The dictation flow: hotkey events drive recording and the overlay.
// Transcription and insertion join this pipeline in US-010 and US-011.
import { cancelRecording, startRecording, stopRecording } from './audio'
import { getOverlayPhase, setOverlayPhase } from './overlay'

export function dictationStart(): void {
  if (getOverlayPhase() !== 'idle') {
    // A previous session is still wrapping up; let its linger finish.
    if (getOverlayPhase() !== 'inserted' && getOverlayPhase() !== 'error' && getOverlayPhase() !== 'nospeech') {
      return
    }
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
  // US-010 sends the WAV to the transcription provider. Until then the
  // pipeline ends quietly without claiming an insertion happened.
  setOverlayPhase('idle')
}

export function dictationCancel(): void {
  cancelRecording()
  setOverlayPhase('idle')
}
