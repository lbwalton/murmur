// SPDX-License-Identifier: GPL-3.0-only
// Bricolage Grotesque (SIL Open Font License 1.1), murmur's display face
// on the site, the film, and the share card only, fetched at build time
// so no font file lives in the repo: the extra bold, the condensed widths
// in use, and the optical size axis, cut to printable ASCII plus the
// curly apostrophe, ellipsis, and middle dot (about 54 KB instead of
// 131 KB for the whole latin set). Text outside that set falls back to
// the system face. The license travels with the font or nothing ships.

const CHARS = `${Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')}\u2019\u2026\u00b7`
const SHEET = `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..85,800&display=swap&text=${encodeURIComponent(CHARS)}`
const LICENSE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/OFL.txt'
// Google serves woff2 only to browsers it recognizes.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const FILE = 'bricolage-grotesque-display.woff2'
// A stalled proxy must never hang an install: each request gets this long.
const TIMEOUT_MS = 15000
const timed = () => ({ signal: AbortSignal.timeout(TIMEOUT_MS) })

/** Whether bytes are a whole woff2 file: the signature, and the total
 *  length its header records (bytes 8 to 11) matching the size. */
function isWholeWoff2(bytes) {
  return bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'wOF2' && bytes.readUInt32BE(8) === bytes.length
}

/**
 * Fetches the face. Resolves to { font, license, face, url }: the woff2
 * bytes, the OFL text, the @font-face rule as Google wrote it, and the
 * remote url inside it (for a caller to swap for its own path). Throws
 * when anything is missing or is not what it claims to be.
 */
async function fetchDisplayFace() {
  const sheet = await fetch(SHEET, { headers: { 'User-Agent': BROWSER_UA }, ...timed() })
  if (!sheet.ok) throw new Error(`font stylesheet answered ${sheet.status}`)
  const css = await sheet.text()
  const block = /(@font-face\s*\{[^}]*\})/.exec(css)
  const url = block && /url\((https:[^)]+)\)\s*format\('woff2'\)/.exec(block[1])
  if (!url) throw new Error('no woff2 in the font stylesheet')
  const res = await fetch(url[1], timed())
  const font = Buffer.from(await res.arrayBuffer())
  if (!res.ok || !isWholeWoff2(font)) throw new Error('the font file is not a whole woff2')
  const license = await fetch(LICENSE, timed())
  const ofl = license.ok ? await license.text() : ''
  if (!/SIL OPEN FONT LICENSE/i.test(ofl)) throw new Error('the font license could not be fetched')
  return { font, license: ofl, face: block[1], url: url[1] }
}

module.exports = { fetchDisplayFace, isWholeWoff2, DISPLAY_FACE_FILE: FILE }
