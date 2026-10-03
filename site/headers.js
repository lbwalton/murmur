// SPDX-License-Identifier: GPL-3.0-only
// The six security headers (plus COOP) every response carries, in one
// place: build.js writes them into Cloudflare Pages' _headers file and
// serve.js sends them from the local preview, so what is checked
// locally is what ships. No unsafe-inline anywhere: the page has no
// inline script or style attribute. blob: images are the visitor's own
// poster, made in the browser.
const HEADERS = [
  [
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; media-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
  ],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin']
]

/** Cloudflare Pages' _headers format: every path gets every header. */
function headersFile() {
  return `/*\n${HEADERS.map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`
}

module.exports = { HEADERS, headersFile }
