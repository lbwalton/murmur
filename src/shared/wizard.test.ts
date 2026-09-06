// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { type WizardFacts, canAdvance, nextStep, previousStep, shouldOfferWizard, stepsFor } from './wizard'

const facts = (over: Partial<WizardFacts> = {}): WizardFacts => ({
  keyPresent: true,
  connected: true,
  micGranted: true,
  accessibilityGranted: true,
  inputMonitoringActive: true,
  bindingValid: true,
  isMac: true,
  ...over
})

describe('stepsFor', () => {
  it('includes permissions only on macOS', () => {
    expect(stepsFor({ isMac: true })).toContain('permissions')
    expect(stepsFor({ isMac: false })).not.toContain('permissions')
  })
})

describe('canAdvance gating', () => {
  it('gates the key step on a saved AND connected key', () => {
    expect(canAdvance('key', facts())).toBe(true)
    expect(canAdvance('key', facts({ connected: false }))).toBe(false)
    expect(canAdvance('key', facts({ keyPresent: false }))).toBe(false)
  })

  it('gates permissions on all three grants', () => {
    expect(canAdvance('permissions', facts())).toBe(true)
    expect(canAdvance('permissions', facts({ inputMonitoringActive: false }))).toBe(false)
  })

  it('never gates welcome or try', () => {
    const bare = facts({ keyPresent: false, connected: false, bindingValid: false })
    expect(canAdvance('welcome', bare)).toBe(true)
    expect(canAdvance('try', bare)).toBe(true)
  })
})

describe('navigation', () => {
  it('walks the full macOS path forward', () => {
    const f = facts()
    expect(nextStep('welcome', f)).toBe('key')
    expect(nextStep('key', f)).toBe('permissions')
    expect(nextStep('permissions', f)).toBe('hotkey')
    expect(nextStep('hotkey', f)).toBe('try')
    expect(nextStep('try', f)).toBe('done')
    expect(nextStep('done', f)).toBeNull()
  })

  it('skips permissions on other platforms', () => {
    const f = facts({ isMac: false })
    expect(nextStep('key', f)).toBe('hotkey')
    expect(previousStep('hotkey', f)).toBe('key')
  })

  it('refuses to advance past an unsatisfied gate', () => {
    expect(nextStep('key', facts({ connected: false }))).toBeNull()
  })

  it('back always works except from welcome', () => {
    const f = facts()
    expect(previousStep('welcome', f)).toBeNull()
    expect(previousStep('key', f)).toBe('welcome')
    expect(previousStep('done', f)).toBe('try')
  })
})

describe('shouldOfferWizard', () => {
  it('offers on fresh or broken profiles, not configured ones', () => {
    expect(shouldOfferWizard(facts({ keyPresent: false }))).toBe(true)
    expect(shouldOfferWizard(facts({ bindingValid: false }))).toBe(true)
    expect(shouldOfferWizard(facts())).toBe(false)
  })
})
