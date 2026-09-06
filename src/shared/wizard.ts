// SPDX-License-Identifier: GPL-3.0-only
// First-run wizard state machine. Pure: the renderer feeds it status
// facts, it answers which steps exist, whether advancing is allowed,
// and where back goes. Abandoning is always allowed; the wizard is
// re-runnable from settings.

export type WizardStep = 'welcome' | 'key' | 'permissions' | 'hotkey' | 'try' | 'done'

export const WIZARD_STEPS: readonly WizardStep[] = [
  'welcome',
  'key',
  'permissions',
  'hotkey',
  'try',
  'done'
]

export interface WizardFacts {
  keyPresent: boolean
  connected: boolean
  micGranted: boolean
  accessibilityGranted: boolean
  inputMonitoringActive: boolean
  bindingValid: boolean
  /** Permissions step only exists on macOS. */
  isMac: boolean
}

/** The steps that apply on this platform, in order. */
export function stepsFor(facts: Pick<WizardFacts, 'isMac'>): WizardStep[] {
  return WIZARD_STEPS.filter((step) => step !== 'permissions' || facts.isMac)
}

/**
 * Whether the wizard allows moving forward FROM this step. Welcome and
 * try always advance (try is practice, not a gate); the setup steps
 * gate on their facts so nobody finishes half set up by accident.
 */
export function canAdvance(step: WizardStep, facts: WizardFacts): boolean {
  switch (step) {
    case 'welcome':
      return true
    case 'key':
      return facts.keyPresent && facts.connected
    case 'permissions':
      return facts.micGranted && facts.accessibilityGranted && facts.inputMonitoringActive
    case 'hotkey':
      return facts.bindingValid
    case 'try':
      return true
    case 'done':
      return false
  }
}

export function nextStep(step: WizardStep, facts: WizardFacts): WizardStep | null {
  const steps = stepsFor(facts)
  const index = steps.indexOf(step)
  if (index === -1 || index === steps.length - 1) return null
  return canAdvance(step, facts) ? steps[index + 1] : null
}

export function previousStep(step: WizardStep, facts: WizardFacts): WizardStep | null {
  const steps = stepsFor(facts)
  const index = steps.indexOf(step)
  if (index <= 0) return null
  return steps[index - 1]
}

/** A fresh profile starts at welcome; a configured one skips the wizard. */
export function shouldOfferWizard(facts: WizardFacts): boolean {
  return !(facts.keyPresent && facts.bindingValid)
}
