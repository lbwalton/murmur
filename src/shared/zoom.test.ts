// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { ZOOM_STEPS, nextZoom, normalizeZoom, zoomActionForKey } from './zoom'

describe('nextZoom', () => {
  it('steps in and out like a browser', () => {
    expect(nextZoom(1, 'in')).toBe(1.1)
    expect(nextZoom(1.1, 'in')).toBe(1.25)
    expect(nextZoom(1.25, 'in')).toBe(1.5)
    expect(nextZoom(1, 'out')).toBe(0.9)
    expect(nextZoom(0.9, 'out')).toBe(0.8)
    expect(nextZoom(2, 'in')).toBe(2.5)
    expect(nextZoom(2.5, 'in')).toBe(3)
  })

  it('holds at the ends and resets to 100 percent', () => {
    expect(nextZoom(3, 'in')).toBe(3)
    expect(nextZoom(0.8, 'out')).toBe(0.8)
    expect(nextZoom(1.75, 'reset')).toBe(1)
  })

  it('walks every step and back', () => {
    let z = ZOOM_STEPS[0] as number
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      z = nextZoom(z, 'in')
      expect(z).toBe(ZOOM_STEPS[i])
    }
    for (let i = ZOOM_STEPS.length - 2; i >= 0; i--) {
      z = nextZoom(z, 'out')
      expect(z).toBe(ZOOM_STEPS[i])
    }
  })
})

describe('normalizeZoom', () => {
  it('snaps a stored factor to the nearest step', () => {
    expect(normalizeZoom(1.24)).toBe(1.25)
    expect(normalizeZoom(1.3)).toBe(1.25)
    expect(normalizeZoom(2.2)).toBe(2)
    expect(normalizeZoom(2.8)).toBe(3)
    expect(normalizeZoom(5)).toBe(3)
    expect(normalizeZoom(0.1)).toBe(0.8)
  })

  it('reads anything unreadable as 100 percent', () => {
    expect(normalizeZoom('2')).toBe(1)
    expect(normalizeZoom(Number.NaN)).toBe(1)
    expect(normalizeZoom(Number.POSITIVE_INFINITY)).toBe(1)
    expect(normalizeZoom(undefined)).toBe(1)
  })
})

describe('zoomActionForKey', () => {
  const key = (k: string, mods: Partial<{ control: boolean; meta: boolean; alt: boolean; type: string }> = {}) => ({
    type: 'keyDown',
    key: k,
    control: true,
    meta: false,
    alt: false,
    ...mods
  })

  it('maps Ctrl =, Ctrl +, Ctrl - and Ctrl 0', () => {
    expect(zoomActionForKey(key('='))).toBe('in')
    expect(zoomActionForKey(key('+'))).toBe('in')
    expect(zoomActionForKey(key('-'))).toBe('out')
    expect(zoomActionForKey(key('0'))).toBe('reset')
  })

  it('lets every other press through', () => {
    expect(zoomActionForKey(key('=', { control: false }))).toBeNull()
    expect(zoomActionForKey(key('=', { alt: true }))).toBeNull()
    expect(zoomActionForKey(key('=', { meta: true }))).toBeNull()
    expect(zoomActionForKey(key('=', { type: 'keyUp' }))).toBeNull()
    expect(zoomActionForKey(key('v'))).toBeNull()
  })
})
