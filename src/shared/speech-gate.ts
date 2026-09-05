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
