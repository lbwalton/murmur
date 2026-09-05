// SPDX-License-Identifier: GPL-3.0-only
// The dictation flow: hotkey events drive recording, transcription, and
// the overlay. Until insertion lands (US-011) the final text is placed
// on the clipboard, so a dictation is never silently lost.
import { clipboard } from 'electron'
import formatSpec from '../../shared/format-spec.json'
import { type FormatSpec, formatTranscript } from '../shared/formatter'
import hallucinations from '../shared/hallucinations.json'
import { hasSpeechEnergy, isHallucination } from '../shared/speech-gate'
import { TARGET_SAMPLE_RATE, wavSamples } from '../shared/wav'
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

  // Guard one: no speech energy means no upload and nothing inserted.
  try {
    if (!hasSpeechEnergy(wavSamples(wav), TARGET_SAMPLE_RATE)) {
      setOverlayPhase('nospeech')
      return
    }
  } catch {
    setOverlayPhase('error')
    return
  }

  const result = await transcribeWav(wav)
  if (!result.ok) {
    setOverlayPhase('error')
    return
  }
  // Guard two: empty or hallucinated transcripts never insert.
  if (isHallucination(result.text, hallucinations.phrases)) {
    setOverlayPhase('nospeech')
    return
  }

  // Deterministic formatting always runs; the LLM pass (US-014) layers
  // on top and falls back to this output on any failure.
  const { getSettings } = await import('./settings')
  const formatting = getSettings().formatting
  const formatted = formatTranscript(
    result.text,
    { level: formatting.level, numbers: formatting.numbers },
    formatSpec as unknown as FormatSpec
  )

  const outcome = await insertText(formatted)
  setOverlayPhase(outcome === 'error' ? 'error' : 'inserted')
}

export function dictationCancel(): void {
  cancelRecording()
  setOverlayPhase('idle')
}

export function initDictation(): void {
  registerSmokeCheck('silenceGuard', async () => {
    const { encodeWavPcm16 } = await import('../shared/wav')
    const silent = encodeWavPcm16(new Float32Array(TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)
    return (
      !hasSpeechEnergy(wavSamples(silent), TARGET_SAMPLE_RATE) &&
      isHallucination('Thank you.', hallucinations.phrases) &&
      !isHallucination('send the invoice tomorrow', hallucinations.phrases)
    )
  })

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
      const { getSettings } = await import('./settings')
      const expected = formatTranscript(
        SMOKE_TRANSCRIPT,
        getSettings().formatting,
        formatSpec as unknown as FormatSpec
      )
      return getOverlayPhase() === 'inserted' && delivered === expected && delivered.endsWith('.')
    } finally {
      await clipboard.writeText(clipboardBefore)
    }
  })
}
