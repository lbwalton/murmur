// SPDX-License-Identifier: GPL-3.0-only
// WAV encoding for the recording pipeline: 16kHz mono PCM16, the format
// Whisper-style endpoints expect. Pure functions, unit-tested.

export const TARGET_SAMPLE_RATE = 16_000

/** Linear-interpolation resample. Good enough for speech into Whisper. */
export function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return Float32Array.from(input)
  if (input.length === 0) return new Float32Array(0)
  const ratio = inRate / outRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const right = Math.min(left + 1, input.length - 1)
    const frac = pos - left
    out[i] = input[left] * (1 - frac) + input[right] * frac
  }
  return out
}

/** Encode mono float samples (-1..1) as a complete WAV file. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(36, 'data')
  view.setUint32(40, dataLength, true)

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true)
  }
  return new Uint8Array(buffer)
}

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  sampleCount: number
  /** Peak absolute amplitude 0..1, for silence sanity checks. */
  peak: number
}

/** Parse a PCM WAV produced by encodeWavPcm16. Throws on malformed input. */
export function parseWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number, length: number) => {
    let s = ''
    for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i))
    return s
  }
  if (bytes.length < 44 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') {
    throw new Error('not a WAV file')
  }
  const channels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  const dataLength = view.getUint32(40, true)
  const sampleCount = dataLength / (bitsPerSample / 8) / channels
  let peak = 0
  for (let i = 0; i < sampleCount; i++) {
    const v = Math.abs(view.getInt16(44 + i * 2, true) / 32768)
    if (v > peak) peak = v
  }
  return { sampleRate, channels, bitsPerSample, sampleCount, peak }
}
