// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compareVersions, copySharedJson, findOnPath, parseSmokeLine, pickSmokeSimulator } from './ios'

const iphone17 = { name: 'iPhone 17', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', productFamily: 'iPhone' }
const iphone18 = { name: 'iPhone 18 Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro', productFamily: 'iPhone' }
const ipad = { name: 'iPad (A16)', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-A16', productFamily: 'iPad' }
const runtime = (version, extra = {}) => ({
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replace('.', '-')}`,
  version,
  platform: 'iOS',
  isAvailable: true,
  supportedDeviceTypes: [iphone17, iphone18, ipad],
  ...extra
})
const ios265 = runtime('26.5')
const ios270 = runtime('27.0')
const ios18 = runtime('18.6')
const device = (name, udid, extra = {}) => ({ name, udid, state: 'Shutdown', isAvailable: true, ...extra })

describe('the smoke simulator', () => {
  it('never borrows another project simulator, even a booted one', () => {
    const list = {
      devicetypes: [iphone17, iphone18, ipad],
      runtimes: [ios265, ios270],
      devices: { [ios270.identifier]: [device('Parently QA', 'P1', { state: 'Booted' }), device('iPhone 18 Pro', 'X1', { state: 'Booted' })] }
    }
    expect(pickSmokeSimulator(list)).toEqual({
      create: { name: 'murmur smoke', deviceType: iphone17.identifier, runtime: ios270.identifier }
    })
  })

  it('reuses murmur smoke on any iOS 26 or later runtime', () => {
    const list = { devicetypes: [iphone17], runtimes: [ios265, ios270], devices: { [ios265.identifier]: [device('murmur smoke', 'M1')] } }
    expect(pickSmokeSimulator(list)).toEqual({ udid: 'M1' })
  })

  it('skips a murmur smoke device that is no longer available', () => {
    const list = {
      devicetypes: [iphone17],
      runtimes: [ios270],
      devices: { [ios270.identifier]: [device('murmur smoke', 'OLD', { isAvailable: false })] }
    }
    expect(pickSmokeSimulator(list)).toHaveProperty('create')
  })

  it('falls back to any iPhone when iPhone 17 is not offered', () => {
    const only18 = runtime('27.0', { supportedDeviceTypes: [ipad, iphone18] })
    const list = { devicetypes: [iphone18, ipad], runtimes: [only18], devices: {} }
    expect(pickSmokeSimulator(list).create.deviceType).toBe(iphone18.identifier)
  })

  it('falls back to the newest iPhone, which simctl lists first', () => {
    const iphone11 = { name: 'iPhone 11', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-11', productFamily: 'iPhone' }
    const no17 = runtime('27.0', { supportedDeviceTypes: [iphone18, ipad, iphone11] })
    const list = { devicetypes: [iphone18, ipad, iphone11], runtimes: [no17], devices: {} }
    expect(pickSmokeSimulator(list).create.deviceType).toBe(iphone18.identifier)
  })

  it('says what to install when no iOS 26 runtime exists', () => {
    const list = { devicetypes: [iphone17], runtimes: [ios18], devices: {} }
    expect(() => pickSmokeSimulator(list)).toThrow(/no iOS 26 or later simulator runtime/)
  })

  it('compares versions numerically', () => {
    expect(compareVersions('27.0', '26.5')).toBeGreaterThan(0)
    expect(compareVersions('26.10', '26.9')).toBeGreaterThan(0)
    expect(compareVersions('26.5', '26.5')).toBe(0)
  })
})

describe('tools on PATH', () => {
  it('finds a tool and reports a missing one as null', () => {
    const pathEnv = ['/opt/homebrew/bin', '/usr/bin'].join(delimiter)
    const exists = (p) => p === join('/opt/homebrew/bin', 'xcodegen')
    expect(findOnPath('xcodegen', pathEnv, exists)).toBe(join('/opt/homebrew/bin', 'xcodegen'))
    expect(findOnPath('xcodegen', '/usr/bin', exists)).toBeNull()
    expect(findOnPath('xcodegen', '', exists)).toBeNull()
  })
})

describe('the shared rules copy', () => {
  const dirs = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('copies only JSON and clears files that were removed from shared/', () => {
    const src = mkdtempSync(join(tmpdir(), 'murmur-src-'))
    const dest = mkdtempSync(join(tmpdir(), 'murmur-dest-'))
    dirs.push(src, dest)
    writeFileSync(join(src, 'format-spec.json'), '{}')
    writeFileSync(join(src, 'notes.txt'), 'not a rule')
    writeFileSync(join(dest, 'removed.json'), '{}')
    expect(copySharedJson(src, dest)).toBe(1)
    expect(readdirSync(dest)).toEqual(['format-spec.json'])
  })
})

describe('the smoke line', () => {
  it('finds SMOKE_RESULT among other output, Windows or pty line endings included', () => {
    const output = 'booting\r\nsmoke keychain: status -34018\r\nSMOKE_RESULT {"ok":false,"checks":{"keychain":false}}\r\n'
    expect(parseSmokeLine(output)).toEqual({ ok: false, checks: { keychain: false } })
  })

  it('returns null when the app never printed it', () => {
    expect(parseSmokeLine('crashed\n')).toBeNull()
  })
})
