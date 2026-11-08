// SPDX-License-Identifier: GPL-3.0-only
// Reads an App Store order for murmur Pro (ios/prd.json IOS-025): an iPhone
// buyer sends the order id from Apple's receipt, and LaBroi confirms it with
// Apple before issuing a desktop key. Apple's Look Up Order ID, checked
// 2026-10-22: a JWT signed ES256 with an In-App Purchase key, and an answer
// of { status, signedTransactions } whose payloads name the bundle id,
// product id, purchase date, and any refund.
const { createPrivateKey, sign } = require('node:crypto')

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

/** The bearer token for the App Store Server API, good for 20 minutes. */
function serverToken({ keyPem, keyId, issuer, bundleId, now = Math.floor(Date.now() / 1000) }) {
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  const body = b64({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: bundleId })
  const key = createPrivateKey(keyPem)
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}

/** A signed transaction's payload, or null when it cannot be read. The
 *  answer came from Apple over TLS on our own key, so the payload is read
 *  without checking Apple's certificate chain. */
function payloadOf(signed) {
  const part = typeof signed === 'string' ? signed.split('.')[1] : undefined
  if (!part) return null
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

/** Whether an order holds murmur Pro, still paid for, in plain words. */
function orderVerdict(answer, { bundleId, productId }) {
  if (!answer || answer.status !== 0) {
    return { confirmed: false, reason: 'Apple says this is not an order id it knows. Ask the buyer for the order id on their App Store receipt.' }
  }
  const signed = Array.isArray(answer.signedTransactions) ? answer.signedTransactions : []
  if (signed.length === 0) return { confirmed: false, reason: 'Apple found the order, but it holds no purchases.' }
  const payloads = signed.map(payloadOf)
  const ours = payloads.filter((p) => p && p.bundleId === bundleId && p.productId === productId)
  const held = ours.filter((p) => !p.revocationDate)
  // offerType 3 is an offer code: Pro came free from a desktop order, so it
  // never earns a second desktop key.
  const paid = held.find((p) => p.offerType !== 3)
  if (paid) {
    const when = new Date(Number(paid.purchaseDate))
    const purchased = Number.isNaN(when.getTime()) ? 'an unknown day' : when.toISOString().slice(0, 10)
    return { confirmed: true, reason: `murmur Pro, bought ${purchased}, not refunded.`, purchased, transactionId: String(paid.transactionId) }
  }
  if (held.length > 0) {
    const code = held[0].offerIdentifier ? `the ${held[0].offerIdentifier} code` : 'an offer code'
    return { confirmed: false, reason: `murmur Pro here was redeemed with ${code}, so it came from a desktop order, which already has its key.` }
  }
  if (ours.length > 0) return { confirmed: false, reason: 'murmur Pro was bought in this order, then refunded.' }
  if (payloads.every((p) => p === null)) return { confirmed: false, reason: 'Apple answered, but its purchases could not be read.' }
  return { confirmed: false, reason: 'This order holds no murmur Pro purchase.' }
}

/** The day a key was already issued for this order id, from the license
 *  ledger issue-license.js keeps (one JSON line per key), or null. */
function issuedFor(ledger, orderId) {
  for (const line of String(ledger).split('\n')) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry && entry.id === orderId) {
      const when = new Date(Number(entry.at))
      return Number.isNaN(when.getTime()) ? 'an unknown day' : when.toISOString().slice(0, 10)
    }
  }
  return null
}

module.exports = { issuedFor, orderVerdict, serverToken }
