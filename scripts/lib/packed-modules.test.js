// SPDX-License-Identifier: GPL-3.0-only
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { missingModules, packedPlaces, runtimeModules } from './packed-modules'

const dirs = []
const project = (packages) => {
  const root = mkdtempSync(join(tmpdir(), 'murmur-packed-'))
  dirs.push(root)
  for (const [path, pkg] of Object.entries(packages)) {
    mkdirSync(join(root, path), { recursive: true })
    writeFileSync(join(root, path, 'package.json'), JSON.stringify(pkg))
  }
  return root
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('runtimeModules', () => {
  it('follows dependencies all the way down, nested copies included', () => {
    const root = project({
      '.': { name: 'app', dependencies: { hook: '1' }, devDependencies: { tool: '1' } },
      'node_modules/hook': { name: 'hook', dependencies: { 'gyp-build': '4', util: '2' } },
      'node_modules/gyp-build': { name: 'gyp-build' },
      'node_modules/util': { name: 'util', version: '1' },
      'node_modules/hook/node_modules/util': { name: 'util', version: '2' },
      'node_modules/tool': { name: 'tool' }
    })
    expect(runtimeModules(root)).toEqual([
      'node_modules/gyp-build',
      'node_modules/hook',
      'node_modules/hook/node_modules/util'
    ])
  })

  it('skips a missing optional dependency and refuses a missing regular one', () => {
    const optional = project({
      '.': { name: 'app', dependencies: { a: '1' } },
      'node_modules/a': { name: 'a', optionalDependencies: { gone: '1' } }
    })
    expect(runtimeModules(optional)).toEqual(['node_modules/a'])
    const broken = project({ '.': { name: 'app', dependencies: { a: '1' } } })
    expect(() => runtimeModules(broken)).toThrow(/a \(needed by app\) is not installed/)
  })
})

describe('missingModules', () => {
  it('names what the asar lacks, the way the broken 2026-11-08 build lacked node-gyp-build', () => {
    const needed = ['node_modules/node-gyp-build', 'node_modules/uiohook-napi']
    expect(missingModules(needed, ['/node_modules/uiohook-napi/package.json', '/out/main/index.js'])).toEqual([
      'node_modules/node-gyp-build'
    ])
    expect(
      missingModules(needed, [
        '\\node_modules\\uiohook-napi\\package.json',
        '\\node_modules\\node-gyp-build\\package.json'
      ])
    ).toEqual([])
  })

  it("accepts a nested package the packer moved up, the way it packs electron-updater's semver", () => {
    expect(packedPlaces('node_modules/a/node_modules/@s/b/node_modules/c')).toEqual([
      'node_modules/a/node_modules/@s/b/node_modules/c',
      'node_modules/a/node_modules/c',
      'node_modules/c'
    ])
    const needed = ['node_modules/electron-updater', 'node_modules/electron-updater/node_modules/semver']
    const hoisted = ['/node_modules/electron-updater/package.json', '/node_modules/semver/package.json']
    expect(missingModules(needed, hoisted)).toEqual([])
    expect(missingModules(needed, hoisted.slice(0, 1))).toEqual(['node_modules/electron-updater/node_modules/semver'])
  })
})
