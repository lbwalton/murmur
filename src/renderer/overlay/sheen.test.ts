// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { SHEEN_EVERY_MS, SHEEN_LIMIT_MS, nextSheenIn, sheenAt, sheenFor } from './sheen'

describe('the drying sheen (US-091)', () => {
  it('crosses once as the brush lifts, at full strength', () => {
    expect(sheenAt(0)?.at).toBeCloseTo(-0.3)
    expect(sheenAt(0)?.alpha).toBe(0.4)
    expect(sheenAt(400)?.alpha).toBe(0.4)
    expect(sheenAt(780)?.alpha).toBe(0.4)
    expect(sheenAt(900)).toBeNull()
    expect(sheenAt(1900)).toBeNull()
  })

  it('returns softer every 2 seconds while processing runs long', () => {
    expect(SHEEN_EVERY_MS).toBe(2000)
    for (const start of [2000, 4000, 6000, 20000]) {
      expect(sheenAt(start)?.at).toBeCloseTo(-0.3)
      expect(sheenAt(start)?.alpha).toBe(0.22)
      expect(sheenAt(start + 400)?.alpha).toBe(0.22)
      expect(sheenAt(start + 1500)).toBeNull()
    }
  })

  it('moves across the wave during each pass', () => {
    const a = sheenAt(2100)!.at
    const b = sheenAt(2500)!.at
    expect(b).toBeGreaterThan(a)
  })

  it('shows nothing once processing ends, before it starts, or with reduced motion', () => {
    expect(sheenFor(false, 2100, false)).toBeNull()
    expect(sheenFor(true, 2100, true)).toBeNull()
    expect(sheenFor(true, -5, false)).toBeNull()
    expect(sheenFor(true, 2100, false)?.alpha).toBe(0.22)
  })
})

describe('the sheen rests (US-091 review)', () => {
  it('starts no pass after two minutes, so a stuck phase goes still', () => {
    expect(SHEEN_LIMIT_MS).toBe(120_000)
    expect(sheenAt(118_000)?.alpha).toBe(0.22)
    expect(sheenAt(120_000)).toBeNull()
    expect(sheenAt(120_400)).toBeNull()
    expect(sheenAt(300_000)).toBeNull()
  })

  it('says how long the loop may sleep before the next pass', () => {
    expect(nextSheenIn(1600)).toBe(400)
    expect(nextSheenIn(2000)).toBe(2000)
    expect(nextSheenIn(3100)).toBe(900)
    expect(nextSheenIn(117_500)).toBe(500)
    expect(nextSheenIn(118_500)).toBeNull()
  })
})
