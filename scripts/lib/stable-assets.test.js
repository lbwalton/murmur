// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { STABLE, checkRelease, sourceFor } from './stable-assets.js'

const asset = (name, digest = `sha256:${name}`) => ({ name, digest })

describe('sourceFor', () => {
  const names = ['murmur-0.1.8-arm64.dmg', 'murmur-0.1.8.exe', 'murmur-0.1.8-x64.exe', 'murmur-0.1.8-arm64.exe']

  it('maps the Windows copy to the combined installer, never an arch-specific one', () => {
    expect(sourceFor('windows', '0.1.8', names)).toBe('murmur-0.1.8.exe')
  })

  it('maps the Mac copy to the arm64 dmg today', () => {
    expect(sourceFor('mac', '0.1.8', names)).toBe('murmur-0.1.8-arm64.dmg')
  })

  it('prefers a universal dmg once a release carries one', () => {
    expect(sourceFor('mac', '0.1.8', [...names, 'murmur-0.1.8-universal.dmg'])).toBe('murmur-0.1.8-universal.dmg')
  })

  it('is null when the release has no source for that platform', () => {
    expect(sourceFor('mac', '0.1.8', ['murmur-0.1.8.exe'])).toBeNull()
    expect(sourceFor('windows', '0.1.9', names)).toBeNull()
  })

  it('names the stable copies exactly', () => {
    expect(STABLE).toEqual({ mac: 'murmur-mac.dmg', windows: 'murmur-windows.exe' })
  })
})

describe('checkRelease', () => {
  const base = [asset('murmur-0.1.8-arm64.dmg', 'sha256:aaa'), asset('murmur-0.1.8.exe', 'sha256:bbb')]

  it('passes when both stable copies match their sources byte for byte', () => {
    const assets = [...base, asset('murmur-mac.dmg', 'sha256:aaa'), asset('murmur-windows.exe', 'sha256:bbb')]
    expect(checkRelease('0.1.8', assets)).toEqual([])
  })

  it('reports each missing stable copy', () => {
    expect(checkRelease('0.1.8', base)).toEqual([
      'murmur-mac.dmg is missing (should copy murmur-0.1.8-arm64.dmg)',
      'murmur-windows.exe is missing (should copy murmur-0.1.8.exe)'
    ])
  })

  it('reports a stable copy that differs from its source', () => {
    const assets = [...base, asset('murmur-mac.dmg', 'sha256:old'), asset('murmur-windows.exe', 'sha256:bbb')]
    expect(checkRelease('0.1.8', assets)).toEqual(['murmur-mac.dmg differs from murmur-0.1.8-arm64.dmg'])
  })

  it('reports a release with no source file at all', () => {
    expect(checkRelease('0.1.8', [asset('murmur-0.1.8.exe', 'sha256:bbb'), asset('murmur-windows.exe', 'sha256:bbb')])).toEqual([
      'no Mac dmg for 0.1.8 to copy'
    ])
  })

  it('never passes a copy whose digest is unknown', () => {
    const assets = [...base, { name: 'murmur-mac.dmg', digest: null }, asset('murmur-windows.exe', 'sha256:bbb')]
    expect(checkRelease('0.1.8', assets)).toEqual(['murmur-mac.dmg differs from murmur-0.1.8-arm64.dmg'])
  })
})
