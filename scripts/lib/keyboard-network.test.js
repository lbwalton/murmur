// SPDX-License-Identifier: GPL-3.0-only
// The keyboard makes no network requests (ios/prd.json IOS-008): this
// fails if anything the keyboard compiles names a networking API.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { networkUses } from './keyboard-network'

const ios = join(__dirname, '..', '..', 'ios')

function swiftFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return swiftFiles(path)
    return entry.name.endsWith('.swift') ? [path] : []
  })
}

describe('the keyboard makes no network requests', () => {
  it('finds networking in code, not in comments', () => {
    expect(networkUses('let session = URLSession.shared')).toEqual(['URLSession'])
    expect(networkUses('import Network\nlet c = NWConnection(host: "a", port: 1, using: .tcp)')).toEqual(['NWConnection', 'import Network'])
    expect(networkUses('let site = "https://murmurapp.app"')).toEqual(['https://'])
    expect(networkUses('// URLSession is the app\'s job\n/* https://example.com */\nlet x = 1')).toEqual([])
  })

  it('compiles only Keyboard, Shared, and the colors into the keyboard', () => {
    const yml = readFileSync(join(ios, 'project.yml'), 'utf8')
    const keyboard = yml.slice(yml.indexOf('  murmurKeyboard:'), yml.indexOf('  murmurTests:'))
    const sources = [...keyboard.slice(0, keyboard.indexOf('dependencies:')).matchAll(/- path: (\S+)/g)].map((m) => m[1])
    expect(sources).toEqual(['Keyboard', 'Shared', 'Generated/Tokens.swift'])
  })

  it('names no networking API anywhere the keyboard compiles', () => {
    const files = [...swiftFiles(join(ios, 'Keyboard')), ...swiftFiles(join(ios, 'Shared'))]
    expect(files.length).toBeGreaterThan(4)
    const uses = files.map((file) => [file.slice(ios.length + 1), networkUses(readFileSync(file, 'utf8'))]).filter(([, found]) => found.length > 0)
    expect(uses).toEqual([])
  })

  it('links MurmurCore, which builds requests but never sends one', () => {
    const core = swiftFiles(join(ios, 'MurmurCore', 'Sources'))
    const sends = core.filter((file) => /\bURLSession\w*\b|\bNW(?:Connection|Listener)\b|^\s*import\s+Network\b/m.test(readFileSync(file, 'utf8')))
    expect(sends).toEqual([])
  })
})
