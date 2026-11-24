// SPDX-License-Identifier: GPL-3.0-only
// The privacy and support pages the App Store listing links to (ios/prd.json
// IOS-026): what they say, and that every page links them.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { content } from './content'
import { FINGERPRINTED_PATHS } from './headers'
import PRO from '../shared/pro.json'

const SITE = 'https://murmurapp.app'
const EMAIL = 'support@murmurapp.app'
const plain = (pieces) => pieces.map((p) => (typeof p === 'string' ? p : p.text)).join('')
const allText = (items) => items.map((item) => [item.q, plain(item.a), ...(item.points ?? []).map(([lead, rest]) => `${lead} ${plain(rest)}`)].join(' ')).join(' ')
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
  )

describe('fingerprinted files (US-121)', () => {
  const dist = mkdtempSync(join(tmpdir(), 'murmur-cache-'))
  afterAll(() => rmSync(dist, { recursive: true, force: true }))

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
    for (const fact of ['no server', 'provider you chose', 'your own key', 'GitHub', 'update', 'offline', 'Stripe', 'Apple', 'keyboard sends nothing', 'Keychain', 'no analytics', 'no cookies on visitors']) {
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
    // Clear all moved off Home into Settings, History (US-148).
    expect(text).toContain('Clear all empties your history (in Settings under History on Mac and Windows')
    expect(text).not.toContain('on the home tab')
    expect(text).not.toContain('is listed on the App Store')
  })

  // US-185: with Learn from my fixes on, murmur reads the box it typed into.
  // The page says when, what it never reads, and what it keeps. What the
  // review gate found is held too: only learning is said to stay on the Mac
  // (a Transform selection goes to the provider), Transform reads its
  // selection when you finish speaking, not at the press, and words that
  // join the dictionary go out as hints.
  it('says when murmur looks at text in another app, and what it keeps', () => {
    const item = privacy.items.find(({ q }) => q === 'Does murmur look at what I type in other apps?')
    expect(item).toBeDefined()
    const said = plain(item.a)
    for (const fact of [
      'On Mac and Windows, murmur reads your text only when you ask it to, and it listens for key presses only to catch your shortcuts',
      'copy the text you selected when you use their shortcut',
      'Transform sends it to your provider with what you asked for',
      'keeps the original in your history unless you turn that off',
      'Fix a word saves the word and the spelling you type to your dictionary',
      'off until you turn it on',
      'that same text box for up to 1 minute',
      'never reads a box your Mac marks as a password',
      'never saved or sent',
      'only the pair of words you fixed',
      'for as long as your history setting keeps words',
      'That pair joins your dictionary only when you press Add',
      'spelling hints for your providers',
      // The key listener (src/main/hotkeys/index.ts): every key down and up
      // in every app reaches it, it acts on shortcuts and a plain Escape,
      // and the only key that is ever kept is a shortcut you set.
      'murmur is told when a key goes down or comes up in any app',
      'checks only whether that key belongs to a shortcut, or is Escape, which cancels a hands-free take',
      'Of the keys it hears, murmur saves only the shortcuts you set, and it sends none'
    ]) {
      expect(said).toContain(fact)
    }
    // The first sentence owns up to the keys, so a reader who stops there
    // is not misled; the detail comes last, after the dictionary's.
    expect(said.indexOf('listens for key presses')).toBeLessThan(said.indexOf('Transform and Fix a word'))
    expect(said.indexOf('To hear your shortcuts')).toBeGreaterThan(said.indexOf('spelling hints for your providers'))
    // Nothing says murmur never hears or keeps a key: the first draft of the
    // line (it never saves or sends a key) is the wording this refuses.
    const neverAKey = /(never|not|n.t) (\w+ (or|and|nor) )?(saves?|sends?|sees?|hears?|reads?|logs?|records?|stores?|keeps?) (a|any|your|the) (keys?|keystrokes?|key ?press(es)?)\b/i
    expect('it never saves or sends a key').toMatch(neverAKey)
    expect(said).not.toMatch(neverAKey)
    // 1 thing only is said to stay put, and it is learning, after Transform is done with.
    expect(said.match(/stays? on (your|this|the) /g)).toEqual(['stays on your '])
    const learning = said.indexOf('Learn from my fixes')
    expect(learning).toBeGreaterThan(said.indexOf('Transform sends it'))
    expect(said.indexOf('That stays on your Mac')).toBeGreaterThan(learning)
    expect(said).not.toMatch(/at the moment you press|as soon as you press/)
  })

  it('gives the support address for privacy questions', () => {
    expect(text).toContain(EMAIL)
  })

  it('says Pro buyers may get emails about the purchase and founding member perks, who sends them, and how to stop them', () => {
    const points = privacy.items.flatMap((item) => item.points ?? [])
    const point = (lead) => {
      const found = points.find(([l]) => l === lead)
      expect(found, lead).toBeDefined()
      return plain(found[1])
    }
    const buying = point('Buying murmur Pro.')
    for (const fact of ['email you about your purchase and any founding member perks', 'a discount code when a new product launches', 'your license key included', 'Resend, an email delivery service', 'reply to one', EMAIL]) {
      expect(buying).toContain(fact)
    }
    expect(point('Eze Media LLC.')).toContain('go through Resend, and the purchase and perk emails stop when you ask')
    for (const fact of ['no analytics', 'no tracking', 'Nothing is sold']) expect(text).toContain(fact)
  })
})

// US-169: the site counts download clicks, never who, and visitors get
// no cookie; every line that says what the site does stays true.
describe('what the site says about counting downloads', () => {
  const { privacy, security } = content(SITE, { supportEmail: EMAIL })
  const answer = (info, q) => {
    const item = info.items.find((i) => i.q === q)
    expect(item, q).toBeDefined()
    return plain(item.a)
  }

  it('answers Does this website track me? with what is counted and what never is', () => {
    const text = answer(privacy, 'Does this website track me?')
    for (const fact of ['counts clicks on its download buttons', 'which link sent them', '?ref=reddit', 'never records who', 'no IP address', 'no cookies on visitors', 'no analytics', 'The only cookie is 1 we set on our own browsers']) {
      expect(text).toContain(fact)
    }
    expect(text).not.toContain('no cookies of its own')
    // The owner's first and last name, never spelled out here (US-168, US-171).
    expect(text).not.toMatch(/la\s*bro[iy]|wal[t]on/i)
  })

  it('says in the summary that visitors get no cookie, and names the 1 that exists', () => {
    const cookies = privacy.summary.find(([lead]) => lead === 'Cookies.')
    expect(plain(cookies[1])).toContain('Visitors get none')
    expect(plain(cookies[1])).toContain('The only cookie is 1 we set on our own browsers')
    expect(plain(cookies[1])).not.toContain('The site sets none')
  })

  it('tells security reviewers the download links count clicks, never who', () => {
    const text = answer(security, 'How is this website protected?')
    for (const fact of ['download links, which count each click', 'never who', 'Visitors get no cookies', 'no analytics']) {
      expect(text).toContain(fact)
    }
    expect(text).not.toMatch(/static, with no cookies/)
    expect(security.updated).toBe('2026-11-15')
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

    it('sends both download buttons through the counter, and keeps crawlers off it (US-169)', () => {
      const home = read('index.html')
      expect(home).toContain('<a class="btn" href="/download/mac">Download for Mac</a>')
      expect(home).toContain('<a class="btn" href="/download/windows">Download for Windows</a>')
      expect(home).not.toContain('href="https://github.com/lbwalton/murmur/releases/latest/download/')
      // Machines read the files themselves, so they never count as a click.
      expect(read('llms.txt')).toContain('https://github.com/lbwalton/murmur/releases/latest/download/murmur-mac.dmg')
      expect(home).toContain('"downloadUrl":["https://github.com/lbwalton/murmur/releases/latest/download/murmur-mac.dmg"')
      const robots = read('robots.txt')
      expect(robots.match(/^Disallow: \/download\/$/gm)).toHaveLength(robots.match(/^User-agent:/gm).length)
    })

    it('forwards /pro and /pro/ to the Pro doc for good', () => {
      const redirects = read('_redirects')
      expect(redirects).toContain('/pro /docs/pro/ 301')
      expect(redirects).toContain('/pro/ /docs/pro/ 301')
    })

    it('puts the checkout link on the Pro page 3 times, with the founders code filled in while the window is open (US-172)', () => {
      const html = read('docs/pro/index.html')
      const count = (href) => html.split(`href="${href}"`).length - 1
      const { founders } = content(SITE).facts
      if (founders) {
        // The doc's 3 links, plus the founders line above them.
        expect(count(founders.buy)).toBe(4)
        expect(count(PRO.buyUrl)).toBe(0)
      } else {
        expect(count(PRO.buyUrl)).toBe(3)
      }
    })

    // The build reads today's date, so the founders lines show only while
    // the window is open.
    it.skipIf(!content(SITE).facts.founders)('says wherever it names the window that any website purchase in it makes a founding member', () => {
      for (const file of ['index.html', 'docs/pro/index.html', 'llms.txt', 'llms-full.txt']) {
        expect(read(file), file).toContain('with or without the code')
        expect(read(file), file).toContain('every future paid product we make')
        expect(read(file), file).not.toMatch(/at that price|founding member price/i)
      }
    })

    it('answers the iPhone question on home, linking the iPhone doc, without claiming the App Store has it', () => {
      const home = read('index.html')
      expect(home).toContain('Is there a murmur app for iPhone?')
      expect(home).toContain('href="/docs/iphone/"')
      expect(home).toContain('on its way to the App Store')
      expect(home).not.toMatch(/apps\.apple\.com|free on the App Store|Download on the App Store/)
      expect(read('llms.txt')).toContain('Is there a murmur app for iPhone?')
    })

    // The site never names the person who makes murmur (US-168): not in the
    // structured data, the pages, llms.txt, or any other file a visitor or
    // a crawler reads. The company is Eze Media LLC. Comments in the
    // stylesheets and scripts are code, and the GitHub repo's address
    // carries the account name, so both are left out of the check.
    describe('never names the founder (US-168)', () => {
      const BINARY = /\.(?:png|jpe?g|gif|webp|ico|woff2?|mp4|webm)$/
      // Either part of the name, spaced or run together, and the misheard
      // spelling an example once used beside it. The initials are allowed:
      // the owner uses them on purpose where a personal touch helps
      // (2026-11-15); only the first and last name are off limits.
      // A failure shows the text around each match with every match in it
      // masked, so the CI log never prints the name (US-171).
      const NAME = /(?<![a-z])la\s*bro[iy](?![a-z])|wal[t]on/gi
      const named = (text) => {
        const masked = text.replace(NAME, (match) => '#'.repeat(match.length))
        return [...text.matchAll(NAME)].map((match) =>
          masked.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40)
        )
      }
      // Block comments in stylesheets and scripts, and whole line comments
      // in scripts, the same cut the fingerprint check makes.
      const visible = (file) => {
        const text = readFileSync(file, 'utf8').replaceAll('lbwalton/murmur', 'REPO/murmur')
        if (file.endsWith('.css')) return text.replace(/\/\*[\s\S]*?\*\//g, '')
        if (file.endsWith('.js')) return text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
        return text
      }
      const path = (file) => relative(dist, file).split(sep).join('/')

      it('in any text file the build writes', () => {
        const scanned = files(dist).filter((file) => !BINARY.test(file))
        const written = scanned.map(path)
        for (const file of ['index.html', 'docs/iphone/index.html', 'llms.txt', 'llms-full.txt', 'sitemap.xml', 'robots.txt', '.well-known/security.txt', '_headers', '_redirects']) {
          expect(written).toContain(file)
        }
        const found = scanned.flatMap((file) => named(visible(file)).map((context) => `${path(file)}: ${context}`))
        expect(found).toEqual([])
      })

      it('in the structured data, which names only the company', () => {
        const pages = files(dist).filter((file) => file.endsWith('.html'))
        const blocks = pages.flatMap((file) =>
          [...readFileSync(file, 'utf8').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]))
        )
        expect(blocks.length).toBeGreaterThan(pages.length / 2)
        const people = []
        const walk = (node) => {
          if (Array.isArray(node)) return node.forEach(walk)
          if (!node || typeof node !== 'object') return
          if ('founder' in node || node['@type'] === 'Person') people.push(JSON.stringify(node).slice(0, 120))
          Object.values(node).forEach(walk)
        }
        walk(blocks)
        expect(people).toEqual([])
        expect(named(JSON.stringify(blocks).replaceAll('lbwalton/murmur', 'REPO/murmur'))).toEqual([])
        const home = blocks.find((block) => block['@graph']?.some((node) => node['@type'] === 'Organization'))
        const org = home['@graph'].find((node) => node['@type'] === 'Organization')
        expect(org.name).toBe('Eze Media LLC')
        expect(org.contactPoint.email).toBe(EMAIL)
        expect(org.sameAs).toEqual(['https://github.com/lbwalton/murmur'])
      })
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

describe("the Pro doc's checkout links (LB, 2026-11-01)", () => {
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

  // 2026-11-15: buying on the website in the window makes a founding
  // member, whether or not the code went in.
  it('makes every website buyer in the founders window a founding member, code or not', () => {
    const answer = md.split('## What is a founding member?')[1].split('\n## ')[0]
    expect(answer).toContain('Everyone who buys Pro on the website before the founders window ends')
    expect(answer).toContain(`whether or not they enter the code ${founders.code}`)
    expect(answer).toContain('every future paid product we make')
    expect(md).not.toMatch(/buys Pro with the code|you become a founding member/)
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

  it('makes everyone who buys on the website by then a founding member, with or without the code', () => {
    expect(cost(before)).toContain('Everyone who buys Pro on the website by then is a founding member, with or without the code')
    expect(cost(before)).toContain('10% off every future paid product we make')
    expect(cost(before)).not.toContain('at that price')
  })

  it('sends every checkout link to the code filled in through December 31, and to the plain checkout after (US-172)', () => {
    expect(content(SITE, { now: before }).facts.checkout).toBe(`${PRO.buyUrl}?prefilled_promo_code=FOUNDERS`)
    expect(content(SITE, { now: before }).facts.founders.buy).toBe(content(SITE, { now: before }).facts.checkout)
    expect(content(SITE, { now: after }).facts.checkout).toBe(PRO.buyUrl)
  })

  it('says nothing once the window closes', () => {
    expect(content(SITE, { now: after }).facts.founders).toBeNull()
    expect(cost(after)).not.toContain('39')
    expect(cost(after)).not.toContain('FOUNDERS')
  })
})
