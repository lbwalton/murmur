// SPDX-License-Identifier: GPL-3.0-only
// npm run site:downloads (US-169): reads wrangler's output and prints the
// counts the operator asks for.
import { describe, expect, it } from 'vitest'
import { parseArgs, parseWranglerJson, render } from './site-downloads'
import { summarize } from '../site/download'

describe('site:downloads', () => {
  it("reads wrangler's JSON past any chatter, warnings included", () => {
    expect(parseWranglerJson('[{"name":"a"}]\n')).toEqual([{ name: 'a' }])
    expect(parseWranglerJson('▲ [WARNING] an update is available\n[\n  {"name":"a"}\n]\n')).toEqual([{ name: 'a' }])
    expect(() => parseWranglerJson('Not logged in.\n')).toThrow(/printed no JSON/)
  })

  it('takes --since as a day and --json as a switch', () => {
    expect(parseArgs([])).toEqual({ json: false, since: '' })
    expect(parseArgs(['--json', '--since', '2026-11-01'])).toEqual({ json: true, since: '2026-11-01' })
    expect(parseArgs(['--since']).error).toContain('--since takes a day')
    expect(parseArgs(['--since', 'last week']).error).toContain('--since takes a day')
  })

  it('prints a table by day, by ref, and in all, split into Mac and Windows', () => {
    const text = render(summarize(['2026-11-15:mac:reddit:aaaaaaaaaaaa', '2026-11-15:windows:-:bbbbbbbbbbbb']), '2026-11-15')
    expect(text).toContain('download clicks since 2026-11-15')
    expect(text).toMatch(/^day\s+mac\s+windows\s+total$/m)
    expect(text).toMatch(/^2026-11-15\s+1\s+1\s+2$/m)
    expect(text).toMatch(/^reddit\s+1\s+0\s+1$/m)
    expect(text).toMatch(/^\(none\)\s+0\s+1\s+1$/m)
    expect(text).toMatch(/^all\s+1\s+1\s+2$/m)
  })
})
