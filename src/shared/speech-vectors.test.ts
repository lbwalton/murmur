// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/speech-vectors.json. MurmurCore runs the same file, so a
// change in shared/ breaks both platforms or neither (ios/prd.json IOS-003).
import { describe, expect, it } from 'vitest'
import hallucinations from '../../shared/hallucinations.json'
import vectors from '../../shared/speech-vectors.json'
import {
  hasSpeechEnergy,
  isDeadStream,
  isHallucination,
  peakLevel,
  stripTrailingHallucinations,
  trimSilence,
  voicedMs
} from './speech-gate'

interface Segment {
  kind: string
  samples: number
  amplitude?: number
  periodSamples?: number
}

/** The audio a signal's segments describe (see the file's comment). */
function build(segments: Segment[]): Float32Array {
  const out = new Float32Array(segments.reduce((total, s) => total + s.samples, 0))
  let at = 0
  for (const s of segments) {
    if (s.kind === 'square' && s.amplitude !== undefined && s.periodSamples !== undefined) {
      const half = s.periodSamples / 2
      for (let i = 0; i < s.samples; i++) out[at + i] = Math.floor(i / half) % 2 === 0 ? s.amplitude : -s.amplitude
    }
    at += s.samples
  }
  return out
}

describe('shared/speech-vectors.json signals', () => {
  for (const signal of vectors.signals) {
    it(signal.name, () => {
      const samples = build(signal.segments)
      const peak = peakLevel(samples)
      expect({
        voicedMs: voicedMs(samples, signal.sampleRate),
        hasSpeech: hasSpeechEnergy(samples, signal.sampleRate),
        trimmedSamples: trimSilence(samples, signal.sampleRate).length,
        peak,
        deadStream: isDeadStream(peak)
      }).toEqual(signal.expected)
    })
  }
})

describe('shared/speech-vectors.json transcripts', () => {
  for (const verdict of vectors.hallucinations) {
    it(`whole transcript ${JSON.stringify(verdict.text)}`, () => {
      expect(isHallucination(verdict.text, hallucinations.phrases)).toBe(verdict.expected)
    })
  }
  for (const strip of vectors.trailing) {
    it(`trailing ${JSON.stringify(strip.text)}`, () => {
      expect(stripTrailingHallucinations(strip.text, hallucinations.artifactTails)).toBe(strip.expected)
    })
  }
})
