// SPDX-License-Identifier: GPL-3.0-only
// Short addresses that forward for good (301) to a page on the site, in
// one place: build.js checks each target is a page it built and writes
// them into Cloudflare Pages' _redirects file, and serve.js answers the
// same way in the local preview. murmurapp.app/pro is the Pro page's
// address to say out loud (LaBroi, 2026-11-01).
const { DOWNLOAD_PATHS, TARGETS } = require('./download')

const REDIRECTS = [
  ['/pro', '/docs/pro/'],
  ['/pro/', '/docs/pro/']
]

// The download links' safety net (US-169). The counter function answers
// /download/mac and /download/windows, and Pages never applies _redirects
// to a request a Function serves; a deploy that left the function out
// (run from another folder than the repo root) still forwards each one
// to its GitHub file, uncounted, instead of a 404.
const DOWNLOAD_FALLBACKS = DOWNLOAD_PATHS.map((path) => [path, TARGETS[path.split('/').pop()]])

/** Cloudflare Pages' _redirects format: source, target, status. */
function redirectsFile() {
  const lines = [...REDIRECTS.map(([from, to]) => `${from} ${to} 301`), ...DOWNLOAD_FALLBACKS.map(([from, to]) => `${from} ${to} 302`)]
  return `${lines.join('\n')}\n`
}

module.exports = { DOWNLOAD_FALLBACKS, REDIRECTS, redirectsFile }
