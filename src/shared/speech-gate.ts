// SPDX-License-Identifier: GPL-3.0-only
// The two silence guards. Before upload: an energy gate that measures
// voiced time. After transcription: a sanity filter for empty output and
// the stock phrases Whisper-family models hallucinate on silence.
// Either one firing means nothing is ever inserted.

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
  const { windowMs = 30, rmsThreshold = 0.01 } = options
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
  const { minVoicedMs = 200 } = options
  return voicedMs(samples, sampleRate, options) >= minVoicedMs
}

/**
 * Cut leading and trailing silence, keeping a padding cushion on both
 * sides. Silence fed to speech models breeds hallucinated phrases
 * ("Thank you.") appended to real dictations; removing it attacks the
 * cause. Voiced audio is never cut: a spoken thank-you survives.
 */
export function trimSilence(
  samples: Float32Array,
  sampleRate: number,
  options: GateOptions & { paddingMs?: number } = {}
): Float32Array {
  const { windowMs = 30, rmsThreshold = 0.01, paddingMs = 250 } = options
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
