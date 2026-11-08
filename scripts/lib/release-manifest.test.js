// SPDX-License-Identifier: GPL-3.0-only
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLED, installerNames, shippedSbom, sumsFile } from './release-manifest'

const root = join(__dirname, '..', '..')

describe('installerNames', () => {
  it('keeps what people download and drops the updater files', () => {
    expect(
      installerNames(['murmur-1.0.0.exe', 'murmur-1.0.0.exe.blockmap', 'latest.yml', 'murmur-1.0.0-universal.dmg', 'notes.txt'])
    ).toEqual(['murmur-1.0.0-universal.dmg', 'murmur-1.0.0.exe'])
  })
})

describe('sumsFile', () => {
  it('lists every installer and gives each stable copy its source sum', () => {
    const file = sumsFile('1.0.0', { 'murmur-1.0.0-universal.dmg': 'aaa', 'murmur-1.0.0.exe': 'bbb', 'latest.yml': 'ccc' })
    expect(file.split('\n')).toEqual([
      'aaa  murmur-1.0.0-universal.dmg',
      'bbb  murmur-1.0.0.exe',
      'aaa  murmur-mac.dmg',
      'bbb  murmur-windows.exe',
      ''
    ])
  })
})

describe('shippedSbom', () => {
  const full = {
    bomFormat: 'CycloneDX',
    components: [
      { 'bom-ref': 'react@18', name: 'react' },
      { 'bom-ref': 'loose@1', name: 'loose-envify' },
      { 'bom-ref': 'vite@5', name: 'vite' },
      { 'bom-ref': 'semver@7', name: 'semver' },
      { 'bom-ref': 'updater@6', name: 'electron-updater' }
    ],
    dependencies: [
      { ref: 'react@18', dependsOn: ['loose@1'] },
      { ref: 'updater@6', dependsOn: ['semver@7'] },
      { ref: 'vite@5', dependsOn: [] }
    ]
  }

  it('keeps what ships and what it needs, and drops build tools', () => {
    const names = shippedSbom(full, ['electron-updater']).components.map((c) => c.name)
    expect(names).toEqual(['react', 'loose-envify', 'semver', 'electron-updater'])
  })
})

describe('what the app imports', () => {
  it('is all on the parts list, so a new bundled package cannot go unlisted', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const listed = new Set([...Object.keys(pkg.dependencies), ...BUNDLED])
    const files = (dir) =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) return files(full)
        return /\.tsx?$/.test(entry) && !/\.(?:test|probe)\.tsx?$/.test(entry) ? [full] : []
      })
    const imports = files(join(root, 'src')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'\n]*from\s+'([^.'][^']*)'|\bimport\('([^.'][^']*)'\)/gm)].map(
        (match) => match[1] ?? match[2]
      )
    )
    const unlisted = imports
      .map((name) => (name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]))
      .filter((name) => !name.startsWith('node:') && !listed.has(name))
    expect([...new Set(unlisted)]).toEqual([])
  })

  it('still matches what npm reports', () => {
    const sbom = JSON.parse(execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--package-lock-only'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 27, shell: process.platform === 'win32' }))
    const names = shippedSbom(sbom, ['electron-updater', 'uiohook-napi']).components.map((c) => c.name)
    for (const name of ['electron', 'react', 'react-dom', 'electron-updater', 'uiohook-napi']) expect(names).toContain(name)
    expect(names).not.toContain('vite')
    expect(names).not.toContain('electron-builder')
  }, 60_000)
})
