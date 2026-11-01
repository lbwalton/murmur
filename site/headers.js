// SPDX-License-Identifier: GPL-3.0-only
// The six security headers (plus COOP) every response carries, in one
// place: build.js writes them into Cloudflare Pages' _headers file and
// serve.js sends them from the local preview, so what is checked
// locally is what ships. No unsafe-inline anywhere: the page has no
// inline script or style attribute. blob: images are the visitor's own
// poster, made in the browser. The whole .app ending is HSTS preloaded,
// so murmurapp.app is HTTPS-only whatever this says; Strict-Transport-
// Security keeps includeSubDomains and preload because scanners grade
// them (site/README.md, Security). headers.test.js holds all of this.
const SECURITY_HEADERS = [
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

// Pages answers every request with Access-Control-Allow-Origin: *, and a
// scanner that checks the site from its own web page (BrowserTotal) reads
// it with fetch(), which sees only a few basic headers unless the rest
// are exposed. Exposing the list above lets it see them instead of
// grading them missing; their values are public to any other request
// already (US-118).
const HEADERS = [
  ...SECURITY_HEADERS,
  ['Access-Control-Expose-Headers', SECURITY_HEADERS.map(([name]) => name).join(', ')]
]

/** Cloudflare Pages' _headers format: every path gets every header. */
function headersFile() {
  return `/*\n${HEADERS.map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`
}

module.exports = { HEADERS, SECURITY_HEADERS, headersFile }
