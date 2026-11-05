// SPDX-License-Identifier: GPL-3.0-only
// The three silence guards. Before upload: an energy gate that measures
// voiced time. After transcription: a filter that drops any segment the
// model itself scores as silence (US-119), and a sanity filter for empty
// output and the stock phrases Whisper-family models hallucinate on
// silence. Any one of them leaving nothing means nothing is ever inserted.

/** The gate's defaults: a 30 ms window whose RMS reaches this counts
 *  as voiced, and a take needs this much voiced time to be speech.
 *  Hands-free's silence watch (US-117) judges quiet by the same two. */
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

/** True when the audio contains enough voiced time to be worth uploading. */
export function hasSpeechEnergy(
  samples: Float32Array,
  sampleRate: number,
  options: GateOptions = {}
): boolean {
  const { minVoicedMs = MIN_VOICED_MS } = options
  return voicedMs(samples, sampleRate, options) >= minVoicedMs
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
 * segments' texts, trimmed, empties skipped, joined by one space. All
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
    if (typeof segment.text === 'string') {
      const trimmed = segment.text.trim()
      if (trimmed) kept.push(trimmed)
    }
  }
  const finite = Number.isFinite(noSpeech) && Number.isFinite(logprob)
  const stats = finite ? { segments: segments.length, dropped, noSpeech, logprob } : null
  return { text: dropped === 0 ? fullText : kept.join(' '), stats }
}

/** The diagnostics suffix for a log line: numbers only, never text. */
export function silenceLogSuffix(silence: SilenceStats | undefined): string {
  if (!silence) return ''
  return ` segments=${silence.segments} dropped=${silence.dropped} noSpeech=${silence.noSpeech.toFixed(2)} logprob=${silence.logprob.toFixed(2)}`
}
