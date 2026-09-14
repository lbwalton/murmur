// SPDX-License-Identifier: GPL-3.0-only
// The dictation flow: hotkey events drive recording, transcription, and
// the overlay. Until insertion lands (US-011) the final text is placed
// on the clipboard, so a dictation is never silently lost.
import { clipboard } from 'electron'
import formatSpec from '../../shared/format-spec.json'
import { type FormatSpec, formatTranscript } from '../shared/formatter'
import hallucinations from '../shared/hallucinations.json'
import { hasSpeechEnergy, isHallucination, stripTrailingHallucinations } from '../shared/speech-gate'
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
    // The overlay can only say error; the log must say why. An auth
    // failure after a provider switch was undiagnosable without this
    // (live-found 2026-09-14: a Groq key sent to OpenAI showed the
    // same silent error pill as a dead microphone).
    try {
      const { getSettings } = await import('./settings')
      const { writeAppLog } = await import('./window-watch')
      const provider = getSettings().provider
      const hint =
        result.kind === 'auth'
          ? ' hint=the saved API key does not authenticate at this base URL; each provider needs its own key'
          : ''
      writeAppLog(
        `[transcribe] failed kind=${result.kind} detail=${result.detail} model=${provider.sttModel} baseUrl=${provider.baseUrl}${hint}`
      )
    } catch {
      // Diagnostics must never turn a failed dictation into a crash.
    }
    setOverlayPhase('error')
    playCue('error')
    return
  }
  // Guard two: empty or hallucinated transcripts never insert, and a
  // hallucinated tail appended to real speech is cut before formatting.
  if (isHallucination(result.text, hallucinations.phrases)) {
    setOverlayPhase('nospeech')
    playCue('nospeech')
    return
  }
  // Trailing artifact strip uses ONLY the never-genuinely-spoken subset
  // (review gate: a real spoken thank-you sign-off must survive), and
  // history records the transcript as heard, before any stripping.
  const heardText = result.text
  const cleanedText = stripTrailingHallucinations(heardText, hallucinations.artifactTails)

  // Dictionary first (raw text, so capitalization comes after), then
  // deterministic formatting, then the LLM pass at Full level, then the
  // dictionary's exact casing re-asserted over everything. The whole
  // stage fails open to the raw transcript: a broken settings entry or
  // formatter bug must never lose a dictation or wedge the overlay in
  // processing (review gate finding, 2026-09-05).
  let finalText = cleanedText
  try {
    const { getSettings } = await import('./settings')
    const { applyDictionary, enforceDictionaryCasing } = await import('../shared/dictionary')
    const settings = getSettings()
    const corrected = applyDictionary(cleanedText, settings.dictionary)
    const formatting = settings.formatting
    const formatted = formatTranscript(
      corrected,
      { level: formatting.level, numbers: formatting.numbers, smartLists: formatting.smartLists },
      formatSpec as unknown as FormatSpec
    )
    const { maybePolish } = await import('./formatter')
    const { applyExpansions } = await import('../shared/expansions')
    const polished = await maybePolish(formatted)
    const cased = enforceDictionaryCasing(polished, settings.dictionary)
    finalText = applyExpansions(cased, settings.expansions)
  } catch (error) {
    console.error('[murmur] formatting stage failed open to raw transcript:', error)
    finalText = cleanedText
  }

  try {
    const outcome = await insertText(finalText)
    if (outcome === 'error') {
      setOverlayPhase('error')
      playCue('error')
    } else {
      const { recordSession } = await import('./history')
      const event = recordSession({ startedAt: sessionStartedAt, rawText: heardText, finalText })
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

/**
 * Paste the newest history entry at the cursor: the paste-last chord's
 * action. Rides the whole insertion pipeline (clipboard capture,
 * keystroke, settle, restore, copy-mode fallback). A live dictation
 * owns the pipeline, so recording and processing ignore the chord.
 */
export async function pasteLastDictation(): Promise<void> {
  const phase = getOverlayPhase()
  if (phase === 'recording' || phase === 'processing') return
  const { readHistory } = await import('./history')
  const events = readHistory()
  const last = events[events.length - 1]
  if (!last || last.finalText.length === 0) {
    playCue('nospeech')
    return
  }
  try {
    const outcome = await insertText(last.finalText)
    if (outcome === 'error') playCue('error')
    else playCue('insert')
  } catch (error) {
    console.error('[murmur] paste last dictation failed:', error)
    playCue('error')
  }
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

  registerSmokeCheck('pasteLast', async () => {
    // The chord's action end to end on the synthetic pipeline: newest
    // history entry lands on the clipboard (smoke insertion is copy
    // mode). The history smoke probe has already appended an entry.
    const clipboardBefore = await clipboard.readText()
    try {
      const { readHistory, recordSession } = await import('./history')
      recordSession({
        startedAt: Date.now() - 2_000,
        rawText: 'paste last smoke probe',
        finalText: 'Paste last smoke probe.'
      })
      await pasteLastDictation()
      const delivered = await clipboard.readText()
      const events = readHistory()
      return delivered === 'Paste last smoke probe.' && events[events.length - 1]?.finalText === delivered
    } finally {
      await clipboard.writeText(clipboardBefore)
    }
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
