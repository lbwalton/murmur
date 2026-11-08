// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import hallucinations from '../../shared/hallucinations.json'
import {
  LOW_LOGPROB_THRESHOLD,
  MIN_STEADY_MS,
  MIN_VOICED_MS,
  NO_SPEECH_PROB_THRESHOLD,
  STEADY_DROP_DB,
  checkSpeech,
  longestSteadyMs,
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

/** A hotkey click or a desk tap: a 2 kHz knock decaying in about 20 ms. */
function knock(out: Float32Array, atSeconds: number, peak = 0.3): void {
  const start = Math.round(atSeconds * RATE)
  for (let i = 0; i < 0.12 * RATE && start + i < out.length; i++) {
    out[start + i] += peak * Math.exp(-i / (0.02 * RATE)) * Math.sin((2 * Math.PI * 2000 * i) / RATE)
  }
}

/** A steady 200 Hz tone: sound that lasts, like a held vowel. */
function tone(out: Float32Array, atSeconds: number, seconds: number, amplitude = 0.3): void {
  const start = Math.round(atSeconds * RATE)
  for (let i = 0; i < seconds * RATE && start + i < out.length; i++) {
    out[start + i] += amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE)
  }
}

/** A quiet hands-free take as live-found 2026-11-05: the double tap at
 *  its head, 2 desk taps, and the stopping tap at its tail. */
function tappedSilence(): Float32Array {
  const take = breathNoise(21.5)
  for (const at of [0.3, 0.42, 0.58, 0.7, 8, 13.4, 21.2, 21.33]) knock(take, at)
  return take
}

/** A keystroke: its press click, then its release click gapSeconds later. */
function keystroke(out: Float32Array, atSeconds: number, gapSeconds: number): void {
  knock(out, atSeconds)
  knock(out, atSeconds + gapSeconds, 0.2)
}

/** A voiced syllable: glottal pulses at f0 through one vowel resonance
 *  (500 Hz), rising in over 30 ms and falling away over the last 50 ms. */
function syllable(out: Float32Array, atSeconds: number, seconds: number, f0: number, amplitude: number): void {
  const start = Math.round(atSeconds * RATE)
  const length = Math.round(seconds * RATE)
  const r = Math.exp((-Math.PI * 100) / RATE)
  const c1 = 2 * r * Math.cos((2 * Math.PI * 500) / RATE)
  const c2 = -r * r
  const period = RATE / f0
  let y1 = 0
  let y2 = 0
  let nextPulse = 0
  for (let i = 0; i < length && start + i < out.length; i++) {
    let pulse = 0
    if (i >= nextPulse) {
      pulse = 1
      nextPulse += period
    }
    const y = pulse + c1 * y1 + c2 * y2
    y2 = y1
    y1 = y
    const t = i / RATE
    const envelope = Math.min(1, t / 0.03, (seconds - t) / 0.05)
    out[start + i] += amplitude * 0.05 * Math.max(0, envelope) * y
  }
}

describe('steady sound (US-119)', () => {
  it('a click, a keystroke, or a desk tap never holds steady', () => {
    for (const offset of [0, 0.003, 0.0061, 0.0097]) {
      const one = silence(1)
      knock(one, 0.3 + offset, 0.9)
      expect(longestSteadyMs(one, RATE)).toBeLessThan(MIN_STEADY_MS)
      for (const gap of [0.04, 0.05, 0.07, 0.09, 0.11]) {
        const typed = silence(1)
        keystroke(typed, 0.3 + offset, gap)
        expect(longestSteadyMs(typed, RATE)).toBeLessThan(MIN_STEADY_MS)
      }
    }
  })

  it('a held vowel does', () => {
    const vowel = silence(1)
    tone(vowel, 0.3, 0.15)
    expect(longestSteadyMs(vowel, RATE)).toBeGreaterThanOrEqual(MIN_STEADY_MS)
  })

  it('a deep, creaky voice holds steady too, at every alignment', () => {
    for (const f0 of [45, 50, 60, 80]) {
      for (const offset of [0, 0.0023, 0.0049, 0.0071, 0.0094]) {
        const low = breathNoise(1)
        syllable(low, 0.3 + offset, 0.25, f0, 1)
        expect(longestSteadyMs(low, RATE), `${f0} Hz at +${offset}s`).toBeGreaterThanOrEqual(MIN_STEADY_MS)
      }
    }
  })

  it(`a fade of more than ${STEADY_DROP_DB} dB ends the stretch; a smaller dip does not`, () => {
    const faded = silence(1)
    tone(faded, 0.3, 0.06, 0.3)
    tone(faded, 0.36, 0.06, 0.06)
    expect(longestSteadyMs(faded, RATE)).toBeLessThan(MIN_STEADY_MS)
    const dipped = silence(1)
    tone(dipped, 0.3, 0.06, 0.3)
    tone(dipped, 0.36, 0.06, 0.15)
    expect(longestSteadyMs(dipped, RATE)).toBeGreaterThanOrEqual(110)
  })

  it('counts a stretch that runs to the very end of the take', () => {
    const ending = silence(1)
    tone(ending, 0.85, 0.15)
    expect(longestSteadyMs(ending, RATE)).toBeGreaterThanOrEqual(140)
  })

  it('needs 90 ms, and a short syllable of about 110 ms clears it', () => {
    expect(MIN_STEADY_MS).toBe(90)
    for (const offset of [0, 0.0031, 0.0067]) {
      const word = breathNoise(1)
      syllable(word, 0.3 + offset, 0.15, 120, 1)
      syllable(word, 0.5 + offset, 0.15, 120, 1)
      const steady = longestSteadyMs(word, RATE)
      expect(steady).toBeGreaterThanOrEqual(MIN_STEADY_MS)
      expect(steady).toBeLessThanOrEqual(130)
      expect(checkSpeech(word, RATE, { requireSteady: true }).speech).toBe(true)
    }
  })

  it('finds no speech in a tapped quiet take no key was held through', () => {
    const take = tappedSilence()
    for (let k = 0; k < 6; k++) keystroke(take, 2 + k * 1.7 + k * 0.0013, 0.05 + k * 0.012)
    const check = checkSpeech(take, RATE, { requireSteady: true })
    expect(check.voicedMs).toBeGreaterThanOrEqual(MIN_VOICED_MS)
    expect(check.steadyMs).toBeLessThan(MIN_STEADY_MS)
    expect(check.speech).toBe(false)
    expect(hasSpeechEnergy(take, RATE, { requireSteady: true })).toBe(false)
  })

  it('a held take keeps the voiced rule alone', () => {
    const take = tappedSilence()
    expect(checkSpeech(take, RATE).speech).toBe(true)
    expect(hasSpeechEnergy(take, RATE)).toBe(true)
  })

  it('finds speech when talking is in it, even a single short word', () => {
    const talked = tappedSilence()
    talked.set(speechBursts(1), 10 * RATE)
    expect(hasSpeechEnergy(talked, RATE, { requireSteady: true })).toBe(true)
    const word = tappedSilence()
    syllable(word, 10, 0.25, 110, 0.4)
    expect(checkSpeech(word, RATE, { requireSteady: true })).toMatchObject({ speech: true })
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
      [seg(' real one', 0.05, -0.2), seg(' invented', 0.9, -1.5), seg(' real two ', 0.1, -0.4)],
      'full text'
    )
    expect(out.text).toBe('real one real two')
    expect(out.stats).toEqual({ segments: 3, dropped: 1, noSpeech: 0.9, logprob: -1.5 })
  })

  it('keeps Japanese unspaced when some segments drop', () => {
    const out = dropSilentSegments(
      [seg('こんにちは。', 0.05, -0.2), seg('おにぎのこ', 0.9, -1.5), seg('元気ですか。', 0.1, -0.3)],
      'こんにちは。おにぎのこ元気ですか。'
    )
    expect(out.text).toBe('こんにちは。元気ですか。')
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
