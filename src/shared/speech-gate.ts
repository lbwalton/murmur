// SPDX-License-Identifier: GPL-3.0-only
// The three silence guards. Before upload: an energy gate that measures
// voiced time and, for a take no key was held through, wants some of it
// steady, as speech is and clicks are not (US-119). After transcription: a filter that drops any segment the
// model itself scores as silence (US-119), and a sanity filter for empty
// output and the stock phrases Whisper-family models hallucinate on
// silence. Any one of them leaving nothing means nothing is ever
// inserted.

/** The gate's defaults: a 30 ms window whose RMS reaches this counts
 *  as voiced, and a take needs this much voiced time to be speech (a
 *  take no key was held through also needs MIN_STEADY_MS of steady
 *  sound). Hands-free's silence watch (US-117) judges quiet by the same
 *  two. */
export const SPEECH_RMS_THRESHOLD = 0.01
export const MIN_VOICED_MS = 200

export interface GateOptions {
  windowMs?: number
  rmsThreshold?: number
  minVoicedMs?: number
}

/** Total milliseconds of windows whose RMS clears the threshold. */
export function voicedMs(
  samples: Float32Array,
  sampleRate: number,
  options: GateOptions = {}
): number {
  const { windowMs = 30, rmsThreshold = SPEECH_RMS_THRESHOLD } = options
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate))
  let voiced = 0
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    let sum = 0
    for (let i = start; i < start + windowSize; i++) sum += samples[i] * samples[i]
    if (Math.sqrt(sum / windowSize) >= rmsThreshold) voiced += windowMs
  }
  return voiced
}

/**
 * A spoken syllable holds its loudness for a while; a click, a
 * keystroke, or a tap on the desk is loudest at once and fades. Voiced
 * time alone cannot tell them apart: the hotkey taps of a quiet
 * hands-free take added up past MIN_VOICED_MS, and Whisper turned the
 * quiet between them into invented words (live-found 2026-11-05 on
 * whisper-large-v3-turbo, whose no-speech score is always about 0, so
 * the segment filter cannot catch it). So a take no key was held
 * through (hands-free, or tap to start and stop) also needs 1 stretch of
 * steady sound: loudness measured over 20 ms every 10 ms (20 ms always
 * spans a pitch period, down to a deep or creaky 50 Hz voice), at the
 * RMS threshold or above, each step within STEADY_DROP_DB of the
 * loudest so far in the stretch, lasting MIN_STEADY_MS. Held takes keep
 * the voiced rule alone: a held quiet take has only its 2 hotkey clicks,
 * and losing real words is the worse failure.
 *
 * Calibrated on synthetic takes (US-119 notes): speech from 9 voices
 * and 5 languages at several alignments and levels, a glottal vowel
 * model from 40 Hz up, and decaying clicks, taps, keystrokes, and noisy
 * rooms. A lone click or tap counted only once it rang on with an 80 ms
 * decay, and a keystroke only at a 30 ms decay with its 2 clicks 40 ms
 * apart. Speech was kept, deep and creaky voices included, except some
 * single words spoken barely above the voiced threshold and a fast
 * Mandarin 好的.
 */
export const STEADY_STEP_MS = 10
export const STEADY_DROP_DB = 8
export const MIN_STEADY_MS = 90

/** The longest stretch of steady sound in the take, in milliseconds. */
export function longestSteadyMs(
  samples: Float32Array,
  sampleRate: number,
  options: GateOptions = {}
): number {
  const { rmsThreshold = SPEECH_RMS_THRESHOLD } = options
  const stepSize = Math.max(1, Math.round((STEADY_STEP_MS / 1000) * sampleRate))
  const floorRatio = 10 ** (-STEADY_DROP_DB / 20)
  let longest = 0
  let run = 0
  let loudest = 0
  let previousEnergy = 0
  for (let start = 0; start + stepSize <= samples.length; start += stepSize) {
    let sum = 0
    for (let i = start; i < start + stepSize; i++) sum += samples[i] * samples[i]
    const energy = sum / stepSize
    // This step and the one before: 20 ms of loudness.
    const rms = Math.sqrt((energy + previousEnergy) / 2)
    previousEnergy = energy
    if (rms >= rmsThreshold && rms >= loudest * floorRatio) {
      run += 1
      loudest = Math.max(loudest, rms)
    } else {
      // A fading step ends the stretch; one loud enough starts the next.
      run = rms >= rmsThreshold ? 1 : 0
      loudest = run ? rms : 0
    }
    if (run > longest) longest = run
  }
  return longest * STEADY_STEP_MS
}

/** Guard one's verdict and the numbers behind it, for the log. */
export interface SpeechCheck {
  speech: boolean
  voicedMs: number
  steadyMs: number
}

export interface SpeechOptions extends GateOptions {
  /** A take no key was held through: it also needs MIN_STEADY_MS. */
  requireSteady?: boolean
}

/** Enough voiced time (and, when asked, a steady stretch): worth uploading. */
export function checkSpeech(
  samples: Float32Array,
  sampleRate: number,
  options: SpeechOptions = {}
): SpeechCheck {
  const { minVoicedMs = MIN_VOICED_MS, requireSteady = false } = options
  const voiced = voicedMs(samples, sampleRate, options)
  const steady = longestSteadyMs(samples, sampleRate, options)
  const speech = voiced >= minVoicedMs && (!requireSteady || steady >= MIN_STEADY_MS)
  return { speech, voicedMs: voiced, steadyMs: steady }
}

/** True when the audio contains speech worth uploading. */
export function hasSpeechEnergy(
  samples: Float32Array,
  sampleRate: number,
  options: SpeechOptions = {}
): boolean {
  return checkSpeech(samples, sampleRate, options).speech
}

/**
 * Cut leading and trailing silence, keeping a padding cushion on both
 * sides. Silence fed to speech models breeds hallucinated phrases
 * ("Thank you.") appended to real dictations; removing it attacks the
 * cause. Voiced audio is never cut: a spoken thank-you survives.
 */
/** Highest absolute sample in the take: the capture health number. */
export function peakLevel(samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i])
    if (magnitude > peak) peak = magnitude
  }
  return peak
}

/** An order of magnitude under any real room's noise floor (and 10x
 *  under the speech gate's own RMS threshold): a take peaking below
 *  this is a dead capture stream, not a quiet human. */
export const DEAD_STREAM_PEAK = 0.001

export function isDeadStream(peak: number): boolean {
  return peak < DEAD_STREAM_PEAK
}

export function trimSilence(
  samples: Float32Array,
  sampleRate: number,
  options: GateOptions & { paddingMs?: number } = {}
): Float32Array {
  const { windowMs = 30, rmsThreshold = SPEECH_RMS_THRESHOLD, paddingMs = 250 } = options
  const windowSize = Math.max(1, Math.round((windowMs / 1000) * sampleRate))
  let firstVoiced = -1
  let lastVoiced = -1
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    let sum = 0
    for (let i = start; i < start + windowSize; i++) sum += samples[i] * samples[i]
    if (Math.sqrt(sum / windowSize) >= rmsThreshold) {
      if (firstVoiced === -1) firstVoiced = start
      lastVoiced = start + windowSize
    }
  }
  if (firstVoiced === -1) return new Float32Array(0)
  const padding = Math.round((paddingMs / 1000) * sampleRate)
  const from = Math.max(0, firstVoiced - padding)
  const to = Math.min(samples.length, lastVoiced + padding)
  return samples.slice(from, to)
}

/** Lowercase, collapse whitespace, strip punctuation for exact matching. */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’\-()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when the transcript is empty or one of the known hallucination
 * phrases models emit for silence. Matching is exact after
 * normalization: real dictations that merely contain a phrase pass.
 */
export function isHallucination(text: string, phrases: readonly string[]): boolean {
  const normalized = normalizeTranscript(text)
  if (normalized.length === 0) return true
  return phrases.some((phrase) => normalizeTranscript(phrase) === normalized)
}

/**
 * Strip trailing sentences matching the given phrases from a
 * multi-sentence transcript. Callers MUST pass the artifactTails subset
 * (phrases nobody genuinely dictates), never the full hallucination
 * list: a real spoken sign-off like thank-you must always survive.
 */
export function stripTrailingHallucinations(text: string, phrases: readonly string[]): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+/)
  while (sentences.length > 1 && isHallucination(sentences[sentences.length - 1], phrases)) {
    sentences.pop()
  }
  return sentences.join(' ')
}

/** Whisper's own rule for a segment that is not speech (US-119): the
 *  model puts the odds of no speech above this AND its average token
 *  log probability below the second. Both must hold, strictly. */
export const NO_SPEECH_PROB_THRESHOLD = 0.6
export const LOW_LOGPROB_THRESHOLD = -1.0

/** One segment of a verbose_json transcription response. */
export interface SpeechSegment {
  text?: unknown
  no_speech_prob?: unknown
  avg_logprob?: unknown
}

export interface SilenceStats {
  segments: number
  dropped: number
  /** Highest finite no_speech_prob across all segments. */
  noSpeech: number
  /** Lowest finite avg_logprob across all segments. */
  logprob: number
}

/** True only when both scores are finite numbers past Whisper's rule. */
export function isSilentSegment(segment: SpeechSegment): boolean {
  const { no_speech_prob: noSpeech, avg_logprob: logprob } = segment
  return (
    typeof noSpeech === 'number' &&
    typeof logprob === 'number' &&
    Number.isFinite(noSpeech) &&
    Number.isFinite(logprob) &&
    noSpeech > NO_SPEECH_PROB_THRESHOLD &&
    logprob < LOW_LOGPROB_THRESHOLD
  )
}

/**
 * Drop the segments the model judges silent. With none dropped the
 * response's own text is returned untouched; otherwise the kept
 * segments' raw texts joined with nothing between (Whisper builds its
 * own text the same way, so English keeps its spaces and Japanese gets
 * none) and trimmed. All
 * dropped gives '' (which isHallucination treats as no speech).
 * Stats are null when no segment carried a finite score.
 */
export function dropSilentSegments(
  segments: readonly SpeechSegment[],
  fullText: string
): { text: string; stats: SilenceStats | null } {
  const kept: string[] = []
  let dropped = 0
  let noSpeech = -Infinity
  let logprob = Infinity
  for (const segment of segments) {
    const np = segment.no_speech_prob
    const lp = segment.avg_logprob
    if (typeof np === 'number' && Number.isFinite(np) && np > noSpeech) noSpeech = np
    if (typeof lp === 'number' && Number.isFinite(lp) && lp < logprob) logprob = lp
    if (isSilentSegment(segment)) {
      dropped += 1
      continue
    }
    if (typeof segment.text === 'string') kept.push(segment.text)
  }
  const finite = Number.isFinite(noSpeech) && Number.isFinite(logprob)
  const stats = finite ? { segments: segments.length, dropped, noSpeech, logprob } : null
  return { text: dropped === 0 ? fullText : kept.join('').trim(), stats }
}

/** The diagnostics suffix for a log line: numbers only, never text. */
export function silenceLogSuffix(silence: SilenceStats | undefined): string {
  if (!silence) return ''
  return ` segments=${silence.segments} dropped=${silence.dropped} noSpeech=${silence.noSpeech.toFixed(2)} logprob=${silence.logprob.toFixed(2)}`
}
