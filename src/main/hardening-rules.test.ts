// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { navigationAllowed, permissionAllowed, refusedSwitch } from './hardening-rules'

describe('refusedSwitch', () => {
  const has = (present: string[]) => (name: string) => present.includes(name)

  it('refuses a remote debugging port or pipe in a packaged build', () => {
    expect(refusedSwitch(true, has(['remote-debugging-port']))).toBe('remote-debugging-port')
    expect(refusedSwitch(true, has(['remote-debugging-pipe']))).toBe('remote-debugging-pipe')
  })

  it('lets a packaged build start without them', () => {
    expect(refusedSwitch(true, has(['murmur-relaunched', 'murmur-userdata']))).toBeNull()
  })

  it('never refuses a dev run', () => {
    expect(refusedSwitch(false, has(['remote-debugging-port']))).toBeNull()
  })
})

describe('permissionAllowed', () => {
  it('gives the audio window the microphone', () => {
    expect(permissionAllowed('media', true, ['audio'])).toBe(true)
    expect(permissionAllowed('media', true, ['unknown'])).toBe(true)
    expect(permissionAllowed('media', true)).toBe(true)
  })

  it('never gives the camera, even to the audio window', () => {
    expect(permissionAllowed('media', true, ['video'])).toBe(false)
    expect(permissionAllowed('media', true, ['audio', 'video'])).toBe(false)
  })

  it('gives every other window nothing', () => {
    expect(permissionAllowed('media', false, ['audio'])).toBe(false)
    expect(permissionAllowed('clipboard-read', false)).toBe(false)
  })

  it('gives the audio window nothing beyond the microphone', () => {
    for (const permission of ['clipboard-read', 'notifications', 'geolocation', 'openExternal', 'fullscreen']) {
      expect(permissionAllowed(permission, true)).toBe(false)
    }
  })
})

describe('navigationAllowed', () => {
  const page = 'file:///Applications/murmur.app/Contents/Resources/app.asar/out/renderer/settings/index.html'

  it('allows a reload of the same page', () => {
    expect(navigationAllowed(page, page)).toBe(true)
  })

  it('refuses anywhere else, remote or local', () => {
    expect(navigationAllowed(page, 'https://example.com/')).toBe(false)
    expect(navigationAllowed(page, 'file:///Users/someone/evil.html')).toBe(false)
    expect(navigationAllowed(page, `${page}?other=1`)).toBe(false)
  })

  it('refuses when the window has no page yet', () => {
    expect(navigationAllowed('', '')).toBe(false)
  })
})
