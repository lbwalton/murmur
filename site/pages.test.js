// SPDX-License-Identifier: GPL-3.0-only
// The privacy and support pages the App Store listing links to (ios/prd.json
// IOS-026): what they say, and that every page links them.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { content } from './content'
import { FINGERPRINTED_PATHS } from './headers'
import PRO from '../shared/pro.json'

const SITE = 'https://murmurapp.app'
const EMAIL = 'support@murmurapp.app'
const plain = (pieces) => pieces.map((p) => (typeof p === 'string' ? p : p.text)).join('')
const allText = (items) => items.map((item) => [item.q, plain(item.a), ...(item.points ?? []).map(([lead, rest]) => `${lead} ${plain(rest)}`)].join(' ')).join(' ')

describe('fingerprinted files (US-121)', () => {
  const dist = mkdtempSync(join(tmpdir(), 'murmur-cache-'))
  afterAll(() => rmSync(dist, { recursive: true, force: true }))
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
    )

  it('are never linked without their fingerprint, or a year of cache would serve the old copy', () => {
    const run = spawnSync(process.execPath, ['site/build.js'], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, SITE_OFFLINE: '1', FILM_DIR: join(dist, 'no-film'), SITE_OUT: dist, SITE_URL: SITE, SUPPORT_EMAIL: EMAIL }
    })
    expect(run.status, run.stderr).toBe(0)
    const pages = files(dist).filter((file) => /\.(?:html|css|js|txt)$/.test(file))
    expect(pages.length).toBeGreaterThan(5)
    const named = FINGERPRINTED_PATHS.filter((path) => !path.endsWith('*')).map((path) => path.slice(1))
    const reference = new RegExp(
      `(?<![\\w-])(?:${named.map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|fonts/[\\w.-]+\\.woff2|film/[\\w.-]+\\.(?:mp4|png))(\\?v=[0-9a-f]{10})?`,
      'g'
    )
    const unstamped = pages.flatMap((file) => {
      const text = readFileSync(file, 'utf8')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      return [...text.matchAll(reference)].filter((match) => !match[1]).map((match) => `${file}: ${match[0]}`)
    })
    expect(unstamped).toEqual([])
    expect(readFileSync(join(dist, 'index.html'), 'utf8')).toMatch(/app\.js\?v=[0-9a-f]{10}/)
    expect(readFileSync(join(dist, 'hero.js'), 'utf8')).toMatch(/brush\.js\?v=[0-9a-f]{10}/)
  })
})

describe('the privacy page', () => {
  const { privacy } = content(SITE, { supportEmail: EMAIL })
  const text = allText(privacy.items)

  it('asks questions and carries the day it last changed', () => {
    for (const item of privacy.items) expect(item.q).toMatch(/\?$/)
    expect(privacy.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('names everything that leaves a device, on every platform', () => {
    for (const fact of ['no server', 'provider you chose', 'your own key', 'GitHub', 'update', 'offline', 'Stripe', 'Apple', 'keyboard sends nothing', 'Keychain', 'no analytics', 'no cookies']) {
      expect(text).toContain(fact)
    }
    // Found by the review gate: each of these leaves a device too.
    for (const fact of ['Sort into tasks and ideas', 'dictionary', 'spelling hints', 'syncs']) {
      expect(text).toContain(fact)
    }
  })

  it('says how to remove everything on each platform, and what Eze Media keeps', () => {
    for (const fact of ['Library/Application Support/murmur', '%APPDATA%\\murmur', 'Remove key', 'recordings waiting to be retried', 'tax and business audits', 'deletes them when you ask']) {
      expect(text).toContain(fact)
    }
    expect(text).not.toContain('uninstalling murmur removes the rest')
    expect(text).not.toContain('is listed on the App Store')
  })

  it('gives the support address for privacy questions', () => {
    expect(text).toContain(EMAIL)
  })
})

describe('the support page', () => {
  it('leads with the support address when there is one', () => {
    const { support } = content(SITE, { supportEmail: EMAIL })
    expect(plain(support.items[0].a)).toContain(EMAIL)
    for (const item of support.items) expect(item.q).toMatch(/\?$/)
  })

  it('still says where to ask without one', () => {
    const { support, links } = content(SITE)
    const first = support.items[0].a
    expect(first.some((p) => typeof p !== 'string' && p.href === links.issues)).toBe(true)
  })
})

describe('the iPhone on the site (IOS-026)', () => {
  const root = join(__dirname, '..')

  // The App Store link goes in once Apple approves murmur (HANDOFF.md,
  // IOS-026 step 8); until then nothing public may say it is there, since
  // README and the docs go public when feature/ios merges, which may come first.
  it('the download doc answers where to get murmur for iPhone, without claiming it is out', () => {
    const download = readFileSync(join(root, 'docs', 'download.md'), 'utf8')
    expect(download).toContain('## How do I get murmur on iPhone?')
    for (const file of ['README.md', 'docs/download.md', 'docs/iphone.md', 'CHANGELOG.md']) {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/apps\.apple\.com|free on the App Store|murmur is on iPhone/)
    }
  })

  it('the iPhone doc lives in docs/ and is in the docs list', () => {
    const { DOCS } = require('./content')
    expect(DOCS.map(([name]) => name)).toContain('iphone')
    expect(readFileSync(join(root, 'docs', 'iphone.md'), 'utf8')).toMatch(/^# murmur on iPhone/)
  })
})

describe('the site build (IOS-026)', () => {
  const root = join(__dirname, '..')
  // Each build writes to its own scratch folder, so a test run never
  // replaces a deploy build waiting in site/dist.
  const scratch = mkdtempSync(join(tmpdir(), 'murmur-site-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))
  const build = (env, out = join(scratch, 'out')) =>
    spawnSync(process.execPath, ['site/build.js'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SITE_OFFLINE: '1', FILM_DIR: join(root, 'no-film-here'), SUPPORT_EMAIL: '', SITE_DEPLOY: '', CF_PAGES: '', DOCS_REF: '', SITE_OUT: out, ...env }
    })

  it('refuses a deploy without the support address, which Apple requires on the support page', () => {
    const run = build({ SITE_DEPLOY: '1', SITE_URL: SITE })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('SUPPORT_EMAIL')
  })

  // A deploy reads the docs as they were at the release it serves, so the
  // new pages must link only to what that release's docs already have:
  // privacy and support go live before the release that ships the iPhone.
  const released = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  it.skipIf(!released)('deploys against the newest release tag, as a deploy reads the docs', () => {
    const out = join(scratch, 'deploy')
    const run = build({ SITE_DEPLOY: '1', SITE_URL: SITE, SUPPORT_EMAIL: EMAIL, DOCS_REF: released }, out)
    expect(run.status, run.stderr).toBe(0)
    expect(readFileSync(join(out, 'privacy', 'index.html'), 'utf8')).toContain('Does murmur collect my data?')
    expect(run.stdout).toContain(`built ${out}`)
  }, 60_000)

  describe('a local build with the support address', () => {
    const dist = join(scratch, 'local')
    const read = (file) => readFileSync(join(dist, file), 'utf8')
    beforeAll(() => {
      const run = build({ SITE_URL: SITE, SUPPORT_EMAIL: EMAIL }, dist)
      expect(run.status, run.stderr).toBe(0)
    }, 60_000)

    it('opens the privacy page with the summary, above the first question', () => {
      const html = read('privacy/index.html')
      const summary = html.indexOf('id="summary"')
      const firstQuestion = html.indexOf('<h2 id=')
      expect(summary).toBeGreaterThan(-1)
      expect(summary).toBeLessThan(firstQuestion)
      const top = html.slice(summary, firstQuestion)
      for (const fact of ['collects', 'kept', 'rights', 'correct', 'delete', 'sold', 'no cookie banner']) {
        expect(top).toContain(fact)
      }
    })

    it('gives every kind of record a period or a rule, and names the laws', () => {
      const html = read('privacy/index.html')
      for (const fact of ['Keep history', 'waiting for a retry', '10 years after purchase', '3 years after the last message', 'GDPR', 'CCPA', '300 milliseconds']) {
        expect(html).toContain(fact)
      }
      expect(html).not.toContain('[email protected]')
    })

    it('writes the security page, says what murmur lacks, and lists it everywhere', () => {
      const html = read('security/index.html')
      for (const fact of ['SOC 2', 'ISO 27001', 'penetration test', 'Not code signed', 'HIPAA', 'security@murmurapp.app', 'Checked 2026-11-05']) {
        expect(html).toContain(fact)
      }
      expect(html).not.toMatch(/<script(?![^>]*(?:src=|application\/ld\+json))/)
      for (const file of ['index.html', 'docs/index.html', 'privacy/index.html', 'security/index.html', '404.html']) {
        expect(read(file)).toContain('href="/security/"')
      }
      expect(read('sitemap.xml')).toContain(`${SITE}/security/`)
      expect(read('llms.txt')).toContain(`${SITE}/security/`)
    })

    it('writes both pages, with their questions and the address', () => {
      expect(read('privacy/index.html')).toContain('Does murmur collect my data?')
      expect(read('support/index.html')).toContain(`mailto:${EMAIL}`)
    })

    it('links both from every footer', () => {
      for (const file of ['index.html', 'docs/index.html', 'privacy/index.html', 'support/index.html', '404.html']) {
        expect(read(file)).toContain('href="/privacy/"')
        expect(read(file)).toContain('href="/support/"')
      }
    })

    it('lists both in the sitemap and llms.txt', () => {
      for (const file of ['sitemap.xml', 'llms.txt']) {
        expect(read(file)).toContain(`${SITE}/privacy/`)
        expect(read(file)).toContain(`${SITE}/support/`)
      }
    })

    it('forwards /pro and /pro/ to the Pro doc for good', () => {
      const redirects = read('_redirects')
      expect(redirects).toContain('/pro /docs/pro/ 301')
      expect(redirects).toContain('/pro/ /docs/pro/ 301')
    })

    it('puts the checkout link on the Pro page 3 times', () => {
      expect(read('docs/pro/index.html').split(`href="${PRO.buyUrl}"`).length - 1).toBe(3)
    })

    it('answers the iPhone question on home, linking the iPhone doc, without claiming the App Store has it', () => {
      const home = read('index.html')
      expect(home).toContain('Is there a murmur app for iPhone?')
      expect(home).toContain('href="/docs/iphone/"')
      expect(home).toContain('on its way to the App Store')
      expect(home).not.toMatch(/apps\.apple\.com|free on the App Store|Download on the App Store/)
      expect(read('llms.txt')).toContain('Is there a murmur app for iPhone?')
    })
  })

  // A deploy from a ref without the iPhone doc must still build: the home
  // answer that links it stays off the site until the doc is there.
  // v0.1.16 predates the iPhone doc; CI's shallow checkout has no tags.
  const beforeIphone = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'v0.1.16^{commit}'], { cwd: root, encoding: 'utf8' }).status === 0
  it.skipIf(!beforeIphone)('leaves the iPhone answer off home when the docs it reads have no iPhone doc', () => {
    const out = join(scratch, 'no-iphone')
    const run = build({ SITE_URL: SITE, SUPPORT_EMAIL: EMAIL, DOCS_REF: 'v0.1.16' }, out)
    expect(run.status, run.stderr).toBe(0)
    const home = readFileSync(join(out, 'index.html'), 'utf8')
    expect(home).toContain('Which computers does murmur run on?')
    expect(home).not.toContain('Is there a murmur app for iPhone?')
    expect(home).not.toContain('/docs/iphone/')
  }, 60_000)
})

describe("the Pro doc's checkout links (LaBroi, 2026-11-01)", () => {
  const md = readFileSync(join(__dirname, '..', 'docs', 'pro.md'), 'utf8')
  const { founders } = content(SITE, { now: Date.parse('2026-12-31T23:00:00-08:00') }).facts

  it('links the checkout from shared/pro.json near the top, after what Pro includes, and at the end', () => {
    const heads = [...md.matchAll(/^## .*$/gm)]
    const sectionOf = (at) => heads.filter((h) => h.index < at).at(-1)?.[0]
    const links = [...md.matchAll(/\]\((https:\/\/buy\.stripe\.com\/[^)\s]*)\)/g)]
    expect(links.map((m) => m[1])).toEqual([PRO.buyUrl, PRO.buyUrl, PRO.buyUrl])
    expect(links.map((m) => sectionOf(m.index))).toEqual(['## What is murmur Pro?', '## What does Pro include?', heads.at(-1)[0]])
  })

  it('names only the price in shared/pro.json and the founders price', () => {
    const prices = new Set([...md.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
    expect([...prices].sort((a, b) => a - b)).toEqual([PRO.price - founders.price, founders.price, PRO.price].sort((a, b) => a - b))
    expect(md).toContain(`$${PRO.price} once`)
    expect(md).toContain(`the code ${founders.code}`)
  })
})

describe('the founders price', () => {
  const before = Date.parse('2026-12-31T23:00:00-08:00')
  const after = Date.parse('2027-01-01T00:00:00-08:00')
  const cost = (now) => plain(content(SITE, { now }).faq.find((item) => item.q === 'What does murmur cost?').a)

  it('shows $39 with the code, filled in on the checkout link, through December 31', () => {
    const { founders } = content(SITE, { now: before }).facts
    expect(founders.price).toBe(39)
    expect(founders.buy).toMatch(/^https:\/\/buy\.stripe\.com\/.+\?prefilled_promo_code=FOUNDERS$/)
    expect(cost(before)).toContain('Through December 31, 2026, Pro is $39 with the code FOUNDERS')
  })

  it('says nothing once the window closes', () => {
    expect(content(SITE, { now: after }).facts.founders).toBeNull()
    expect(cost(after)).not.toContain('39')
    expect(cost(after)).not.toContain('FOUNDERS')
  })
})
