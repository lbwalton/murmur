// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appFetch } from './net'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('appFetch', () => {
  it('hands the request to Node fetch unchanged outside Electron', async () => {
    const calls: unknown[][] = []
    vi.stubGlobal('fetch', async (...args: unknown[]) => {
      calls.push(args)
      return new Response('ok')
    })
    const init = { method: 'POST', headers: { Authorization: 'Bearer k' } }
    const response = await appFetch('https://api.example.com/v1/models', init)
    expect(await response.text()).toBe('ok')
    expect(calls).toEqual([['https://api.example.com/v1/models', init]])
  })
})

// Node's fetch ignores the operating system's certificates, so a main
// process request that bypasses appFetch fails on every network that
// inspects secure traffic (US-109). Types (typeof fetch) and injected
// fetchImpl parameters are fine; any other use of the bare global is
// not. Shared code is scanned too, since the main process imports it.
describe('main-process requests', () => {
  const root = join(__dirname, '..')

  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) sources(full, out)
      else if (entry.endsWith('.ts') && !/\.(?:test|probe)\.ts$/.test(entry)) out.push(full)
    }
    return out
  }

  const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const BARE_FETCH = /(?<!typeof\s+)(?<![\w.$'"`])fetch\b(?![\w$]|\s*:)|globalThis\.fetch\b/

  it('all go through appFetch', () => {
    const offenders = [...sources(join(root, 'main')), ...sources(join(root, 'shared'))]
      .filter((file) => relative(root, file) !== join('main', 'net.ts'))
      .filter((file) => BARE_FETCH.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(root, file))
    expect(offenders).toEqual([])
  })

  it('catches every bare use and lets types and injected fetches pass', () => {
    expect(BARE_FETCH.test('const r = await fetch(url)')).toBe(true)
    expect(BARE_FETCH.test('const { fetchImpl = fetch } = options')).toBe(true)
    expect(BARE_FETCH.test('const f = options.fetchImpl ?? fetch\n')).toBe(true)
    expect(BARE_FETCH.test('sortNote(input, { fetchImpl: fetch })')).toBe(true)
    expect(BARE_FETCH.test('await globalThis.fetch(url)')).toBe(true)
    expect(BARE_FETCH.test('const f = a || fetch')).toBe(true)
    expect(BARE_FETCH.test('return fetch')).toBe(true)
    expect(BARE_FETCH.test('run(fetch)')).toBe(true)
    expect(BARE_FETCH.test("detail: 'fetch failed'")).toBe(false)
    expect(BARE_FETCH.test('const { fetchImpl = appFetch } = options')).toBe(false)
    expect(BARE_FETCH.test('fetchImpl?: typeof fetch')).toBe(false)
    expect(BARE_FETCH.test('await fetchImpl(url)')).toBe(false)
    expect(BARE_FETCH.test('await net.fetch(url)')).toBe(false)
  })
})
