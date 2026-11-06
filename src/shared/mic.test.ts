// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  type MicDevice,
  MoveTries,
  aliasName,
  defaultMic,
  micTarget,
  moveAction,
  onTarget,
  realMics,
  sanitizeMicReport,
  targetKey
} from './mic'

const FOLLOW = { id: '', label: '' }

// LaBroi's Mac on 2026-10-23, the way Chromium lists it.
const wave: MicDevice = { deviceId: 'w1', groupId: 'gw', label: 'Elgato Wave:3' }
const dock: MicDevice = { deviceId: 'c1', groupId: 'gc', label: 'CalDigit TS4 Audio - Front' }
const built: MicDevice = { deviceId: 'b1', groupId: 'gb', label: 'MacBook Pro Microphone' }
const alias = (to: MicDevice): MicDevice => ({ deviceId: 'default', groupId: to.groupId, label: `Default - ${to.label}` })

describe('realMics and aliasName', () => {
  it("drops Chromium's default and communications entries", () => {
    const comms = { deviceId: 'communications', groupId: 'gw', label: 'Communications - Elgato Wave:3' }
    expect(realMics([alias(wave), comms, wave, dock])).toEqual([wave, dock])
  })

  it('reads the device name out of an alias label', () => {
    expect(aliasName('Default - Elgato Wave:3')).toBe('Elgato Wave:3')
    expect(aliasName('Communications - Headset')).toBe('Headset')
    expect(aliasName('Elgato Wave:3')).toBe('Elgato Wave:3')
  })
})

describe('defaultMic', () => {
  it('finds the real input the default points at', () => {
    expect(defaultMic([alias(dock), wave, dock])).toEqual(dock)
  })

  it('takes the first input when there is no alias entry', () => {
    expect(defaultMic([built, wave])).toEqual(built)
  })

  it('keeps the group of an alias with no real twin', () => {
    expect(defaultMic([alias(wave), dock])).toEqual({ deviceId: 'default', groupId: 'gw', label: 'Elgato Wave:3' })
  })
})

describe('micTarget', () => {
  it('follows the default when nothing is picked', () => {
    expect(micTarget([alias(wave), wave, dock], FOLLOW)).toEqual({
      deviceId: null,
      groupId: 'gw',
      label: 'Elgato Wave:3',
      standIn: false
    })
  })

  it('opens the picked mic by id while it is plugged in', () => {
    const t = micTarget([alias(dock), wave, dock], { id: 'w1', label: 'Elgato Wave:3' })
    expect(t).toEqual({ deviceId: 'w1', groupId: 'gw', label: 'Elgato Wave:3', standIn: false })
  })

  it('falls back to the default while the pick is unplugged, and says so', () => {
    const t = micTarget([alias(dock), dock], { id: 'w1', label: 'Elgato Wave:3' })
    expect(t).toEqual({ deviceId: null, groupId: 'gc', label: 'CalDigit TS4 Audio - Front', standIn: true })
  })

  it('returns to the pick when it is plugged back in', () => {
    const choice = { id: 'w1', label: 'Elgato Wave:3' }
    expect(micTarget([alias(dock), dock], choice).deviceId).toBeNull()
    expect(micTarget([alias(dock), dock, wave], choice).deviceId).toBe('w1')
  })

  it('matches the pick by name when its id changed', () => {
    const moved = { ...wave, deviceId: 'w2' }
    expect(micTarget([alias(dock), dock, moved], { id: 'w1', label: 'Elgato Wave:3' }).deviceId).toBe('w2')
  })
})

describe('onTarget and moveAction', () => {
  const live = (d: MicDevice, opened = 'default'): { deviceId: string; groupId: string } => ({
    deviceId: opened === 'default' ? 'default' : d.deviceId,
    groupId: d.groupId
  })

  it('stays put while the stream is on the default', () => {
    const target = micTarget([alias(wave), wave, dock], FOLLOW)
    expect(onTarget(live(wave), target)).toBe(true)
    expect(moveAction(live(wave), target, false, '')).toBe('stay')
  })

  it('moves back to the default between takes (the 2026-10-23 report)', () => {
    // The stream reopened on the dock while the Wave:3 blipped; the Wave:3 is default again.
    const target = micTarget([alias(wave), wave, dock], FOLLOW)
    expect(moveAction(live(dock), target, false, '')).toBe('move')
  })

  it('never moves in the middle of a take: it waits for the take to end', () => {
    const target = micTarget([alias(wave), wave, dock], FOLLOW)
    expect(moveAction(live(dock), target, true, '')).toBe('after-take')
  })

  it('moves to a pick by id even when the default is the same device', () => {
    const target = micTarget([alias(wave), wave, dock], { id: 'w1', label: 'Elgato Wave:3' })
    expect(moveAction(live(wave), target, false, '')).toBe('move')
    expect(moveAction(live(wave, 'exact'), target, false, '')).toBe('stay')
  })

  it('tries a move once: a target the stream cannot reach never loops', () => {
    const target = micTarget([alias(wave), wave, dock], FOLLOW)
    expect(moveAction(live(dock), target, false, targetKey(target))).toBe('stay')
  })

  it('tries an unreachable target again after a device change or a re-arm, never on its own', () => {
    const target = micTarget([alias(wave), wave, dock], FOLLOW)
    const tries = new MoveTries()
    expect(moveAction(live(dock), target, false, tries.key)).toBe('move')
    tries.record(target)
    // The move landed on the dock again (the list and the open disagreed).
    expect(moveAction(live(dock), target, false, tries.key)).toBe('stay')
    tries.reset()
    expect(moveAction(live(dock), target, false, tries.key)).toBe('move')
  })

  it('never churns on what it cannot tell', () => {
    const target = micTarget([], FOLLOW)
    expect(moveAction({ deviceId: 'default', groupId: 'gx' }, target, false, '')).toBe('stay')
    expect(moveAction(null, micTarget([alias(wave), wave], FOLLOW), false, '')).toBe('stay')
  })
})

describe('sanitizeMicReport', () => {
  it('keeps names and ids, drops anything else', () => {
    const report = sanitizeMicReport({
      devices: [{ id: 'w1', label: 'Elgato Wave:3' }, { id: 7 }, null, 'x'],
      current: 'Elgato Wave:3',
      standIn: 'yes'
    })
    expect(report).toEqual({
      devices: [{ id: 'w1', label: 'Elgato Wave:3' }],
      current: 'Elgato Wave:3',
      standIn: false,
      open: false,
      openMs: null
    })
    expect(sanitizeMicReport(null)).toEqual({ devices: [], current: '', standIn: false, open: false, openMs: null })
  })

  it('keeps whether the mic is open and a sane press time (US-135)', () => {
    expect(sanitizeMicReport({ open: true, openMs: 212.6 })).toMatchObject({ open: true, openMs: 213 })
    expect(sanitizeMicReport({ open: 'yes', openMs: -5 })).toMatchObject({ open: false, openMs: null })
    expect(sanitizeMicReport({ openMs: Number.NaN })).toMatchObject({ openMs: null })
  })
})
