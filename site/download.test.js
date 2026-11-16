// SPDX-License-Identifier: GPL-3.0-only
// The download counter (US-169): every download still lands on its
// GitHub file at once, a count holds only the day, the platform, and the
// ref, visitors never get a cookie, and nothing about counting can stop
// a download.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOWNLOAD_PATHS, OWNER_COOKIE, TARGETS, cleanRef, countKey, handleDownload, parseKey, summarize } from './download'
import { HEADERS } from './headers'
import { DOWNLOAD_FALLBACKS, redirectsFile } from './redirects'
import { onRequest } from '../functions/download/[target].js'

const SITE = 'https://murmurapp.app'
const NOW = Date.parse('2026-11-15T20:00:00Z')
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'

/** A KV stand-in that keeps what it is given, and the waitUntil calls. */
function store(put = async () => {}) {
  const keys = []
  const waits = []
  return {
    keys,
    waits,
    env: { DOWNLOADS: { put: (key, value) => (keys.push(key), put(key, value)) } },
    ctx: { waitUntil: (p) => waits.push(p) }
  }
}

function visit(path, { headers = {}, method = 'GET', at = store() } = {}) {
  const request = new Request(`${SITE}${path}`, { method, headers: { 'user-agent': BROWSER, ...headers } })
  const response = handleDownload(request, at.env, at.ctx, NOW)
  return { response, ...at }
}

const settle = (waits) => Promise.all(waits)

describe('the download links', () => {
  it('forward Mac and Windows to the same GitHub files the buttons always served', () => {
    expect(TARGETS).toEqual({
      mac: 'https://github.com/lbwalton/murmur/releases/latest/download/murmur-mac.dmg',
      windows: 'https://github.com/lbwalton/murmur/releases/latest/download/murmur-windows.exe'
    })
    expect(DOWNLOAD_PATHS).toEqual(['/download/mac', '/download/windows'])
    for (const platform of ['mac', 'windows']) {
      const { response } = visit(`/download/${platform}?ref=reddit`)
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(TARGETS[platform])
    }
  })

  it('send every security header themselves, since Pages does not apply _headers to a Function', () => {
    for (const path of ['/download/mac', '/download/me', '/download/nope']) {
      const { response } = visit(path)
      for (const [name, value] of HEADERS) expect(response.headers.get(name), `${path} ${name}`).toBe(value)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('never give a visitor a cookie', () => {
    for (const path of ['/download/mac', '/download/windows?ref=x', '/download/nope']) {
      expect(visit(path).response.headers.get('set-cookie')).toBeNull()
    }
  })

  it('answer anything else under /download/ with a 404', () => {
    for (const path of ['/download/', '/download/linux', '/download/__proto__', '/download/mac/extra']) {
      expect(visit(path).response.status).toBe(404)
    }
  })
})

describe('a count', () => {
  it('is the day, the platform, and the ref, and nothing else', async () => {
    const { keys, waits } = visit('/download/mac?ref=reddit', { headers: { 'x-forwarded-for': '203.0.113.9', 'cf-connecting-ip': '203.0.113.9' } })
    await settle(waits)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^2026-11-15:mac:reddit:[0-9a-f]{12}$/)
    expect(keys[0]).not.toContain('203.0.113.9')
    expect(parseKey(keys[0])).toEqual({ day: '2026-11-15', platform: 'mac', ref: 'reddit' })
  })

  it('writes no value but a 1, so no visitor detail can ride along', async () => {
    const values = []
    const { waits } = visit('/download/windows', { at: store(async (_key, value) => values.push(value)) })
    await settle(waits)
    expect(values).toEqual(['1'])
  })

  it('takes the ref from the page the button was on, on this site only', async () => {
    const home = visit('/download/windows', { headers: { referer: `${SITE}/?ref=HackerNews` } })
    const elsewhere = visit('/download/windows', { headers: { referer: 'https://example.com/?ref=spam' } })
    const own = visit('/download/windows?ref=producthunt', { headers: { referer: `${SITE}/?ref=reddit` } })
    await settle([...home.waits, ...elsewhere.waits, ...own.waits])
    expect(parseKey(home.keys[0]).ref).toBe('hackernews')
    expect(parseKey(elsewhere.keys[0]).ref).toBe('')
    expect(parseKey(own.keys[0]).ref).toBe('producthunt')
  })

  it('keeps a ref to plain letters, digits, dot, dash, and underscore, at most 40', () => {
    expect(cleanRef('r/macapps')).toBe('r-macapps')
    expect(cleanRef('  Reddit  ')).toBe('reddit')
    expect(cleanRef('a:b:c')).toBe('a-b-c')
    expect(cleanRef('x'.repeat(80))).toHaveLength(40)
    expect(cleanRef(`${'a'.repeat(39)}-b`)).toBe('a'.repeat(39))
    expect(cleanRef('')).toBe('')
    expect(cleanRef(null)).toBe('')
    const key = countKey({ day: '2026-11-15', platform: 'mac', ref: cleanRef('weird ref: <script>') }, () => 'abc123')
    expect(parseKey(key)).toEqual({ day: '2026-11-15', platform: 'mac', ref: 'weird-ref-script' })
  })

  it('is skipped for the owner cookie, bots, link previews, prefetches, and HEAD requests', async () => {
    const skipped = [
      visit('/download/mac', { headers: { cookie: `theme=dark; ${OWNER_COOKIE}=1` } }),
      visit('/download/mac', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }),
      visit('/download/mac', { headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' } }),
      visit('/download/mac', { headers: { 'user-agent': 'facebookexternalhit/1.1' } }),
      visit('/download/mac', { headers: { 'user-agent': 'curl/8.7.1' } }),
      visit('/download/mac', { headers: { 'user-agent': '' } }),
      visit('/download/mac', { headers: { 'sec-purpose': 'prefetch;prerender' } }),
      visit('/download/mac', { method: 'HEAD' })
    ]
    await settle(skipped.flatMap((s) => s.waits))
    for (const { response, keys } of skipped) {
      expect(keys).toEqual([])
      expect(response.status).toBe(302)
    }
    // A cookie that only looks like it still counts.
    const lookalike = visit('/download/mac', { headers: { cookie: `${OWNER_COOKIE}=0; not_${OWNER_COOKIE}=1` } })
    await settle(lookalike.waits)
    expect(lookalike.keys).toHaveLength(1)
  })
})

describe('counting fails open', () => {
  it('forwards before the count is written, and the count finishes after', () => {
    let finish
    const { response, keys, waits } = visit('/download/mac', { at: store(() => new Promise((resolve) => (finish = resolve))) })
    expect(response.status).toBe(302)
    expect(waits).toHaveLength(1)
    return Promise.resolve().then(() => {
      expect(keys).toHaveLength(1)
      finish()
      return settle(waits)
    })
  })

  it('still forwards when the store throws, rejects, or is not bound', async () => {
    const throws = visit('/download/mac', {
      at: store(() => {
        throw new Error('KV down')
      })
    })
    const rejects = visit('/download/windows', { at: store(() => Promise.reject(new Error('limit reached'))) })
    await expect(settle([...throws.waits, ...rejects.waits])).resolves.toBeDefined()
    for (const { response } of [throws, rejects]) expect(response.status).toBe(302)
    const unbound = handleDownload(new Request(`${SITE}/download/mac`, { headers: { 'user-agent': BROWSER } }), {}, {}, NOW)
    expect(unbound.status).toBe(302)
    expect(unbound.headers.get('location')).toBe(TARGETS.mac)
    const bare = handleDownload(new Request(`${SITE}/download/windows`, { headers: { 'user-agent': BROWSER } }))
    expect(bare.status).toBe(302)
  })
})

describe('/download/me', () => {
  const { response, keys } = visit('/download/me')
  const cookie = response.headers.get('set-cookie')

  it('sets the one owner cookie: HttpOnly, Secure, SameSite=Lax, for the download links only, for 400 days', () => {
    expect(response.status).toBe(200)
    expect(cookie.startsWith(`${OWNER_COOKIE}=1;`)).toBe(true)
    for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/download', `Max-Age=${400 * 86_400}`]) {
      expect(cookie.split('; ')).toContain(part)
    }
    expect(keys).toEqual([])
  })

  it('says what it did, and until when', async () => {
    const html = await response.text()
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('Downloads from this browser are not counted.')
    expect(html).toContain(OWNER_COOKIE)
    expect(html).toContain('2027-12-20')
    expect(html).not.toMatch(/<script|style=/)
    expect(html).not.toMatch(/LaBroi|Walton|\bLB\b/)
  })
})

describe('the counts read back (npm run site:downloads)', () => {
  const keys = [
    '2026-11-14:mac:reddit:aaaaaaaaaaaa',
    '2026-11-14:windows:-:bbbbbbbbbbbb',
    '2026-11-15:mac:reddit:cccccccccccc',
    '2026-11-15:mac:-:dddddddddddd',
    'something-else'
  ]

  it('adds up by day, by ref, and in all, split by platform', () => {
    const { days, refs, total } = summarize(keys)
    expect(days).toEqual([
      { key: '2026-11-14', mac: 1, windows: 1, total: 2 },
      { key: '2026-11-15', mac: 2, windows: 0, total: 2 }
    ])
    expect(refs).toEqual([
      { key: '(none)', mac: 1, windows: 1, total: 2 },
      { key: 'reddit', mac: 2, windows: 0, total: 2 }
    ])
    expect(total).toEqual({ mac: 3, windows: 1, total: 4 })
  })

  it('leaves out days before --since', () => {
    expect(summarize(keys, { since: '2026-11-15' }).total).toEqual({ mac: 2, windows: 0, total: 2 })
  })
})

describe('the deploy (site/README.md)', () => {
  const root = join(__dirname, '..')

  // The file Pages runs, called the way Pages calls it: a context with the
  // request, the bindings, and waitUntil.
  it('runs the Pages Function at the repo root, where wrangler pages deploy looks, through download.js', async () => {
    const at = store()
    const response = onRequest({
      request: new Request(`${SITE}/download/windows?ref=github`, { headers: { 'user-agent': BROWSER } }),
      env: at.env,
      waitUntil: at.ctx.waitUntil,
      params: { target: 'windows' }
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(TARGETS.windows)
    expect(at.waits).toHaveLength(1)
    await settle(at.waits)
    expect(parseKey(at.keys[0])).toMatchObject({ platform: 'windows', ref: 'github' })
    expect(readFileSync(join(root, 'site', 'README.md'), 'utf8')).toContain('npx wrangler pages deploy site/dist --project-name murmur --branch main')
  })

  it('falls back to the plain GitHub forwards in _redirects if the function is ever left out', () => {
    expect(DOWNLOAD_FALLBACKS).toEqual([
      ['/download/mac', TARGETS.mac],
      ['/download/windows', TARGETS.windows]
    ])
    const file = redirectsFile()
    expect(file).toContain(`/download/mac ${TARGETS.mac} 302\n`)
    expect(file).toContain(`/download/windows ${TARGETS.windows} 302\n`)
  })
})
