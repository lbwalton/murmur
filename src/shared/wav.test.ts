// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { TARGET_SAMPLE_RATE, downsample, encodeWavPcm16, parseWav } from './wav'

describe('downsample', () => {
  it('passes through at equal rates', () => {
    const input = Float32Array.from([0.1, 0.2, 0.3])
    expect(Array.from(downsample(input, 16000, 16000))).toEqual([
      0.10000000149011612, 0.20000000298023224, 0.30000001192092896
    ])
  })

  it('reduces 48k to a third of the samples', () => {
    const input = new Float32Array(48000)
    expect(downsample(input, 48000, 16000).length).toBe(16000)
  })

  it('interpolates between neighbors', () => {
    const input = Float32Array.from([0, 1])
    const out = downsample(input, 32000, 16000)
    expect(out.length).toBe(1)
    expect(out[0]).toBe(0)
  })

  it('handles empty input', () => {
    expect(downsample(new Float32Array(0), 48000, 16000).length).toBe(0)
  })
})

describe('encodeWavPcm16 and parseWav', () => {
  it('round-trips header fields', () => {
    const samples = new Float32Array(1600)
    samples[100] = 0.5
    const wav = encodeWavPcm16(samples, TARGET_SAMPLE_RATE)
    const info = parseWav(wav)
    expect(info.sampleRate).toBe(16000)
    expect(info.channels).toBe(1)
    expect(info.bitsPerSample).toBe(16)
    expect(info.sampleCount).toBe(1600)
    expect(info.peak).toBeCloseTo(0.5, 2)
  })

  it('clamps samples beyond -1..1', () => {
    const wav = encodeWavPcm16(Float32Array.from([2, -2]), 16000)
    const info = parseWav(wav)
    expect(info.peak).toBeCloseTo(1, 3)
  })

  it('has the right total byte length', () => {
    const wav = encodeWavPcm16(new Float32Array(100), 16000)
    expect(wav.length).toBe(44 + 200)
  })

  it('rejects garbage', () => {
    expect(() => parseWav(new Uint8Array([1, 2, 3]))).toThrow('not a WAV file')
    expect(() => parseWav(new Uint8Array(64))).toThrow('not a WAV file')
  })
})
