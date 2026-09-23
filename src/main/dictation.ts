// SPDX-License-Identifier: GPL-3.0-only
// The dictation flow: hotkey events drive recording, transcription, and
// the overlay. Until insertion lands (US-011) the final text is placed
// on the clipboard, so a dictation is never silently lost.
import { clipboard } from 'electron'
import formatSpec from '../../shared/format-spec.json'
import { type FormatSpec, formatTranscript } from '../shared/formatter'
import hallucinations from '../shared/hallucinations.json'
import {
  hasSpeechEnergy,
  isDeadStream,
  isHallucination,
  peakLevel,
  stripTrailingHallucinations
} from '../shared/speech-gate'
import { TARGET_SAMPLE_RATE, wavSamples } from '../shared/wav'
import { cancelRecording, playCue, rearmCapture, startRecording, stopRecording } from './audio'
import { NOTE_FOLDER_HINT } from '../shared/notes'
import { resolveTransformConnection } from './formatter'
import { getSettings } from './settings'
import { insertText } from './insertion'
import { notesConfigured, saveNote } from './notes'
import { rememberForSort, sortNote } from './notes/sorter'
import {
  getOverlayPhase,
  getOverlayState,
  refreshOverlayConfig,
  setOverlayPhase,
  showOverlayHint
} from './overlay'
import { SMOKE_TRANSCRIPT, transcribeWav } from './transcribe'
import { TRANSFORM_NO_CONNECTION_HINT, performTransform } from './transform'
import { registerSmokeCheck } from './smoke'

/** Where a session's words go: the cursor, a notes file (US-050), or
 *  an instruction for the selected text (US-054). */
export type DictationKind = 'dictation' | 'note' | 'transform'

let sessionStartedAt = 0
// The chord that started the live session owns it: a hold on the other
// chord during a take must not stop it (each chord runs its own trigger
// machine, and both machines call in here).
let sessionKind: DictationKind = 'dictation'

// One content-free breadcrumb per dictation outcome. Never transcript
// text, never key material; failures here never break a dictation.
async function logDictation(line: string): Promise<void> {
  try {
    const { writeAppLog } = await import('./window-watch')
    writeAppLog(`[dictation] ${line}`)
  } catch {
    // Diagnostics stay best-effort.
  }
}

/** Start a session. Returns false when nothing began (another session
 *  is live, or the note chord has no folder yet), so a toggle trigger
 *  does not flip to active over a press that did nothing. */
export function dictationStart(kind: DictationKind = 'dictation'): boolean {
  const phase = getOverlayPhase()
  if (
    phase !== 'idle' &&
    phase !== 'inserted' &&
    phase !== 'error' &&
    phase !== 'nospeech' &&
    phase !== 'hint'
  ) {
    return false
  }
  if (kind === 'note' && !notesConfigured()) {
    // A chord that does nothing looks broken. Say what is missing.
    showOverlayHint(NOTE_FOLDER_HINT, 'note')
    playCue('nospeech')
    void logDictation('note chord pressed with no notes folder set')
    return false
  }
  if (kind === 'transform' && !resolveTransformConnection(getSettings())) {
    // Same rule: a transform with no model to run on says so before
    // the user spends a sentence on it.
    showOverlayHint(TRANSFORM_NO_CONNECTION_HINT, 'transform')
    playCue('nospeech')
    void logDictation('transform chord pressed with no model connection')
    return false
  }
  if (!setOverlayPhase('recording', null, { mode: kind })) return false
  sessionKind = kind
  sessionStartedAt = Date.now()
  startRecording()
  playCue(kind === 'note' ? 'noteStart' : 'start')
  return true
}

export async function dictationStop(kind: DictationKind = 'dictation'): Promise<void> {
  if (getOverlayPhase() !== 'recording') return
  if (sessionKind !== kind) return
  setOverlayPhase('processing')
  playCue('stop')
  const wav = await stopRecording()
  if (!wav) {
    void logDictation('capture-failed')
    setOverlayPhase('error')
    playCue('error')
    return
  }

  // Guard one: no speech energy means no upload and nothing inserted.
  // The silent head and tail are then cut before upload: trailing
  // silence is what makes speech models hallucinate a "Thank you."
  // onto the end of real dictations.
  // Peak level makes every outcome diagnosable: near zero on nospeech
  // means the mic delivered nothing (muted, hijacked device); a faint
  // peak on a delivered dictation is the Whisper hallucination zone.
  let peak = 0
  let upload = wav
  try {
    const samples = wavSamples(wav)
    peak = peakLevel(samples)
    if (!hasSpeechEnergy(samples, TARGET_SAMPLE_RATE)) {
      void logDictation(
        `nospeech durationMs=${Date.now() - sessionStartedAt} peak=${peak.toFixed(4)}`
      )
      // A dead stream, not a quiet human (see DEAD_STREAM_PEAK). The
      // chunk watchdog cannot see this (chunks flow, they are just
      // silent), so heal here: re-arm now and the NEXT press gets a
      // live mic (live-found 2026-09-15, Wave Link took the device
      // under a warm stream and only a relaunch revived capture).
      // Worst case of a false trip is one press without its pre-roll.
      if (isDeadStream(peak)) {
        void logDictation('silent stream detected, re-arming capture')
        rearmCapture()
      }
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

  if (kind === 'transform') {
    // The selection is read before the instruction is transcribed, so
    // an unreadable selection sends nothing at all.
    try {
      await performTransform({ startedAt: sessionStartedAt, transcribe: () => transcribeWav(upload) })
    } catch (error) {
      console.error('[murmur] transform threw:', error)
      setOverlayPhase('error')
      playCue('error')
    }
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

  if (kind === 'note') {
    await deliverNote(heardText, finalText, peak)
    return
  }

  try {
    const outcome = await insertText(finalText)
    if (outcome === 'error') {
      setOverlayPhase('error')
      playCue('error')
    } else {
      const { recordSession } = await import('./history')
      const event = recordSession({ startedAt: sessionStartedAt, rawText: heardText, finalText })
      // outcome=copied means the paste keystroke failed and the text
      // waits on the clipboard: the exact trail the Windows missed
      // insertion reports need. Never the text itself.
      void logDictation(
        `delivered outcome=${outcome} words=${event?.words ?? 0} peak=${peak.toFixed(4)}`
      )
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

/**
 * A note's delivery: the file first (the notes folder, then murmur's
 * own data folder), history second, the overlay last. History keeps
 * the words even if both writes fail, so nothing is ever lost and the
 * pill can say error honestly.
 */
async function deliverNote(heardText: string, finalText: string, peak: number): Promise<void> {
  let saved: ReturnType<typeof saveNote> | null = null
  try {
    saved = saveNote(finalText)
  } catch (error) {
    console.error('[murmur] note save threw:', error)
  }
  const { recordSession } = await import('./history')
  const event = recordSession({
    startedAt: sessionStartedAt,
    rawText: heardText,
    finalText,
    kind: 'note'
  })
  if (!saved?.ok) {
    void logDictation(`note-failed words=${event?.words ?? 0} peak=${peak.toFixed(4)}`)
    setOverlayPhase('error')
    playCue('error')
    return
  }
  void logDictation(
    `delivered kind=note location=${saved.location} words=${event?.words ?? 0} peak=${peak.toFixed(4)}`
  )
  setOverlayPhase('inserted', event?.wpm ?? null)
  playCue('noted')
  refreshOverlayConfig()
  // The sorter runs after the words are safe and the pill has spoken;
  // it decides for itself whether sorting is on. Nothing here waits.
  const forSort = { text: finalText, base: saved.base, inboxRelative: saved.relative, when: saved.when }
  rememberForSort(forSort)
  void sortNote(forSort).catch((error) => console.error('[murmur] sort threw:', error))
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

  registerSmokeCheck('noteLoop', async () => {
    // The note chord end to end on the synthetic pipeline: dormant
    // first (no folder set means a hint, not a recording), then a full
    // record, transcribe, format, and append into a smoke vault; the
    // other chord's stop cannot end the take, history tags the session
    // as a note, and the pill says noted.
    const { getSettings, updateSettings } = await import('./settings')
    const { existsSync, mkdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { app } = await import('electron')
    const { dayKey } = await import('../shared/history')
    const before = getSettings().notes
    const vault = join(app.getPath('userData'), 'smoke-vault-loop')
    try {
      mkdirSync(vault, { recursive: true })
      updateSettings({ notes: { folder: '' } })
      const began = dictationStart('note')
      const hinted = !began && getOverlayPhase() === 'hint' && getOverlayState().mode === 'note'
      setOverlayPhase('idle')
      updateSettings({
        notes: { folder: vault, pathTemplate: 'inbox/{date}.md', entryTemplate: '- {time} {text}' }
      })
      dictationStart('note')
      if (getOverlayPhase() !== 'recording' || getOverlayState().mode !== 'note') return false
      await new Promise((resolve) => setTimeout(resolve, 500))
      await dictationStop('dictation')
      const stillRecording = getOverlayPhase() === 'recording'
      await dictationStop('note')
      const expected = formatTranscript(
        SMOKE_TRANSCRIPT,
        getSettings().formatting,
        formatSpec as unknown as FormatSpec
      )
      const file = join(vault, 'inbox', `${dayKey(Date.now())}.md`)
      const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
      const { readHistory } = await import('./history')
      const events = readHistory()
      const last = events[events.length - 1]
      return (
        hinted &&
        stillRecording &&
        getOverlayPhase() === 'inserted' &&
        getOverlayState().mode === 'note' &&
        /^- \d\d:\d\d /.test(content) &&
        content.endsWith(`${expected}\n`) &&
        last?.kind === 'note' &&
        last.finalText === expected
      )
    } finally {
      updateSettings({ notes: before })
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
