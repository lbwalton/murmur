#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Builds murmur's site (US-066, US-079, US-092) into site/dist: the home
// page with its FAQ and structured data rendered from content.js, a page
// for every doc in docs/ and an index of them, the Wispr Flow
// comparison, and a 404, all under one header and footer. Also the night
// studio tokens copied from the app, the app's brush engine stripped of
// its types for the brushwork hero, robots.txt, sitemap.xml, llms.txt and
// llms-full.txt,
// the _headers Cloudflare Pages serves, and the icons and preview image
// drawn by the same kit as the app icons. Nothing binary lives in the
// repo: the display face is fetched at build time (the page falls back
// to system fonts without it) and the film is copied from FILM_DIR,
// which lives outside the repo. SITE_URL sets every absolute URL; a
// deploy build without it fails rather than publish placeholder links.
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { stripTypeScriptTypes } = require('node:module')
const { encodePng, render, renderRect, insideRoundedRect, makeBars, BAR_HEIGHTS } = require('../scripts/lib/draw')
const { content, DOCS } = require('./content')
const { clip, firstParagraph, renderDoc } = require('./markdown')
const { headersFile } = require('./headers')
const { DISPLAY_FACE_FILE, fetchDisplayFace } = require('../scripts/lib/display-face')

const here = __dirname
const root = join(here, '..')
const src = join(here, 'src')
const out = join(here, 'dist')
const tokensFile = join(root, 'src', 'renderer', 'tokens.css')

const PLACEHOLDER = 'https://murmur.example'
const SITE_URL = (process.env.SITE_URL || PLACEHOLDER).replace(/\/+$/, '')
if ((process.env.CF_PAGES || process.env.SITE_DEPLOY) && SITE_URL === PLACEHOLDER) {
  console.error('site: set SITE_URL (for example https://murmurapp.app) before a deploy build')
  process.exit(1)
}
const { links, facts, title, description, faq, compare } = content(SITE_URL)
const docsDir = join(root, 'docs')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// The docs pages describe the release the download button serves, so a
// deploy reads docs/ as it was at that release's tag (v<version>), never
// a branch with features nobody can download yet. DOCS_REF picks another
// git ref; a local build without it reads the working tree.
const DEPLOY = Boolean(process.env.CF_PAGES || process.env.SITE_DEPLOY)
const DOCS_REF = process.env.DOCS_REF || (DEPLOY ? `v${version}` : '')
if (DOCS_REF && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(DOCS_REF)) {
  console.error(`site: DOCS_REF ${JSON.stringify(DOCS_REF)} is not a plain git ref`)
  process.exit(1)
}
// The support address appears once Email Routing forwards it.
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || '').trim()
// The film renders outside the repo (~/Projects/murmur-film); without
// it the page simply has no film section.
const FILM_DIR = process.env.FILM_DIR || join(homedir(), 'Projects', 'murmur-film', 'out')
const FILM = {
  video: 'one-drop-master-1920x1080.mp4',
  poster: 'one-drop-poster-1920x1080.png',
  // When the film was rendered, for its structured data.
  uploaded: '2026-10-01T19:02:00-07:00'
}
const hasFilm = () => existsSync(join(FILM_DIR, FILM.video)) && existsSync(join(FILM_DIR, FILM.poster))

// ---------------------------------------------------------- tokens ---

/** The default theme's hex tokens, read from the app's tokens.css. */
function readTokens() {
  const css = readFileSync(tokensFile, 'utf8')
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const tokens = {}
  for (const [, name, hex] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) tokens[name] = hex
  for (const name of ['ink', 'panel', 'amber', 'red', 'brand']) {
    if (!tokens[name]) throw new Error(`tokens.css has no --${name}`)
  }
  return tokens
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// -------------------------------------------------------- rendering ---

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const plain = (pieces) => pieces.map((p) => (typeof p === 'string' ? p : p.text)).join('')

/** A link: pages on this site open in place, anything else in a new tab. */
function linkHtml(href, text) {
  if (href.startsWith(`${SITE_URL}/`)) return `<a href="${escapeHtml(href.slice(SITE_URL.length))}">${escapeHtml(text)}</a>`
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
}

function answerHtml(pieces) {
  return pieces.map((p) => (typeof p === 'string' ? escapeHtml(p) : linkHtml(p.href, p.text))).join('')
}

function faqHtml(items = faq) {
  return items
    .map(
      (item) =>
        `<div class="qa">\n          <h3>${escapeHtml(item.q)}</h3>\n          <p>${answerHtml(item.a)}</p>\n        </div>`
    )
    .join('\n        ')
}

/** The pill's bars: a fixed, speech-like spread of rest and peak heights
 *  with staggered timing, so the page is identical on every build. The
 *  numbers ship as a generated stylesheet rather than style attributes,
 *  which keeps the Content-Security-Policy free of unsafe-inline. */
const PILL_BAR_COUNT = 34

function pillBars() {
  return '<span class="bar"></span>'.repeat(PILL_BAR_COUNT)
}

function pillCss() {
  const rules = []
  const n = PILL_BAR_COUNT
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const envelope = 0.35 + 0.65 * Math.sin(Math.PI * t)
    const wobble = 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.4))
    const peak = Math.min(1, Math.max(0.22, envelope * wobble))
    const rest = Math.max(0.12, peak * 0.32)
    const dur = 420 + ((i * 137) % 380)
    const delay = -((i * 211) % 900)
    rules.push(
      `.bar:nth-child(${i + 1}){--peak:${peak.toFixed(2)};--rest:${rest.toFixed(2)};--dur:${dur}ms;--delay:${delay}ms}`
    )
  }
  return `/* SPDX-License-Identifier: GPL-3.0-only */\n/* Generated by site/build.js: each bar's rest, peak, and timing. */\n${rules.join('\n')}\n`
}

function jsonLd() {
  const org = `${SITE_URL}/#org`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: 'Eze Media LLC',
        url: `${SITE_URL}/`,
        founder: { '@type': 'Person', name: 'LaBroi Walton' },
        ...(SUPPORT_EMAIL ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: SUPPORT_EMAIL } } : {}),
        sameAs: [links.repo]
      },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: 'murmur', publisher: { '@id': org } },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'murmur',
        description,
        url: `${SITE_URL}/`,
        image: `${SITE_URL}/og.png`,
        applicationCategory: 'UtilitiesApplication',
        applicationSubCategory: 'Dictation software',
        keywords:
          'dictation app, speech to text, voice typing, push to talk dictation, Whisper, open source dictation, Wispr Flow alternative, Mac, Windows',
        featureList: [
          'Push-to-talk dictation into any app',
          'Bring your own key: Groq Whisper by default, any OpenAI-compatible endpoint, or a local Whisper server',
          'Works offline with a local Whisper server',
          'AI cleanup that fails open, so a dictation is never lost',
          'Notes and brain dumps into any folder or Obsidian vault',
          'Transform: speak an edit to selected text',
          'No account, no telemetry'
        ],
        operatingSystem: `${facts.macos.replace(' Ventura', '')}, ${facts.windows}`,
        softwareVersion: version,
        downloadUrl: [links.mac, links.windows],
        license: links.license,
        isAccessibleForFree: true,
        offers: [
          { '@type': 'Offer', name: 'murmur', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'murmur Pro', price: String(facts.proPrice), priceCurrency: 'USD', url: links.doc('pro') }
        ],
        author: { '@id': org },
        publisher: { '@id': org },
        sameAs: [links.repo]
      },
      ...(hasFilm()
        ? [
            {
              '@type': 'VideoObject',
              '@id': `${SITE_URL}/#film`,
              name: 'murmur: One drop',
              description: FILM_TEXT,
              thumbnailUrl: `${SITE_URL}/film/one-drop-poster.png`,
              contentUrl: `${SITE_URL}/film/one-drop.mp4`,
              uploadDate: FILM.uploaded,
              duration: 'PT15S',
              publisher: { '@id': org }
            }
          ]
        : []),
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: plain(item.a) }
        }))
      }
    ]
  }
  // Inside a script element, a literal "</" would end it early.
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const FILM_TEXT =
  'Fifteen seconds, painted by the same brush code as the app. A drop of ember paint hits a key, the splash becomes the pill, your voice writes the first letter of a sentence, and the paint bounces through an email, a doc, and a code editor before it lands in the murmur mark. There is no voice in it, only the sounds of a drip, a key, and the brush.'

function filmHtml() {
  if (!hasFilm()) return ''
  return `<section class="film" id="film" aria-labelledby="film-title">
        <p class="label">the film</p>
        <h2 id="film-title">One drop</h2>
        <p>${escapeHtml(FILM_TEXT)}</p>
        <video controls playsinline preload="none" data-poster="/film/one-drop-poster.png" width="1920" height="1080" aria-labelledby="film-title">
          <source src="/film/one-drop.mp4" type="video/mp4" />
        </video>
      </section>`
}

// Answer engines read the page; these hand a visitor's question to one
// with the site named (prefill formats verified 2026-07 in the
// seo-geo-aeo skill).
const ASK_AI = [
  ['ChatGPT', 'https://chatgpt.com/?q='],
  ['Claude', 'https://claude.ai/new?q='],
  ['Perplexity', 'https://www.perplexity.ai/search?q='],
  ['Gemini', 'https://gemini.google.com/app?q=']
]

function askAiHtml() {
  const host = SITE_URL.replace(/^https?:\/\//, '')
  const prompt = `Tell me about murmur, the push-to-talk dictation app at ${host}. What does it do, what does it cost, and how do I get started?`
  return ASK_AI.map(
    ([name, base]) => `<a href="${escapeHtml(base + encodeURIComponent(prompt))}" target="_blank" rel="noopener noreferrer">${name}</a>`
  ).join(' · ')
}

// ------------------------------------------------------------ shell ---

// The mark in the header: the clean drawn pill (the app icon's geometry
// at 30 px, the size where it is never brushed) as inline SVG, so every
// page shows the same mark without a script.
const MARK_SVG =
  '<svg class="mark" viewBox="0 0 30 30" aria-hidden="true" focusable="false"><rect class="mark-ring" x="4.2" y="9.3" width="21.6" height="11.4" rx="5.7" /><circle class="mark-dot" cx="9.9" cy="15" r="2.1" /></svg>'

/** One header for every page (US-092): it stays at the top while the
 *  page scrolls, and the link for the page you are on is marked. */
function headerHtml(current) {
  const here = (name) => (current === name ? ' aria-current="page"' : '')
  return `<header class="topbar">
      <div class="top">
        <a class="wordmark" href="/" aria-label="murmur home"${here('home')}>${MARK_SVG}<span>murmur</span></a>
        <nav aria-label="Site">
          ${hasFilm() ? '<a class="nav-film" href="/#film">film</a>' : ''}
          <a href="/docs/"${here('docs')}>docs</a>
          <a href="/wispr-flow-alternative/"${here('compare')}>compare</a>
          <a class="nav-github" href="${links.repo}" target="_blank" rel="noopener noreferrer">github</a>
          <a class="nav-download" href="/#download">download</a>
        </nav>
      </div>
    </header>`
}

function footerHtml() {
  return `<footer class="bottom">
      <p>murmur · version ${version} · GPL-3.0 · © 2026 Eze Media LLC${SUPPORT_EMAIL ? ` · <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>` : ''}</p>
      <nav aria-label="More">
        <a href="/docs/">docs</a>
        <a href="/wispr-flow-alternative/">murmur vs Wispr Flow</a>
        <a href="${links.releases}" target="_blank" rel="noopener noreferrer">releases</a>
        <a href="${links.repo}" target="_blank" rel="noopener noreferrer">source</a>
      </nav>
    </footer>`
}

function fontPreload(font) {
  return font ? `<link rel="preload" href="/fonts/${font}" as="font" type="font/woff2" crossorigin />` : ''
}

function page(tokens, font) {
  const values = {
    FONT_PRELOAD: fontPreload(font),
    HEADER: headerHtml('home'),
    FOOTER: footerHtml(),
    FILM: filmHtml(),
    ASK_AI: askAiHtml(),
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    SITE_URL,
    THEME_COLOR: tokens.ink,
    JSON_LD: jsonLd(),
    PILL_BARS: pillBars(),
    FAQ: faqHtml(),
    MAC_URL: links.mac,
    WINDOWS_URL: links.windows,
    WINDOWS_SCREEN_URL: links.windowsScreen.slice(SITE_URL.length),
    MACOS: facts.macos.replace(' Ventura', ''),
    WINDOWS: facts.windows
  }
  const html = readFileSync(join(src, 'index.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`index.html asks for an unknown value ${match}`)
    return values[key]
  })
  return html
}

// ----------------------------------------------------------- images ---

/** The favicon: the app icon's geometry as SVG text. */
function faviconSvg(tokens) {
  const s = 64
  const inset = 0.05 * s
  const radius = 0.22 * s
  const barWidth = 0.075 * s
  const gap = 0.055 * s
  const maxHalf = 0.21 * s
  const total = BAR_HEIGHTS.length * barWidth + (BAR_HEIGHTS.length - 1) * gap
  const startX = (s - total) / 2
  const bars = BAR_HEIGHTS.map((h, i) => {
    const hh = Math.max(maxHalf * h, barWidth / 2)
    const x = startX + i * (barWidth + gap)
    return `<rect x="${x.toFixed(2)}" y="${(s / 2 - hh).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(2 * hh).toFixed(2)}" rx="${(barWidth / 2).toFixed(2)}" fill="${tokens.amber}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}"><rect x="${inset}" y="${inset}" width="${s - 2 * inset}" height="${s - 2 * inset}" rx="${radius.toFixed(2)}" fill="${tokens.ink}"/>${bars}</svg>\n`
}

/** Home screen icon: full-bleed ink (iOS masks the corners itself). */
function touchIconPng(tokens) {
  const s = 180
  const ink = rgb(tokens.ink)
  const amber = rgb(tokens.amber)
  const bars = makeBars(s, 0.21 * s, 0.075 * s, 0.055 * s)
  return encodePng(s, s, render(s, (px, py) => (bars(px, py) ? [...amber, 1] : [...ink, 1])))
}

/** The 1200 x 630 link preview: the live pill, centered on ink. */
function previewPng(tokens) {
  const W = 1200
  const H = 630
  const ink = rgb(tokens.ink)
  const panel = rgb(tokens.panel)
  const amber = rgb(tokens.amber)
  const red = rgb(tokens.red)
  const pill = { cx: W / 2, cy: H / 2, hw: 380, hh: 90 }
  const dot = { cx: pill.cx - pill.hw + 88, cy: pill.cy, r: 15 }
  const n = 24
  const barW = 12
  const gap = 12
  const startX = dot.cx + 56
  const heights = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return Math.max(0.16, (0.3 + 0.7 * Math.sin(Math.PI * t)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + 0.4))))
  })
  return encodePng(
    W,
    H,
    renderRect(W, H, (px, py) => {
      if (!insideRoundedRect(px, py, pill.cx, pill.cy, pill.hw, pill.hh, pill.hh)) return [...ink, 1]
      if (Math.hypot(px - dot.cx, py - dot.cy) <= dot.r) return [...red, 1]
      const i = Math.floor((px - startX) / (barW + gap))
      if (i >= 0 && i < n) {
        const cx = startX + i * (barW + gap) + barW / 2
        const half = Math.max(barW / 2, 62 * heights[i])
        if (insideRoundedRect(px, py, cx, pill.cy, barW / 2, half, barW / 2)) return [...amber, 1]
      }
      return [...panel, 1]
    })
  )
}

// ------------------------------------------------------------- text ---

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'GoogleOther',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'Bytespider'
]

function robotsTxt() {
  const blocks = ['*', ...AI_CRAWLERS].map((agent) => `User-agent: ${agent}\nAllow: /\n`)
  return `${blocks.join('\n')}\nSitemap: ${SITE_URL}/sitemap.xml\n`
}

function sitemapXml(docs) {
  const site = gitDate('site', 'package.json')
  const entries = [
    ['/', site, '1.0'],
    ['/wispr-flow-alternative/', compareDate(), '0.9'],
    ['/docs/', [...docs.map((d) => d.updated), gitDate('site/content.js')].sort().at(-1), '0.8'],
    ...docs.map((d) => [`/docs/${d.name}/`, d.updated, '0.7'])
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([path, date, priority]) => `  <url>\n    <loc>${SITE_URL}${path}</loc>\n    <lastmod>${date}</lastmod>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}
</urlset>
`
}

function llmsTxt(docs) {
  const qa = faq.map((item) => `### ${item.q}\n\n${plain(item.a)}`).join('\n\n')
  const c = compare
  return `# murmur: ${SITE_URL}

> murmur is free, open source (GPL-3.0) push-to-talk dictation for macOS and Windows, made by Eze Media LLC. Hold a hotkey, speak, and release: murmur transcribes the audio, cleans up the text, and types it at the cursor in any app. It is bring your own key: transcription runs on the user's own API key, with Groq Whisper by default or any OpenAI-compatible endpoint, including a local server.

## Facts
- Platforms: ${facts.macos} (Apple silicon and Intel, one universal download); ${facts.windows} (x64 and ARM, one installer)
- Price: the app is free; murmur Pro is an optional one-time purchase of $${facts.proPrice} (provider profiles, early access)
- Privacy: records only while the hotkey is held; audio goes only to the provider the user configured; history, stats, and settings stay on the computer; no account, no murmur server, no telemetry
- Cleanup fails open: if the cleanup model errors, the plain transcript is still inserted, so a dictation is never lost
- Current version: ${version}
- License: GPL-3.0-only; source at ${links.repo}

## Download
- Mac: ${links.mac}
- Windows: ${links.windows} (unsigned for now, so Windows shows "Windows protected your PC"; click More info, then Run anyway)
- Every release: ${links.releases}

## Docs
${docs.map((d) => `- ${d.title}: ${links.doc(d.name)}`).join('\n')}
- Every doc in one file: ${SITE_URL}/llms-full.txt

## Pages
- ${SITE_URL}/ : what murmur is, the download button, and answers to common questions
- ${links.docs} : the docs, every page listed with its questions
- ${links.compare} : murmur compared with Wispr Flow

## Compared with Wispr Flow
${c.answer}

${c.rows.map(([what, ours, theirs]) => `- ${what}: murmur: ${ours} Wispr Flow: ${theirs}`).join('\n')}

Wispr Flow's plans, prices, platforms, and requirements checked ${c.checked} against ${c.sources.map(([, href]) => href).join(' and ')}.

## Questions

${qa}

${hasFilm() ? `## Film\n- One drop (15 s): ${SITE_URL}/film/one-drop.mp4. ${FILM_TEXT}\n\n` : ''}## Contact
- Issues and support: ${links.issues}${SUPPORT_EMAIL ? `\n- Email: ${SUPPORT_EMAIL}` : ''}
`
}

// ------------------------------------------------------------ pages ---

const ORG = () => ({ '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: 'Eze Media LLC', url: `${SITE_URL}/` })

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** The last commit date (YYYY-MM-DD) of any of these paths, for lastmod
 *  and "updated" lines; today when git has nothing to say. */
function gitDate(...paths) {
  return gitDateAt('HEAD', ...paths)
}

function gitDateAt(ref, ...paths) {
  try {
    const date = git('log', '-1', '--format=%cs', ref, '--', ...paths).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  } catch {
    // Not a checkout (a tarball build): fall through.
  }
  return new Date().toISOString().slice(0, 10)
}

/** Every page but home: the same head, header, and footer. */
function subpage({ path, pageTitle, pageDescription, current, body, data, font }) {
  const url = `${SITE_URL}${path}`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(pageDescription)}" />
    <link rel="canonical" href="${url}" />
    <meta name="theme-color" content="${THEME_COLOR}" />
    <meta name="color-scheme" content="dark" />
    <meta name="author" content="Eze Media LLC" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="murmur" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(pageDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE_URL}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="murmur's waveform pill, live" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(pageDescription)}" />
    <meta name="twitter:image" content="${SITE_URL}/og.png" />
    ${fontPreload(font)}
    <link rel="stylesheet" href="/tokens.css" />
    <link rel="stylesheet" href="/fonts.css" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/pages.css" />
    ${data ? `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}
  </head>
  <body>
    ${headerHtml(current)}

    <main class="page-main">
      ${body}
    </main>

    ${footerHtml()}
  </body>
</html>
`
}

let THEME_COLOR = ''

/** The comparison changed when its facts were last checked or its words
 *  last committed, whichever is later. */
const compareDate = () => [compare.checked, gitDate('site/content.js')].sort().at(-1)

const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` }))
})

const faqData = (id, items) => ({
  '@type': 'FAQPage',
  '@id': id,
  mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } }))
})

const DOC_NAMES = new Set(DOCS.map(([name]) => name))

/** A heading phrased as a question, allowing a trailing aside like
 *  "How do I use Groq with murmur? (default)". */
const isQuestion = (heading) => /\?(\s*\([^)]*\))?$/.test(heading)

/** A link inside a doc: another doc becomes its page here, a page's own
 *  anchors stay, the web stays the web, and any other repo file goes to
 *  GitHub. */
function resolveDocLink(href) {
  if (/^(https?:|mailto:)/.test(href)) return { href, external: /^https?:/.test(href) }
  if (href.startsWith('#')) return { href, external: false }
  const doc = /^(?:\.\/)?([a-z0-9-]+)\.md(#[^\s]*)?$/.exec(href)
  if (doc && DOC_NAMES.has(doc[1])) return { href: `/docs/${doc[1]}/${doc[2] || ''}`, external: false }
  return { href: `${links.repo}/blob/${DOCS_REF || 'main'}/docs/${href.replace(/^\.\//, '')}`, external: true }
}

/** Every doc rendered once: name, short name, title, description, body, its
 *  questions, and when it last changed. */
function readDocs() {
  if (DOCS_REF) {
    try {
      git('rev-parse', '--verify', '--quiet', `${DOCS_REF}^{commit}`)
    } catch {
      throw new Error(`site: the docs come from ${DOCS_REF}, which is not a git ref here (tag the release, or set DOCS_REF)`)
    }
  }
  const files = (DOCS_REF ? git('ls-tree', '--name-only', DOCS_REF, 'docs/').split('\n').map((f) => f.replace(/^docs\//, '')) : readdirSync(docsDir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
  const missing = files.filter((f) => !DOC_NAMES.has(f))
  if (missing.length) throw new Error(`site: docs/${missing[0]}.md is not in DOCS in site/content.js`)
  // A doc added since the release is not on the site until the release
  // that ships it; the working tree must have every doc DOCS lists.
  const listed = DOCS.filter(([name]) => {
    if (files.includes(name)) return true
    if (DOCS_REF) {
      console.log(`site: docs/${name}.md is not at ${DOCS_REF} yet; it joins the site with the release that ships it`)
      return false
    }
    throw new Error(`site: DOCS lists ${name} but docs/${name}.md does not exist`)
  })
  return listed.map(([name, short, written]) => {
    const markdown = DOCS_REF ? git('show', `${DOCS_REF}:docs/${name}.md`) : readFileSync(join(docsDir, `${name}.md`), 'utf8')
    const doc = renderDoc(markdown, resolveDocLink)
    const description = clip(written || firstParagraph(markdown) || doc.title, 158)
    const updated = DOCS_REF ? gitDateAt(DOCS_REF, `docs/${name}.md`) : gitDate(`docs/${name}.md`)
    return { name, short, markdown, ...doc, description, updated }
  })
}

function docNav(docs, current) {
  return `<nav class="doc-nav" aria-label="Docs">
          <p class="label"><a href="/docs/">docs</a></p>
          <ul>
            ${docs.map((d) => `<li><a href="/docs/${d.name}/"${d.name === current ? ' aria-current="page"' : ''}>${escapeHtml(d.short)}</a></li>`).join('\n            ')}
          </ul>
        </nav>`
}

function docPage(docs, doc, font) {
  const i = docs.indexOf(doc)
  const next = docs[i + 1]
  const path = `/docs/${doc.name}/`
  const description = doc.description
  const questions = doc.sections.filter((s) => isQuestion(s.question) && s.answer)
  const body = `<div class="doc-layout">
        ${docNav(docs, doc.name)}
        <article class="doc">
          <nav class="crumbs" aria-label="Breadcrumb"><a href="/docs/">docs</a> <span aria-hidden="true">/</span> <span aria-current="page">${escapeHtml(doc.short)}</span></nav>
          <h1>${escapeHtml(doc.title)}</h1>
          ${doc.html}
          <p class="doc-meta">Updated ${doc.updated} · <a href="${links.docSource(doc.name, DOCS_REF || 'main')}" target="_blank" rel="noopener noreferrer">this page on GitHub</a></p>
          ${next ? `<p class="doc-next">Next: <a href="/docs/${next.name}/">${escapeHtml(next.title)}</a></p>` : ''}
        </article>
      </div>`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${SITE_URL}${path}#article`,
        headline: doc.title,
        description,
        url: `${SITE_URL}${path}`,
        dateModified: doc.updated,
        inLanguage: 'en',
        author: ORG(),
        publisher: ORG(),
        about: { '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#app`, name: 'murmur' },
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'murmur', url: `${SITE_URL}/` }
      },
      crumbs([
        ['murmur', '/'],
        ['docs', '/docs/'],
        [doc.short, path]
      ]),
      ...(questions.length ? [faqData(`${SITE_URL}${path}#faq`, questions.map((q) => ({ q: q.question, a: q.answer })))] : [])
    ]
  }
  return subpage({ path, pageTitle: `${doc.title}: murmur docs`, pageDescription: description, current: 'docs', body, data, font })
}

function docsIndexPage(docs, font) {
  const path = '/docs/'
  const description =
    'Everything murmur does, written as answers to the questions people ask: install, settings, providers and keys, notes, transform, the journey, and troubleshooting.'
  const body = `<div class="doc-layout">
        ${docNav(docs, null)}
        <article class="doc">
          <p class="label">docs</p>
          <h1>murmur docs</h1>
          <p class="lede">Everything murmur does, written as answers to the questions people ask. New here? Start with the <a href="/docs/quickstart/">quickstart</a>: install to first dictation in about five minutes.</p>
          ${docs
            .map(
              (d) => `<section class="doc-card" aria-labelledby="doc-${d.name}">
            <h2 id="doc-${d.name}"><a href="/docs/${d.name}/">${escapeHtml(d.title)}</a></h2>
            <p>${escapeHtml(d.description)}</p>
            ${
              d.sections.some((s) => isQuestion(s.question))
                ? `<ul class="doc-questions">${d.sections
                    .filter((s) => isQuestion(s.question))
                    .map((s) => `<li><a href="/docs/${d.name}/#${escapeHtml(s.id)}">${escapeHtml(s.question)}</a></li>`)
                    .join('')}</ul>`
                : ''
            }
          </section>`
            )
            .join('\n          ')}
        </article>
      </div>`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${path}#page`,
        name: 'murmur docs',
        description,
        url: `${SITE_URL}${path}`,
        publisher: ORG(),
        hasPart: docs.map((d) => ({ '@type': 'TechArticle', headline: d.title, url: `${SITE_URL}/docs/${d.name}/` }))
      },
      crumbs([
        ['murmur', '/'],
        ['docs', path]
      ])
    ]
  }
  return subpage({ path, pageTitle: 'murmur docs: setup, settings, providers, and answers', pageDescription: description, current: 'docs', body, data, font })
}

function comparePage(font) {
  const c = compare
  const path = '/wispr-flow-alternative/'
  const cell = (text) => escapeHtml(text)
  const body = `<article class="doc doc-wide">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/">murmur</a> <span aria-hidden="true">/</span> <span aria-current="page">compare</span></nav>
        <h1>${escapeHtml(c.h1)}</h1>
        <p class="lede">${escapeHtml(c.answer)}</p>
        <p class="cta-row"><a class="btn" href="/#download">Download murmur</a> <a class="cta-link" href="/docs/quickstart/">Read the quickstart</a></p>

        <h2 id="side-by-side">murmur and Wispr Flow side by side</h2>
        <div class="table-wrap">
          <table class="compare" role="table">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader"><span class="sr-only">What</span></th><th scope="col" role="columnheader">murmur</th><th scope="col" role="columnheader">Wispr Flow</th></tr></thead>
            <tbody role="rowgroup">
              ${c.rows.map(([what, ours, theirs]) => `<tr role="row"><th scope="row" role="rowheader">${cell(what)}</th><td role="cell" data-label="murmur">${cell(ours)}</td><td role="cell" data-label="Wispr Flow">${cell(theirs)}</td></tr>`).join('\n              ')}
            </tbody>
          </table>
        </div>

        <h2 id="why-pick-murmur">Why pick murmur?</h2>
        <ul class="points">
          ${c.why.map(([lead, rest]) => `<li><strong>${cell(lead)}</strong> ${cell(rest)}</li>`).join('\n          ')}
        </ul>

        <h2 id="when-is-wispr-flow-the-better-pick">When is Wispr Flow the better pick?</h2>
        <ul class="points">
          ${c.better.map(([lead, rest]) => `<li><strong>${cell(lead)}</strong> ${cell(rest)}</li>`).join('\n          ')}
        </ul>

        <h2 id="how-do-i-switch-from-wispr-flow-to-murmur">How do I switch from Wispr Flow to murmur?</h2>
        <ol>
          ${c.steps.map(([lead, rest, href]) => `<li><strong>${href ? linkHtml(href, lead) : cell(lead)}</strong>${cell(rest)}</li>`).join('\n          ')}
        </ol>

        <section class="faq-block" aria-labelledby="questions">
          <h2 id="questions">Questions</h2>
          ${faqHtml(c.faq)}
        </section>

        <p class="sources">Wispr Flow's plans, prices, platforms, and requirements checked ${c.checked} against Wispr's own pages: ${c.sources
          .map(([name, href]) => linkHtml(href, name))
          .join(', ')}. Plans and prices change; those pages are the truth. Wispr Flow is a trademark of its owner, and murmur is not affiliated with Wispr.</p>
      </article>`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}${path}#page`,
        name: c.title,
        description: c.description,
        url: `${SITE_URL}${path}`,
        dateModified: compareDate(),
        publisher: ORG(),
        about: { '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#app`, name: 'murmur' },
        mentions: { '@type': 'SoftwareApplication', name: 'Wispr Flow', url: 'https://wisprflow.ai/' }
      },
      crumbs([
        ['murmur', '/'],
        ['murmur vs Wispr Flow', path]
      ]),
      faqData(`${SITE_URL}${path}#faq`, c.faq.map((item) => ({ q: item.q, a: plain(item.a) })))
    ]
  }
  return subpage({ path, pageTitle: c.title, pageDescription: c.description, current: 'compare', body, data, font })
}

function notFoundPage(font) {
  const body = `<article class="doc">
        <p class="label">404</p>
        <h1>That page is not here.</h1>
        <p class="lede">It may have moved. The <a href="/docs/">docs</a> answer most questions, and <a href="/">the home page</a> has the download.</p>
      </article>`
  const html = subpage({ path: '/404', pageTitle: 'Page not found: murmur', pageDescription: description, current: null, body, data: null, font })
  const canonical = `<link rel="canonical" href="${SITE_URL}/404" />`
  // A 404 must never claim a canonical address of its own.
  if (!html.includes(canonical)) throw new Error('site: the 404 page has no canonical line to swap for noindex')
  return html.replace(canonical, '<meta name="robots" content="noindex" />')
}

/**
 * Every link to a page or an anchor on this site must land: a doc
 * renamed or a question reworded would otherwise leave a dead link that
 * only a visitor finds. Checked across every page the build writes.
 */
function checkLinks(pages) {
  const files = new Set()
  const ids = new Map()
  for (const [path, html] of pages) ids.set(path, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
  for (const [path, html] of pages) {
    for (const [, raw] of html.matchAll(/href="([^"]+)"/g)) {
      const href = raw.replace(/&amp;/g, '&')
      const local = href.startsWith(`${SITE_URL}/`) ? href.slice(SITE_URL.length) : href
      if (!local.startsWith('/') || local.startsWith('//')) continue
      const [target, anchor] = local.split('#')
      if (/\.[a-z0-9]+$/i.test(target)) {
        files.add(target)
        continue
      }
      const page = ids.get(target)
      if (!page) throw new Error(`site: ${path} links to ${local}, which is not a page`)
      if (anchor && !page.has(anchor)) throw new Error(`site: ${path} links to ${local}, but that page has no #${anchor}`)
    }
    // Stylesheets, scripts, icons, the film: checked once dist is written.
    for (const [, ref] of html.matchAll(/\s(?:src|data-poster)="(\/[^"#?]+)/g)) files.add(ref)
  }
  return files
}

/** Every file a page points at exists in dist, so a typo in a path
 *  fails the build instead of a visitor's request. */
function checkFiles(files) {
  for (const file of files) {
    if (!existsSync(join(out, file))) throw new Error(`site: a page points at ${file}, which the build did not write`)
  }
}

/** Every doc in one Markdown file for language models, links made
 *  absolute so they still work out of context. */
function llmsFullTxt(docs) {
  const absolute = (md) =>
    md.replace(/\]\(([^)\s]+)\)/g, (match, href) => {
      const target = resolveDocLink(href)
      return target.href.startsWith('/') ? `](${SITE_URL}${target.href})` : `](${target.href})`
    })
  return `# murmur docs: ${SITE_URL}/docs/

> The complete murmur documentation in one file. murmur is free, open source (GPL-3.0) push-to-talk dictation for macOS and Windows. Each doc also has its own page; its address is on the line under its title.

${docs.map((d) => `${absolute(d.markdown).replace(/^# (.*)$/m, `# $1\n\n${links.doc(d.name)}`).trim()}`).join('\n\n---\n\n')}
`
}

// ------------------------------------------------------------ paint ---

/** The app's brush engine as a browser module: brush.ts with its types
 *  stripped by Node itself (22.13 or later), so the site paints with the
 *  same code as the app and needs no bundler. */
function brushJs() {
  const ts = readFileSync(join(root, 'src', 'renderer', 'brush.ts'), 'utf8')
  return stripTypeScriptTypes(ts, { mode: 'strip' })
}

/** Belt colors from the app's cosmetics, for the paint-your-own palette. */
function paintCss() {
  const { beltColors } = JSON.parse(readFileSync(join(root, 'shared', 'cosmetics.json'), 'utf8'))
  const vars = Object.entries(beltColors).map(([name, hex]) => `  --belt-${name}: ${hex};`)
  return `/* SPDX-License-Identifier: GPL-3.0-only */\n/* Generated by site/build.js from shared/cosmetics.json. */\n:root {\n${vars.join('\n')}\n}\n`
}

// ------------------------------------------------------------- font ---

// The display face comes from scripts/lib/display-face.js, the same fetch
// the app's share card uses.
async function fetchFont() {
  const empty = '/* SPDX-License-Identifier: GPL-3.0-only */\n/* The display face was not fetched; system fonts stand in. */\n'
  if (process.env.SITE_OFFLINE) return { css: empty, file: null }
  try {
    const { font, license, face: remote, url } = await fetchDisplayFace()
    mkdirSync(join(out, 'fonts'), { recursive: true })
    const file = DISPLAY_FACE_FILE
    writeFileSync(join(out, 'fonts', file), font)
    writeFileSync(join(out, 'fonts', 'OFL.txt'), license)
    const face = remote.replace(url, `fonts/${file}`)
    return { css: `/* SPDX-License-Identifier: GPL-3.0-only */\n/* Bricolage Grotesque, SIL Open Font License 1.1 (fonts/OFL.txt). */\n${face}\n`, file }
  } catch (error) {
    console.warn(`site: display face not fetched (${error.message}); system fonts stand in`)
    return { css: empty, file: null }
  }
}

// ---------------------------------------------------- fingerprints ---

/**
 * Every script, stylesheet, and the font gets a ?v= of its own content
 * in the files that point at it. The page itself is never cached
 * (Pages serves it with max-age=0), so a deploy reaches returning
 * visitors on their next load even though the zone keeps assets for
 * hours, and an old script can never meet a new page.
 */
function fingerprint() {
  const { createHash } = require('node:crypto')
  const hash = (file) => createHash('sha256').update(readFileSync(join(out, file))).digest('hex').slice(0, 10)
  const stamp = (file, refs) => {
    let text = readFileSync(join(out, file), 'utf8')
    for (const ref of refs) {
      if (!existsSync(join(out, ref))) continue
      const v = hash(ref)
      text = text
        .split(`"${ref}"`)
        .join(`"${ref}?v=${v}"`)
        .split(`"/${ref}"`)
        .join(`"/${ref}?v=${v}"`)
        .split(`'./${ref}'`)
        .join(`'./${ref}?v=${v}'`)
        .split(`(${ref})`)
        .join(`(${ref}?v=${v})`)
      // A reference written some other way would stay unstamped and
      // stale for hours; the build stops instead.
      if (!text.includes(`${ref}?v=${v}`)) throw new Error(`site: ${file} has no stampable reference to ${ref}`)
    }
    writeFileSync(join(out, file), text)
  }
  // Innermost first: a file's fingerprint covers the stamps inside it.
  stamp('hero.js', ['brush.js'])
  stamp('fonts.css', ['fonts/bricolage-grotesque-display.woff2'])
  stamp('index.html', [
    'tokens.css',
    'fonts.css',
    'paint.css',
    'styles.css',
    'pill.css',
    'app.js',
    'hero.js',
    'fonts/bricolage-grotesque-display.woff2',
    'film/one-drop.mp4',
    'film/one-drop-poster.png'
  ])
  for (const file of subpageFiles) {
    stamp(file, ['tokens.css', 'fonts.css', 'styles.css', 'pages.css', 'fonts/bricolage-grotesque-display.woff2'])
  }
}

// The pages besides home, as written into dist, for the fingerprint pass.
const subpageFiles = []

// ------------------------------------------------------------- main ---

async function main() {
  const tokens = readTokens()
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const font = await fetchFont()
  writeFileSync(join(out, 'fonts.css'), font.css)
  THEME_COLOR = tokens.ink
  const home = page(tokens, font.file)
  writeFileSync(join(out, 'index.html'), home)
  const docs = readDocs()
  const pages = [
    ['/docs/', 'docs/index.html', docsIndexPage(docs, font.file)],
    ...docs.map((d) => [`/docs/${d.name}/`, `docs/${d.name}/index.html`, docPage(docs, d, font.file)]),
    ['/wispr-flow-alternative/', 'wispr-flow-alternative/index.html', comparePage(font.file)],
    ['/404', '404.html', notFoundPage(font.file)]
  ]
  const linkedFiles = checkLinks([['/', home], ...pages.map(([path, , html]) => [path, html])])
  for (const [, file, html] of pages) {
    mkdirSync(join(out, file, '..'), { recursive: true })
    writeFileSync(join(out, file), html)
    subpageFiles.push(file)
  }
  copyFileSync(tokensFile, join(out, 'tokens.css'))
  copyFileSync(join(src, 'styles.css'), join(out, 'styles.css'))
  copyFileSync(join(src, 'pages.css'), join(out, 'pages.css'))
  copyFileSync(join(src, 'app.js'), join(out, 'app.js'))
  copyFileSync(join(src, 'hero.js'), join(out, 'hero.js'))
  writeFileSync(join(out, 'brush.js'), brushJs())
  writeFileSync(join(out, 'paint.css'), paintCss())
  writeFileSync(join(out, '_headers'), headersFile())
  if (hasFilm()) {
    mkdirSync(join(out, 'film'), { recursive: true })
    copyFileSync(join(FILM_DIR, FILM.video), join(out, 'film', 'one-drop.mp4'))
    copyFileSync(join(FILM_DIR, FILM.poster), join(out, 'film', 'one-drop-poster.png'))
  }
  writeFileSync(join(out, 'pill.css'), pillCss())
  fingerprint()
  writeFileSync(join(out, 'favicon.svg'), faviconSvg(tokens))
  writeFileSync(join(out, 'apple-touch-icon.png'), touchIconPng(tokens))
  writeFileSync(join(out, 'og.png'), previewPng(tokens))
  writeFileSync(join(out, 'robots.txt'), robotsTxt())
  writeFileSync(join(out, 'sitemap.xml'), sitemapXml(docs))
  writeFileSync(join(out, 'llms.txt'), llmsTxt(docs))
  writeFileSync(join(out, 'llms-full.txt'), llmsFullTxt(docs))
  checkFiles(linkedFiles)
  console.log(
    `site: built site/dist for ${SITE_URL}${SITE_URL === PLACEHOLDER ? ' (placeholder; set SITE_URL for a real build)' : ''}; ${pages.length + 1} pages; docs from ${DOCS_REF || 'the working tree'}; display face ${font.file ? 'fetched' : 'skipped'}; film ${hasFilm() ? 'included' : 'not found'}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
