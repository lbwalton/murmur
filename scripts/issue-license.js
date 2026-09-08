#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Issue a murmur Pro license key. Founder tooling: requires the private
// signing key at ~/.config/murmur/license-signing.pem, which never
// enters this repo. Usage:
//   node scripts/issue-license.js <order-id> [buyer-email]
// Prints the key to stdout, nothing else. Paste it to the buyer.
const { createPrivateKey, sign } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

const [, , orderId, email] = process.argv
if (!orderId) {
  console.error('usage: node scripts/issue-license.js <order-id> [buyer-email]')
  process.exit(1)
}

const pemPath = join(homedir(), '.config', 'murmur', 'license-signing.pem')
let privateKey
try {
  privateKey = createPrivateKey(readFileSync(pemPath, 'utf8'))
} catch {
  console.error(`signing key not found or unreadable at ${pemPath}`)
  process.exit(1)
}

const b64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const payload = Buffer.from(
  JSON.stringify(email ? { id: orderId, at: Date.now(), to: email } : { id: orderId, at: Date.now() })
)
const sig = sign(null, payload, privateKey)
console.log(`MURMUR-${b64u(payload)}.${b64u(sig)}`)
