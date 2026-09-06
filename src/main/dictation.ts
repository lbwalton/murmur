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
import { cancelRecording, playCue, startRecording, stopRecording } from './audio'
import { insertText } from './insertion'
import { getOverlayPhase, refreshOverlayConfig, setOverlayPhase } from './overlay'
import { SMOKE_TRANSCRIPT, transcribeWav } from './transcribe'
import { registerSmokeCheck } from './smoke'

let sessionStartedAt = 0

export function dictationStart(): void {
  const phase = getOverlayPhase()
  if (phase !== 'idle' && phase !== 'inserted' && phase !== 'error' && phase !== 'nospeech') {
    return
  }
  if (!setOverlayPhase('recording')) return
  sessionStartedAt = Date.now()
  startRecording()
  playCue('start')
}

export async function dictationStop(): Promise<void> {
  if (getOverlayPhase() !== 'recording') return
  setOverlayPhase('processing')
  playCue('stop')
  const wav = await stopRecording()
  if (!wav) {
    setOverlayPhase('error')
    playCue('error')
    return
  }

  // Guard one: no speech energy means no upload and nothing inserted.
  // The silent head and tail are then cut before upload: trailing
  // silence is what makes speech models hallucinate a "Thank you."
  // onto the end of real dictations.
  let upload = wav
  try {
    const samples = wavSamples(wav)
    if (!hasSpeechEnergy(samples, TARGET_SAMPLE_RATE)) {
      setOverlayPhase('nospeech')
      playCue('nospeech')
      return
    }
    const { trimSilence } = await import('../shared/speech-gate')
    const { encodeWavPcm16 } = await import('../shared/wav')
    upload = encodeWavPcm16(trimSilence(samples, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)
  } catch {
    setOverlayPhase('error')
    playCue('error')
    return
  }

  const result = await transcribeWav(upload)
  if (!result.ok) {
    setOverlayPhase('error')
    playCue('error')
    return
  }
  // Guard two: empty or hallucinated transcripts never insert.
  if (isHallucination(result.text, hallucinations.phrases)) {
    setOverlayPhase('nospeech')
    playCue('nospeech')
    return
  }

  // Dictionary first (raw text, so capitalization comes after), then
  // deterministic formatting, then the LLM pass at Full level, then the
  // dictionary's exact casing re-asserted over everything. The whole
  // stage fails open to the raw transcript: a broken settings entry or
  // formatter bug must never lose a dictation or wedge the overlay in
  // processing (review gate finding, 2026-09-05).
  let finalText = result.text
  try {
    const { getSettings } = await import('./settings')
    const { applyDictionary, enforceDictionaryCasing } = await import('../shared/dictionary')
    const settings = getSettings()
    const corrected = applyDictionary(result.text, settings.dictionary)
    const formatting = settings.formatting
    const formatted = formatTranscript(
      corrected,
      { level: formatting.level, numbers: formatting.numbers },
      formatSpec as unknown as FormatSpec
    )
    const { maybePolish } = await import('./formatter')
    const { applyExpansions } = await import('../shared/expansions')
    const polished = await maybePolish(formatted)
    const cased = enforceDictionaryCasing(polished, settings.dictionary)
    finalText = applyExpansions(cased, settings.expansions)
  } catch (error) {
    console.error('[murmur] formatting stage failed open to raw transcript:', error)
    finalText = result.text
  }

  try {
    const outcome = await insertText(finalText)
    if (outcome === 'error') {
      setOverlayPhase('error')
      playCue('error')
    } else {
      const { recordSession } = await import('./history')
      const event = recordSession({ startedAt: sessionStartedAt, rawText: result.text, finalText })
      setOverlayPhase('inserted', event?.wpm ?? null)
      playCue('insert')
      // A session can change rank, and rank can change the belt accent.
      refreshOverlayConfig()
    }
  } catch (error) {
    console.error('[murmur] insertion failed:', error)
    setOverlayPhase('error')
    playCue('error')
  }
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
