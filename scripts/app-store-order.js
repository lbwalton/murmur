#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Confirms an iPhone murmur Pro purchase from the order id on Apple's
// receipt, so LaBroi can issue that buyer a desktop key (ios/prd.json
// IOS-025). Founder tooling: reads his In-App Purchase key from the
// environment and never prints it. Usage:
//   node scripts/app-store-order.js <order-id> [buyer-email]
const { existsSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { projectSetting } = require('./lib/ios')
const { issuedFor, orderVerdict, serverToken } = require('./lib/app-store-order')

const [orderId, email] = process.argv.slice(2)
if (!orderId || !/^[A-Za-z0-9]+$/.test(orderId)) {
  console.error('usage: node scripts/app-store-order.js <order-id> [buyer-email]  (the order id from Apple\'s receipt, letters and digits)')
  process.exit(1)
}

const env = process.env
const keyPath = env.APP_STORE_IAP_KEY
const keyId = env.APP_STORE_IAP_KEY_ID
const issuer = env.APP_STORE_IAP_ISSUER || env.APPLE_API_ISSUER
const missing = [['APP_STORE_IAP_KEY', keyPath], ['APP_STORE_IAP_KEY_ID', keyId], ['APP_STORE_IAP_ISSUER', issuer]].filter(([, value]) => !value).map(([name]) => name)
if (missing.length > 0) {
  console.error(`set ${missing.join(', ')} to your In-App Purchase key (App Store Connect, Users and Access, Integrations, In-App Purchase); see HANDOFF.md`)
  process.exit(1)
}

let keyPem
try {
  keyPem = readFileSync(keyPath, 'utf8')
} catch {
  console.error('APP_STORE_IAP_KEY does not point at a readable .p8 file')
  process.exit(1)
}

const bundleId = projectSetting(readFileSync(join(__dirname, '..', 'ios', 'project.yml'), 'utf8'), 'MURMUR_BUNDLE_ID')
const productId = `${bundleId}.pro`

const FAILURES = {
  401: 'Apple turned the key down. Check APP_STORE_IAP_KEY_ID and APP_STORE_IAP_ISSUER, and that the key is an In-App Purchase key that has not been revoked.',
  404: 'Apple has no order with that id.',
  429: 'Apple is rate limiting. Wait a minute and run it again.'
}

// The ledger issue-license.js writes: an order that already has its key
// never gets a second one.
const ledgerPath = join(homedir(), '.config', 'murmur', 'issued-licenses.jsonl')

async function main() {
  const already = existsSync(ledgerPath) ? issuedFor(readFileSync(ledgerPath, 'utf8'), orderId) : null
  if (already) {
    console.error(`A desktop key was already issued for order ${orderId} on ${already}; see ${ledgerPath}.`)
    return 1
  }
  let token
  try {
    token = serverToken({ keyPem, keyId, issuer, bundleId })
  } catch {
    console.error('APP_STORE_IAP_KEY is not a valid .p8 key file')
    return 1
  }
  let res
  try {
    res = await fetch(`https://api.storekit.apple.com/inApps/v1/lookup/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000)
    })
  } catch (error) {
    console.error(`could not reach Apple: ${error.name === 'TimeoutError' ? 'no answer in 30 seconds' : error.message}`)
    return 1
  }
  if (!res.ok) {
    console.error(FAILURES[res.status] ?? (res.status >= 500 ? `Apple had a problem (${res.status}). Try again later.` : `Apple answered ${res.status}.`))
    return 1
  }
  const answer = await res.json().catch(() => undefined)
  if (answer === undefined) {
    console.error("Apple answered, but its answer could not be read. Try again later.")
    return 1
  }
  const verdict = orderVerdict(answer, { bundleId, productId })
  console.log(verdict.reason)
  if (!verdict.confirmed) return 1
  console.log(`To issue the desktop key: node scripts/issue-license.js ${orderId}${email ? ` ${email}` : ' <buyer-email>'}`)
  return 0
}

main().then((code) => process.exit(code))
