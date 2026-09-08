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
const key = `MURMUR-${b64u(payload)}.${b64u(sig)}`

// Ledger: every issued key is recorded beside the signing key, one
// JSON line per issuance, so reissues and support lookups have a
// source of truth. Private founder data; never in the repo.
const { appendFileSync, openSync, closeSync, existsSync } = require('node:fs')
const ledger = join(homedir(), '.config', 'murmur', 'issued-licenses.jsonl')
if (!existsSync(ledger)) closeSync(openSync(ledger, 'a', 0o600))
appendFileSync(ledger, JSON.stringify({ id: orderId, to: email ?? null, at: Date.now(), key }) + '\n')

console.log(key)
