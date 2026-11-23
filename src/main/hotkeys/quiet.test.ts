// SPDX-License-Identifier: GPL-3.0-only
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The privacy page says that of the keys murmur hears, it saves only the
// shortcuts you set, and sends none. The key listener hears every key in
// every app, so it writes nothing about a key: a line with a key code in
// it would be a record of typing wherever that output is kept. Adding a
// line here means checking it against that promise first.
describe('the key listener writes no key to the console or the log', () => {
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
    const calls = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/\bwriteAppLog\(\s*([^)]*)/g)].map((m) => ({ file, arg: m[1] }))
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].file).toBe('index.ts')
    expect(calls[0].arg).toContain('[hotkeys] hookStarted=')
    expect(calls[0].arg).not.toMatch(/keycode|rawcode|\be\./)
  })
})
