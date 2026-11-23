// SPDX-License-Identifier: GPL-3.0-only
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The privacy page says that of the keys murmur hears, it saves only the
// shortcuts you set, and sends none. The key listener hears every key in
// every app, so the files in this folder never write a key code: no
// console, no process streams, and 1 line in the app log that holds only
// flags. This reads those files and nothing else; what the rest of the
// app logs about a take is outside it. Adding a line here means checking
// it against that promise first.
describe('the key listener files never write a key code', () => {
  const files = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  const sources = files.map((file) => ({ file, source: readFileSync(join(__dirname, file), 'utf8') }))

  it('finds the listener files', () => {
    expect(files).toContain('index.ts')
    expect(files).toContain('dispatch.ts')
  })

  it.each(sources)('$file never touches the console or the process streams', ({ source }) => {
    expect(source).not.toMatch(/\bconsole\b/)
    expect(source).not.toMatch(/\bprocess\s*\.\s*std(out|err)\b/)
  })

  it('writes 1 line to the app log, the boot line, and it holds only true or false', () => {
    const callers = sources.flatMap(({ file, source }) => [...source.matchAll(/\bwriteAppLog\(/g)].map(() => file))
    expect(callers).toEqual(['index.ts'])
    // The whole call is 1 template literal, with nothing joined on after it.
    const index = sources.find((s) => s.file === 'index.ts')?.source ?? ''
    const line = index.match(/\bwriteAppLog\(\s*(`[^`]*`)\s*\)/)?.[1] ?? ''
    expect(line).toContain('[hotkeys] hookStarted=')
    // Every value in the line is a flag: the hook started, or a shortcut parsed.
    const values = [...line.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1])
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(value).toMatch(/^(hookStarted|binding !== null|\w+BindingValid\(\))$/)
    }
  })
})
