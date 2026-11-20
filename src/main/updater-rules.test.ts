// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from '../shared/settings'
import {
  NO_UPDATE,
  RESTART_QUIET_LOOKS,
  RESTART_UNREADY_LOOKS,
  type RestartWait,
  type TakeState,
  type UpdateOffer,
  restartLook,
  takeBusy,
  updateMenuItem,
  updatePlan
} from './updater-rules'

describe('updatePlan', () => {
  it('Automatic checks and downloads', () => {
    expect(updatePlan('auto')).toEqual({ check: true, autoDownload: true, installOnQuit: true })
  })

  it('Ask first checks, and downloads only after a click', () => {
    expect(updatePlan('ask')).toEqual({ check: true, autoDownload: false, installOnQuit: true })
  })

  it('Off makes no request at all', () => {
    expect(updatePlan('off')).toEqual({ check: false, autoDownload: false, installOnQuit: false })
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

describe('the update item in the menus (US-178)', () => {
  const at = (partial: Partial<UpdateOffer>): UpdateOffer => ({ ...NO_UPDATE, live: true, ...partial })

  it('offers a check while updates are on', () => {
    expect(updateMenuItem('auto', at({}))).toEqual({ label: 'Check for updates', action: 'check' })
    expect(updateMenuItem('ask', at({}))).toEqual({ label: 'Check for updates', action: 'check' })
  })

  it('shows nothing with Off, so Off still asks GitHub for nothing', () => {
    expect(updateMenuItem('off', at({}))).toBeNull()
    expect(updateMenuItem('off', at({ ready: '0.1.19' }))).toBeNull()
  })

  it('shows nothing where the updater is not running (dev, smoke, a failed load)', () => {
    expect(updateMenuItem('auto', NO_UPDATE)).toBeNull()
    expect(updateMenuItem('auto', { ...NO_UPDATE, ready: '0.1.19' })).toBeNull()
  })

  it('greys out while a check you asked for runs', () => {
    expect(updateMenuItem('auto', at({ checking: true }))).toEqual({ label: 'Checking for updates…', action: null })
  })

  it('names the version while it downloads', () => {
    expect(updateMenuItem('auto', at({ available: '0.1.19', downloading: true }))).toEqual({
      label: 'Downloading 0.1.19…',
      action: null
    })
    expect(updateMenuItem('auto', at({ downloading: true }))?.label).toBe('Downloading the update…')
  })

  it('keeps the same label as the download moves, so the menus are not rebuilt for every percent', () => {
    expect(updateMenuItem('auto', at({ available: '0.1.19', downloading: true, percent: 42 }))?.label).toBe(
      'Downloading 0.1.19…'
    )
  })

  it('offers the download with Ask first, and again after a download failed', () => {
    expect(updateMenuItem('ask', at({ available: '0.1.19' }))).toEqual({ label: 'Download 0.1.19', action: 'download' })
    expect(updateMenuItem('auto', at({ available: '0.1.19' }))?.action).toBe('download')
  })

  it('offers the restart once a version is downloaded', () => {
    expect(updateMenuItem('auto', at({ ready: '0.1.19' }))).toEqual({
      label: 'Restart to update to 0.1.19',
      action: 'restart'
    })
    expect(updateMenuItem('ask', at({ ready: '0.1.19', checking: true }))?.action).toBe('restart')
  })

  it('greys out once the restart is under way, so a second click cannot start another', () => {
    expect(updateMenuItem('auto', at({ ready: '0.1.19', restarting: true }))).toEqual({
      label: 'Restarting…',
      action: null
    })
  })

  it('says it waits when the restart was clicked during a take', () => {
    expect(updateMenuItem('auto', at({ ready: '0.1.19', restarting: true, restartPending: true }))).toEqual({
      label: 'Restart after this take',
      action: null
    })
  })
})

describe('when a restart would cost words (US-178)', () => {
  const take = (partial: Partial<TakeState>): TakeState => ({
    phase: 'idle',
    handsFreeLocked: false,
    parking: false,
    clipboardPending: false,
    ...partial
  })

  it('waits while a take records, its words are on their way, or they are landing', () => {
    expect(takeBusy(take({ phase: 'recording' }))).toBe(true)
    expect(takeBusy(take({ phase: 'processing' }))).toBe(true)
    expect(takeBusy(take({ phase: 'inserted' }))).toBe(true)
  })

  it('waits until a paste has put your clipboard back', () => {
    expect(takeBusy(take({ clipboardPending: true }))).toBe(true)
  })

  it('waits while a hands-free take is locked or parking for Retry', () => {
    expect(takeBusy(take({ handsFreeLocked: true }))).toBe(true)
    expect(takeBusy(take({ parking: true }))).toBe(true)
  })

  it('goes ahead at rest, and after a take ended any other way', () => {
    for (const phase of ['idle', 'error', 'nospeech', 'hint', 'cancelled'] as const) {
      expect(takeBusy(take({ phase }))).toBe(false)
    }
  })
})

describe('a restart that was clicked (US-178)', () => {
  const run = (looks: Array<[busy: boolean, ready: boolean]>): string[] => {
    let wait: RestartWait = { quiet: 0, unready: 0 }
    return looks.map(([busy, ready]) => {
      const look = restartLook(wait, busy, ready)
      wait = look.wait
      return look.step
    })
  }

  it('goes after quiet looks in a row, never on the first one', () => {
    expect(RESTART_QUIET_LOOKS).toBe(2)
    expect(run([[false, true], [false, true]])).toEqual(['wait', 'go'])
  })

  it('starts the count again whenever a take is running', () => {
    expect(run([[false, true], [true, true], [false, true], [false, true]])).toEqual(['wait', 'wait-take', 'wait', 'go'])
  })

  it('waits as long as you keep dictating', () => {
    const steps = run(Array.from({ length: 1000 }, () => [true, false] as [boolean, boolean]))
    expect(new Set(steps)).toEqual(new Set(['wait-take']))
  })

  it('waits for the installer to have the update, then goes', () => {
    expect(run([[false, false], [false, false], [false, true], [false, true]])).toEqual([
      'wait-installer',
      'wait-installer',
      'wait',
      'go'
    ])
  })

  it('gives up when the installer never gets the update', () => {
    const steps = run(Array.from({ length: RESTART_UNREADY_LOOKS }, () => [false, false] as [boolean, boolean]))
    expect(steps.at(-1)).toBe('give-up')
    expect(steps.filter((step) => step === 'give-up')).toHaveLength(1)
  })
})
