// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { addressWear, paintingWears } from './themeWear'

describe('paper wear in the window address (US-186)', () => {
  it('reads a wear step main put in the address, and nothing else', () => {
    expect(addressWear('?theme=rice&wear=3')).toBe(3)
    expect(addressWear('?theme=rice&wear=4')).toBe(4)
    expect(addressWear('?theme=rice')).toBe(0)
    for (const bad of ['0', '5', '-1', '2.5', 'worn', '']) expect(addressWear(`?wear=${bad}`), bad).toBe(0)
  })

  it('wears only a painting that wears: rice paper', () => {
    expect(paintingWears('rice')).toBe(true)
    for (const scene of ['moonlit', 'wave', 'fire', 'storm', '', null, undefined]) expect(paintingWears(scene), String(scene)).toBe(false)
  })
})
