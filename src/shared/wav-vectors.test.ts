// SPDX-License-Identifier: GPL-3.0-only
// Runs shared/wav-vectors.json. MurmurCore runs the same file, so both
// platforms write the same bytes (ios/prd.json IOS-003).
import { describe, expect, it } from 'vitest'
import vectors from '../../shared/wav-vectors.json'
import { encodeWavPcm16 } from './wav'

describe('shared/wav-vectors.json', () => {
  for (const wavCase of vectors.cases) {
    it(wavCase.name, () => {
      const bytes = encodeWavPcm16(Float32Array.from(wavCase.samples), wavCase.sampleRate)
      expect(Buffer.from(bytes).toString('hex')).toBe(wavCase.expectedHex)
    })
  }
})
