// SPDX-License-Identifier: GPL-3.0-only
// The keyboard makes no network requests (ios/prd.json IOS-008): finds any
// networking API named in Swift source, comments left out. The test runs
// it over everything the keyboard compiles.

/** Networking APIs and web addresses a keyboard must never name. */
const NETWORK = [
  /\bURLSession\w*\b/,
  /\bURLRequest\b/,
  /\bNSURLConnection\b/,
  /\bNW(?:Connection|Listener|PathMonitor|Browser|Endpoint|Parameters)\b/,
  /^\s*import\s+(?:Network|WebKit|SafariServices)\b/m,
  /\bCFNetwork\b/,
  /\bCFStream\w*\b/,
  /\bWKWebView\b/,
  /\bSFSafariViewController\b/,
  /https?:\/\//
]

/** Swift source with its line and block comments blanked out. A // right
 *  after a colon is a web address, not a comment, so it stays. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, '')
}

/** The networking names a piece of Swift source uses, if any. */
function networkUses(source) {
  const code = withoutComments(source)
  return NETWORK.filter((pattern) => pattern.test(code)).map((pattern) => code.match(pattern)[0].trim())
}

module.exports = { networkUses, withoutComments }
