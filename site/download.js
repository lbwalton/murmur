// SPDX-License-Identifier: GPL-3.0-only
// The download counter (US-169). The site's download buttons go through
// murmurapp.app/download/mac and /download/windows, which forward (302)
// to the same GitHub release files the buttons always served and count
// the click. A count is the day (UTC), the platform, and the ref tag of
// the link that sent it (?ref=reddit), and nothing else: no IP address,
// no cookie on visitors, no browser details. Counting never holds up or
// breaks a download: the forward goes out at once, the count is written
// after it, and a count that fails is dropped.
//
// /download/me sets the one cookie the site has, the owner cookie, on a
// browser that opens it, and clicks from that browser are not counted, so
// our own downloads stay out of the numbers. Visitors never get it.
//
// Cloudflare Pages runs this through functions/download/[target].js, with
// a Workers KV namespace bound as DOWNLOADS; serve.js runs it in the local
// preview; scripts/site-downloads.js reads the counts back.
const { HEADERS } = require('./headers')

const REPO = 'https://github.com/lbwalton/murmur'
// US-063: permanent names that always serve the newest release.
const TARGETS = {
  mac: `${REPO}/releases/latest/download/murmur-mac.dmg`,
  windows: `${REPO}/releases/latest/download/murmur-windows.exe`
}
const downloadPath = (platform) => `/download/${platform}`
const DOWNLOAD_PATHS = Object.keys(TARGETS).map(downloadPath)

const OWNER_COOKIE = 'murmur_owner'
// Chrome keeps a cookie at most 400 days, so the owner cookie asks for
// that long; open /download/me again within a year to keep it.
const OWNER_DAYS = 400

// Requests a person did not make: crawlers, link previews in chat apps,
// uptime checks, and scripts. The user agent is read here and never kept.
const NOT_A_PERSON =
  /bot|crawl|spider|slurp|preview|scan|monitor|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|java\/|okhttp|go-http|node|axios|undici|headless|lighthouse/i

/**
 * A ref tag as it is counted: lower case, letters, digits, dot, dash and
 * underscore only (anything else becomes a dash), at most 40 characters.
 * Empty when there is none.
 */
function cleanRef(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 40)
    .replace(/^[-.]+|[-.]+$/g, '')
}

/**
 * The ref of a click: the download link's own ?ref=, or else the ?ref= of
 * the page on this site the button was on, read from the Referer the
 * browser sends for a same-site click. So murmurapp.app/?ref=reddit
 * counts as reddit without any script on the page. A Referer from
 * another site is never read.
 */
function refOf(request, url) {
  const own = url.searchParams.get('ref')
  if (own !== null) return cleanRef(own)
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    const from = new URL(referer)
    return from.origin === url.origin ? cleanRef(from.searchParams.get('ref')) : ''
  } catch {
    return ''
  }
}

/** Whether a click is a person's download worth counting. */
function shouldCount(request) {
  if (request.method !== 'GET') return false
  const agent = request.headers.get('user-agent')
  if (!agent || NOT_A_PERSON.test(agent)) return false
  // A browser fetching ahead of a click, which may never come.
  const purpose = `${request.headers.get('sec-purpose') || ''} ${request.headers.get('purpose') || ''}`
  if (/prefetch|prerender/i.test(purpose)) return false
  return !hasOwnerCookie(request)
}

function hasOwnerCookie(request) {
  const cookies = request.headers.get('cookie') || ''
  return cookies.split(';').some((part) => part.trim() === `${OWNER_COOKIE}=1`)
}

/**
 * One KV key per click: day, platform, ref (a dash for none), and a
 * random suffix so 2 clicks never share a key. A key per click means a
 * count is a single write that never races another; reading counts the
 * keys (scripts/site-downloads.js).
 */
function countKey({ day, platform, ref }, random = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)) {
  return `${day}:${platform}:${ref || '-'}:${random()}`
}

/** A counted key read back: { day, platform, ref }, or null if it is not one. */
function parseKey(name) {
  const m = /^(\d{4}-\d{2}-\d{2}):([a-z]+):([a-z0-9._-]+):[0-9a-f]+$/.exec(name)
  if (!m || !Object.hasOwn(TARGETS, m[2])) return null
  return { day: m[1], platform: m[2], ref: m[3] === '-' ? '' : m[3] }
}

/**
 * Counts by day, by ref, and in all, each split by platform, from the
 * counted keys; since (YYYY-MM-DD) leaves out earlier days.
 */
function summarize(names, { since = '' } = {}) {
  const blank = () => Object.fromEntries([...Object.keys(TARGETS), 'total'].map((p) => [p, 0]))
  const byDay = new Map()
  const byRef = new Map()
  const total = blank()
  for (const name of names) {
    const count = parseKey(name)
    if (!count || count.day < since) continue
    for (const [map, key] of [
      [byDay, count.day],
      [byRef, count.ref || '(none)']
    ]) {
      if (!map.has(key)) map.set(key, blank())
      map.get(key)[count.platform] += 1
      map.get(key).total += 1
    }
    total[count.platform] += 1
    total.total += 1
  }
  const rows = (map) => [...map].map(([key, counts]) => ({ key, ...counts }))
  return {
    days: rows(byDay).sort((a, b) => a.key.localeCompare(b.key)),
    refs: rows(byRef).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)),
    total
  }
}

/** Writes a count without ever throwing, after the response if it can. */
function record(store, key, ctx) {
  if (!store || typeof store.put !== 'function') return
  const write = Promise.resolve()
    .then(() => store.put(key, '1'))
    .catch(() => {})
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write)
}

/**
 * Pages does not apply _headers to a Function's responses, so these send
 * the site's security headers themselves. Never cached, never indexed.
 */
function headers(extra) {
  return new Headers([...HEADERS, ['Cache-Control', 'no-store'], ['X-Robots-Tag', 'noindex'], ...Object.entries(extra)])
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** /download/me: sets the owner cookie and says so. */
function ownerPage(now) {
  const until = new Date(now + OWNER_DAYS * 86_400_000).toISOString().slice(0, 10)
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="robots" content="noindex" />
    <title>Downloads from this browser are not counted: murmur</title>
  </head>
  <body>
    <h1>Downloads from this browser are not counted.</h1>
    <p>This browser now has 1 cookie from murmurapp.app, ${OWNER_COOKIE}, sent only to the download links. It tells the download counter to skip clicks from here, so our own downloads stay out of the numbers. No other page on the site sets a cookie.</p>
    <p>It lasts until ${escapeHtml(until)}. Open this page again before then to keep it, or clear the site's cookies to be counted again.</p>
    <p><a href="/">murmur home</a></p>
  </body>
</html>
`
  return new Response(html, {
    status: 200,
    headers: headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': `${OWNER_COOKIE}=1; Max-Age=${OWNER_DAYS * 86_400}; Path=/download; HttpOnly; Secure; SameSite=Lax`
    })
  })
}

/**
 * Answers a request under /download/. env.DOWNLOADS is the KV namespace
 * the counts go to; without it the forward still works, uncounted. ctx
 * carries waitUntil, which lets the count finish after the response.
 */
function handleDownload(request, env = {}, ctx = {}, now = Date.now()) {
  const url = new URL(request.url)
  const target = url.pathname.replace(/^\/download\/?/, '').replace(/\/$/, '')
  if (target === 'me') return ownerPage(now)
  if (!Object.hasOwn(TARGETS, target)) {
    return new Response('Not found\n', { status: 404, headers: headers({ 'Content-Type': 'text/plain; charset=utf-8' }) })
  }
  try {
    if (shouldCount(request)) {
      const day = new Date(now).toISOString().slice(0, 10)
      record(env.DOWNLOADS, countKey({ day, platform: target, ref: refOf(request, url) }), ctx)
    }
  } catch {
    // Counting is never worth a failed download.
  }
  return new Response(null, { status: 302, headers: headers({ Location: TARGETS[target] }) })
}

module.exports = { DOWNLOAD_PATHS, OWNER_COOKIE, OWNER_DAYS, TARGETS, cleanRef, countKey, downloadPath, handleDownload, parseKey, summarize }
