// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import hallucinations from './hallucinations.json'
import { hasSpeechEnergy, isHallucination, normalizeTranscript, voicedMs } from './speech-gate'

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
