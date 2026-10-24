// SPDX-License-Identifier: GPL-3.0-only
// The gate's numbers come from shared/speech-gate.json (ios/prd.json
// IOS-003): with other numbers swapped in, its defaults follow them.
import { describe, expect, it, vi } from 'vitest'
import { DEAD_STREAM_PEAK, hasSpeechEnergy, trimSilence, voicedMs } from './speech-gate'

vi.mock('../../shared/speech-gate.json', () => ({
  default: { windowMs: 60, rmsThreshold: 0.6, minVoicedMs: 900, paddingMs: 0, deadStreamPeak: 0.4 }
}))

const RATE = 16_000
const level = (seconds: number, value: number) => new Float32Array(Math.round(seconds * RATE)).fill(value)

describe('speech gate numbers from shared/speech-gate.json', () => {
  it('uses the shared window and threshold', () => {
    expect(voicedMs(level(1, 0.5), RATE)).toBe(0)
    expect(voicedMs(level(1, 0.7), RATE)).toBe(960)
  })

  it('uses the shared minimum voiced time', () => {
    expect(hasSpeechEnergy(level(1, 0.7), RATE)).toBe(true)
    expect(hasSpeechEnergy(level(0.5, 0.7), RATE)).toBe(false)
  })

  it('uses the shared padding', () => {
    const take = new Float32Array(2 * RATE)
    take.fill(0.7, RATE / 2, RATE)
    expect(trimSilence(take, RATE).length).toBe(6720)
  })

  it('uses the shared dead-stream peak', () => {
    expect(DEAD_STREAM_PEAK).toBe(0.4)
  })
})
