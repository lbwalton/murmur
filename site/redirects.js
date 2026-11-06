// SPDX-License-Identifier: GPL-3.0-only
// Short addresses that forward for good (301) to a page on the site, in
// one place: build.js checks each target is a page it built and writes
// them into Cloudflare Pages' _redirects file, and serve.js answers the
// same way in the local preview. murmurapp.app/pro is the Pro page's
// address to say out loud (LaBroi, 2026-11-01).
const REDIRECTS = [
  ['/pro', '/docs/pro/'],
  ['/pro/', '/docs/pro/']
]

/** Cloudflare Pages' _redirects format: source, target, status. */
function redirectsFile() {
  return `${REDIRECTS.map(([from, to]) => `${from} ${to} 301`).join('\n')}\n`
}

module.exports = { REDIRECTS, redirectsFile }
