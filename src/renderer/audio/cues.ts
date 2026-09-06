// SPDX-License-Identifier: GPL-3.0-only
// Sound cues, synthesized live: tiny two-tone blips with soft envelopes,
// no files anywhere. The palette is quiet on purpose; cues confirm, they
// never announce.

export type CueName = 'start' | 'stop' | 'insert' | 'error' | 'nospeech'

interface Tone {
  freq: number
  at: number
  duration: number
  gain: number
  type?: OscillatorType
}

const CUES: Record<CueName, Tone[]> = {
  start: [
    { freq: 620, at: 0, duration: 0.07, gain: 0.5 },
    { freq: 880, at: 0.06, duration: 0.09, gain: 0.5 }
  ],
  stop: [
    { freq: 880, at: 0, duration: 0.06, gain: 0.4 },
    { freq: 620, at: 0.05, duration: 0.08, gain: 0.4 }
  ],
  insert: [{ freq: 1040, at: 0, duration: 0.12, gain: 0.45 }],
  nospeech: [{ freq: 440, at: 0, duration: 0.1, gain: 0.3 }],
  error: [
    { freq: 220, at: 0, duration: 0.16, gain: 0.5, type: 'square' },
    { freq: 185, at: 0.1, duration: 0.16, gain: 0.4, type: 'square' }
  ]
}

/** Play a cue at the given volume (0..1). Resolves when scheduled. */
export function playCue(ctx: AudioContext, cue: CueName, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume))
  if (clamped === 0) return
  const now = ctx.currentTime
  for (const tone of CUES[cue]) {
    const osc = new OscillatorNode(ctx, { frequency: tone.freq, type: tone.type ?? 'sine' })
    const gain = new GainNode(ctx, { gain: 0 })
    // Soft attack and release so blips never click.
    gain.gain.setValueAtTime(0, now + tone.at)
    gain.gain.linearRampToValueAtTime(tone.gain * clamped * 0.28, now + tone.at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + tone.at)
    osc.stop(now + tone.at + tone.duration + 0.02)
  }
}

export const CUE_NAMES = Object.keys(CUES) as CueName[]
