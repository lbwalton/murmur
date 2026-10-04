// SPDX-License-Identifier: GPL-3.0-only
// A made-up voice for the waveform tiles (US-084): levels shaped like
// speech, never from the microphone. Syllables at about four a second,
// grouped into words and phrases with real pauses between them, at the
// loudness the overlay's level stream reports for normal speech.

const TAU = Math.PI * 2

/** The level a still frame is drawn at (reduced motion): mid-speech. */
export const STILL_LEVEL = 0.16

/** The level t seconds into the made-up voice, from 0 to about 0.3. */
export function voiceLevel(t: number): number {
  // Phrases of about two and a half seconds, then a breath.
  const phrase = (t % 3.4) / 3.4
  if (phrase > 0.74) return 0.004
  // Words: short dips between them.
  const word = Math.sin(TAU * 0.9 * t + 0.6)
  const wordGate = word > -0.82 ? 1 : 0.15
  // Syllables, sharpened so each reads as a push of air.
  const syllable = Math.pow(0.5 + 0.5 * Math.sin(TAU * 4.1 * t), 1.6)
  const swell = 0.62 + 0.38 * Math.sin(TAU * 0.31 * t + 1.1)
  return 0.012 + 0.28 * syllable * wordGate * swell
}

/** The bar heights for a still frame: the voice sampled at fixed times. */
export function stillLevels(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.min(1, voiceLevel(0.4 + i * 0.061) * 3))
}
