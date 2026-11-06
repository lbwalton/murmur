// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from '../shared/settings'
import { updatePlan } from './updater-rules'

describe('updatePlan', () => {
  it('Automatic checks and downloads', () => {
    expect(updatePlan('auto')).toEqual({ check: true, autoDownload: true })
  })

  it('Ask first checks, and downloads only after a click', () => {
    expect(updatePlan('ask')).toEqual({ check: true, autoDownload: false })
  })

  it('Off makes no request at all', () => {
    expect(updatePlan('off')).toEqual({ check: false, autoDownload: false })
  })
})

describe('the updates setting', () => {
  it('defaults to Automatic, as murmur has always behaved', () => {
    expect(DEFAULT_SETTINGS.updates).toBe('auto')
  })

  it('falls back to Automatic on a value it does not know, so a bad file cannot stop security fixes', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { updates: 'sometimes' }).updates).toBe('auto')
    expect(mergeSettings(DEFAULT_SETTINGS, { updates: 'off' }).updates).toBe('off')
  })
})
