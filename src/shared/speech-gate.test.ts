// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import hallucinations from './hallucinations.json'
import {
  LOW_LOGPROB_THRESHOLD,
  NO_SPEECH_PROB_THRESHOLD,
  dropSilentSegments,
  silenceLogSuffix,
  hasSpeechEnergy, isHallucination, normalizeTranscript, stripTrailingHallucinations, trimSilence, voicedMs, isDeadStream, peakLevel } from './speech-gate'

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

describe('stripTrailingHallucinations', () => {
  const tails = hallucinations.artifactTails

  it('cuts a broadcast-artifact tail off real speech', () => {
    expect(stripTrailingHallucinations('Send the deck by noon. Thanks for watching!', tails)).toBe(
      'Send the deck by noon.'
    )
  })

  it('cuts stacked artifact tails', () => {
    expect(
      stripTrailingHallucinations('The meeting moved. Please subscribe. Thanks for watching!', tails)
    ).toBe('The meeting moved.')
  })

  it('NEVER cuts a genuine spoken sign-off (the iron law)', () => {
    expect(stripTrailingHallucinations('Send the deck by noon. Thank you.', tails)).toBe(
      'Send the deck by noon. Thank you.'
    )
    expect(stripTrailingHallucinations('Talk soon. Bye.', tails)).toBe('Talk soon. Bye.')
  })

  it('leaves a single-sentence dictation alone', () => {
    expect(stripTrailingHallucinations('Thanks for watching!', tails)).toBe('Thanks for watching!')
  })

  it('leaves clean transcripts untouched', () => {
    const text = 'Ship it today. I will follow up tomorrow.'
    expect(stripTrailingHallucinations(text, tails)).toBe(text)
  })
})

describe('peakLevel and the dead stream threshold', () => {
  it('reads a dead capture stream as dead and a quiet room as alive', () => {
    // A hijacked device delivers this: technically nonzero, humanly
    // nothing (the live incident measured 0.0002).
    const dead = new Float32Array(16_000).fill(0.0002)
    // A real quiet room's noise floor sits well above the threshold.
    const quietRoom = new Float32Array(16_000)
    for (let i = 0; i < quietRoom.length; i++) quietRoom[i] = 0.004 * Math.sin(i / 7)
    expect(isDeadStream(peakLevel(dead))).toBe(true)
    expect(isDeadStream(peakLevel(quietRoom))).toBe(false)
    expect(peakLevel(new Float32Array(0))).toBe(0)
  })

  it('peak is the true maximum magnitude, sign ignored', () => {
    const samples = new Float32Array([0.01, -0.62, 0.3])
    expect(peakLevel(samples)).toBeCloseTo(0.62, 6)
  })
})

describe('dropSilentSegments (US-119)', () => {
  const seg = (text: unknown, no_speech_prob?: unknown, avg_logprob?: unknown) => ({
    text,
    no_speech_prob,
    avg_logprob
  })

  it('uses Whisper\'s own thresholds', () => {
    expect(NO_SPEECH_PROB_THRESHOLD).toBe(0.6)
    expect(LOW_LOGPROB_THRESHOLD).toBe(-1.0)
  })

  it('keeps a segment exactly on either boundary', () => {
    expect(dropSilentSegments([seg(' a', 0.6, -2)], ' a').stats?.dropped).toBe(0)
    expect(dropSilentSegments([seg(' a', 0.9, -1.0)], ' a').stats?.dropped).toBe(0)
  })

  it('drops a segment past both boundaries', () => {
    const out = dropSilentSegments([seg(' a', 0.61, -1.01)], ' a')
    expect(out.stats?.dropped).toBe(1)
    expect(out.text).toBe('')
  })

  it('keeps a high no_speech segment the model was confident about', () => {
    const out = dropSilentSegments([seg(' a', 0.95, -0.5)], ' a')
    expect(out.stats?.dropped).toBe(0)
    expect(out.text).toBe(' a')
  })

  it('keeps segments with missing, null, or non-finite scores', () => {
    const segments = [seg(' a'), seg(' b', null, null), seg(' c', Number.NaN, Number.NaN), seg(' d', Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)]
    const out = dropSilentSegments(segments, ' a b c d')
    expect(out.text).toBe(' a b c d')
    expect(out.stats).toBeNull()
  })

  it('returns the response text byte for byte when nothing drops', () => {
    const out = dropSilentSegments([seg(' hello', 0.01, -0.2), seg(' world', 0.02, -0.3)], ' hello world')
    expect(out.text).toBe(' hello world')
    expect(out.stats).toEqual({ segments: 2, dropped: 0, noSpeech: 0.02, logprob: -0.3 })
  })

  it('rebuilds from the kept segments when some drop', () => {
    const out = dropSilentSegments(
      [seg(' real one', 0.05, -0.2), seg(' invented', 0.9, -1.5), seg('  ', 0.1, -0.1), seg(' real two ', 0.1, -0.4)],
      'full text'
    )
    expect(out.text).toBe('real one real two')
    expect(out.stats).toEqual({ segments: 4, dropped: 1, noSpeech: 0.9, logprob: -1.5 })
  })

  it('gives an empty string when every segment drops, which is no speech', () => {
    const out = dropSilentSegments([seg('x', 0.9, -1.2), seg('y', 0.8, -1.1)], 'x y')
    expect(out.text).toBe('')
    expect(isHallucination(out.text, hallucinations.phrases)).toBe(true)
  })
})

describe('silenceLogSuffix', () => {
  it('is empty without stats and numbers only with them', () => {
    expect(silenceLogSuffix(undefined)).toBe('')
    expect(silenceLogSuffix({ segments: 3, dropped: 1, noSpeech: 0.9123, logprob: -1.4249 })).toBe(
      ' segments=3 dropped=1 noSpeech=0.91 logprob=-1.42'
    )
  })
})
