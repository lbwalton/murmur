// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import cosmetics from '../../shared/cosmetics.json'
import ranks from '../../shared/ranks.json'
import type { SessionEvent } from './history'
import { type CosmeticsFile, computeCosmetics, resolveAccentColor } from './cosmetics'
import { type RanksFile, computeProgress } from './ranks'

const SPEC = cosmetics as unknown as CosmeticsFile
const LADDER = ranks as unknown as RanksFile
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 0, 5, 10, 0).getTime()

function sessions(days: number, wordsPerDay: number): SessionEvent[] {
  return Array.from({ length: days }, (_, i) => ({
    at: T0 + i * DAY,
    durationMs: 60_000,
    rawText: 'r',
    finalText: 'f',
    words: wordsPerDay,
    wpm: 100
  }))
}

describe('cosmetic unlocks', () => {
  it('a fresh user has only the defaults', () => {
    const progress = computeProgress([], LADDER)
    const report = computeCosmetics(SPEC, progress, [])
    expect(report.overlayStyles.find((s) => s.id === 'bars')?.unlocked).toBe(true)
    expect(report.overlayStyles.find((s) => s.id === 'speckle')?.unlocked).toBe(true)
    expect(report.overlayStyles.find((s) => s.id === 'pulse')?.unlocked).toBe(false)
    expect(report.uiThemes.find((t) => t.id === 'mist')?.unlocked).toBe(false)
  })

  it('the white belt unlocks pulse and the belt accent', () => {
    const progress = computeProgress(sessions(1, 200), LADDER)
    const report = computeCosmetics(SPEC, progress, [])
    expect(progress.rank.id).toBe('white')
    expect(report.overlayStyles.find((s) => s.id === 'pulse')?.unlocked).toBe(true)
    expect(report.accents.find((a) => a.id === 'belt')?.unlocked).toBe(true)
  })

  it('the blue belt unlocks the mist theme, earlier ranks stay unlocked', () => {
    const progress = computeProgress(sessions(14, 2000), LADDER)
    expect(progress.rank.id).toBe('blue')
    const report = computeCosmetics(SPEC, progress, [])
    expect(report.uiThemes.find((t) => t.id === 'mist')?.unlocked).toBe(true)
    expect(report.overlayStyles.find((s) => s.id === 'pulse')?.unlocked).toBe(true)
    expect(report.beltColor).toBe(SPEC.beltColors.blue)
  })

  it('achievement-gated accents follow earned badges', () => {
    const progress = computeProgress(sessions(1, 200), LADDER)
    const locked = computeCosmetics(SPEC, progress, [])
    expect(locked.accents.find((a) => a.id === 'ember')?.unlocked).toBe(false)
    const earned = [{ id: 'marathon', at: T0 }]
    const unlocked = computeCosmetics(SPEC, progress, earned)
    expect(unlocked.accents.find((a) => a.id === 'ember')?.unlocked).toBe(true)
  })

  it('the founder has everything; the belt fabric is solid red, not gold', () => {
    const progress = computeProgress([], LADDER, { founder: true })
    const report = computeCosmetics(SPEC, progress, [])
    expect(report.overlayStyles.every((s) => s.unlocked)).toBe(true)
    expect(report.beltColor).toBe(SPEC.beltColors.red)
    expect(report.accents.find((a) => a.id === 'gold')?.unlocked).toBe(true)
  })
})

describe('resolveAccentColor', () => {
  it('locked or unknown accents fall back to signal amber', () => {
    const progress = computeProgress([], LADDER)
    expect(resolveAccentColor('ember', SPEC, progress, [])).toBe('#f0a44b')
    expect(resolveAccentColor('nonsense', SPEC, progress, [])).toBe('#f0a44b')
  })

  it('the belt accent tracks the current rank color', () => {
    const progress = computeProgress(sessions(14, 2000), LADDER)
    expect(resolveAccentColor('belt', SPEC, progress, [])).toBe(SPEC.beltColors.blue)
  })

  it('a founder belt accent resolves to red; gold is its own accent', () => {
    const progress = computeProgress([], LADDER, { founder: true })
    expect(resolveAccentColor('belt', SPEC, progress, [])).toBe(SPEC.beltColors.red)
    expect(resolveAccentColor('gold', SPEC, progress, [])).toBe(SPEC.founderGold)
    const mortal = computeProgress([], LADDER)
    expect(resolveAccentColor('gold', SPEC, mortal, [])).toBe('#f0a44b')
  })
})
