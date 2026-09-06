// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import hallucinations from './hallucinations.json'
import { hasSpeechEnergy, isHallucination, normalizeTranscript, trimSilence, voicedMs } from './speech-gate'

const RATE = 16_000

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE))
}

function breathNoise(seconds: number): Float32Array {
  // Deterministic pseudo-noise well under the threshold.
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.004 * Math.sin(i * 12.9898)
  return out
}

function speechBursts(seconds: number): Float32Array {
  // 200Hz tone gated on and off like syllables, loud enough to count.
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const speaking = Math.floor(t * 4) % 2 === 0
    out[i] = speaking ? 0.3 * Math.sin(2 * Math.PI * 200 * t) : 0
  }
  return out
}

describe('energy gate', () => {
  it('reports zero voiced time for pure silence', () => {
    expect(voicedMs(silence(1), RATE)).toBe(0)
    expect(hasSpeechEnergy(silence(1), RATE)).toBe(false)
  })

  it('stays closed for breath-level noise', () => {
    expect(hasSpeechEnergy(breathNoise(1.5), RATE)).toBe(false)
  })

  it('opens for speech-like bursts', () => {
    expect(hasSpeechEnergy(speechBursts(1), RATE)).toBe(true)
    expect(voicedMs(speechBursts(1), RATE)).toBeGreaterThanOrEqual(400)
  })

  it('requires a minimum voiced duration, not one loud click', () => {
    const clicky = silence(1)
    clicky.set(speechBursts(0.05).subarray(0, 800), 8000)
    expect(hasSpeechEnergy(clicky, RATE)).toBe(false)
  })
})

describe('trimSilence', () => {
  it('cuts a long silent tail down to the padding cushion', () => {
    const speech = speechBursts(1)
    const tail = silence(2)
    const combined = new Float32Array(speech.length + tail.length)
    combined.set(speech, 0)
    combined.set(tail, speech.length)
    const trimmed = trimSilence(combined, RATE)
    // Everything after the last voiced window plus ~250ms padding goes.
    expect(trimmed.length).toBeLessThan(speech.length + RATE * 0.4)
    expect(trimmed.length).toBeGreaterThan(RATE * 0.5)
  })

  it('cuts a silent head the same way', () => {
    const head = silence(2)
    const speech = speechBursts(1)
    const combined = new Float32Array(head.length + speech.length)
    combined.set(head, 0)
    combined.set(speech, head.length)
    const trimmed = trimSilence(combined, RATE)
    expect(trimmed.length).toBeLessThan(speech.length + RATE * 0.6)
  })

  it('keeps audio that is voiced to the very end', () => {
    const speech = speechBursts(1)
    const trimmed = trimSilence(speech, RATE)
    expect(trimmed.length).toBeGreaterThanOrEqual(speech.length * 0.85)
  })

  it('returns empty for pure silence', () => {
    expect(trimSilence(silence(1), RATE).length).toBe(0)
  })
})

describe('transcript sanity filter', () => {
  const phrases = hallucinations.phrases

  it('flags empty and whitespace transcripts', () => {
    expect(isHallucination('', phrases)).toBe(true)
    expect(isHallucination('   \n ', phrases)).toBe(true)
    expect(isHallucination('...', phrases)).toBe(true)
  })

  it('flags known phrases regardless of case and punctuation', () => {
    expect(isHallucination('Thank you.', phrases)).toBe(true)
    expect(isHallucination('THANKS FOR WATCHING!', phrases)).toBe(true)
    expect(isHallucination(' you ', phrases)).toBe(true)
  })

  it('passes real dictations, even ones containing a phrase', () => {
    expect(isHallucination('Thank you for the update, I will review it today.', phrases)).toBe(false)
    expect(isHallucination('send the invoice tomorrow', phrases)).toBe(false)
  })

  it('normalizes consistently', () => {
    expect(normalizeTranscript('  Thank   You!! ')).toBe('thank you')
  })
})
