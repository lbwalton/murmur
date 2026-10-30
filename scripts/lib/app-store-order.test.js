// SPDX-License-Identifier: GPL-3.0-only
import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { issuedFor, orderVerdict, serverToken } from './app-store-order'

const bundleId = 'com.lbwalton.murmur.ios'
const productId = `${bundleId}.pro`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** A signed transaction as Apple sends it; the signature is not read. */
const jws = (payload) => `${b64({ alg: 'ES256', x5c: [] })}.${b64(payload)}.c2ln`
const pro = (extra = {}) =>
  jws({ transactionId: '2000000123', bundleId, productId, purchaseDate: Date.UTC(2026, 10, 2, 15, 30), inAppOwnershipType: 'PURCHASED', ...extra })
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('serverToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const now = 1_792_000_000
  const token = serverToken({ keyPem, keyId: 'ABC123DEF4', issuer: 'issuer-uuid', bundleId, now })
  const [head, body, sig] = token.split('.')

  it("carries Apple's header and claims, expiring in 20 minutes", () => {
    expect(decode(head)).toEqual({ alg: 'ES256', kid: 'ABC123DEF4', typ: 'JWT' })
    expect(decode(body)).toEqual({ iss: 'issuer-uuid', iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: bundleId })
  })

  it('is signed by the key, in the form JWT expects', () => {
    const ok = verify('sha256', Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
    expect(ok).toBe(true)
  })
})

describe('orderVerdict', () => {
  const ids = { bundleId, productId }

  it('confirms an order holding murmur Pro, naming the day it was bought', () => {
    const verdict = orderVerdict({ status: 0, signedTransactions: [pro()] }, ids)
    expect(verdict).toMatchObject({ confirmed: true, purchased: '2026-11-02', transactionId: '2000000123' })
    expect(verdict.reason).toContain('murmur Pro')
  })

  it('finds murmur Pro wherever it sits in the order', () => {
    const other = jws({ transactionId: '1', bundleId, productId: `${bundleId}.tip`, purchaseDate: 1 })
    const elsewhere = jws({ transactionId: '2', bundleId: 'com.example.other', productId: 'com.example.other.pro', purchaseDate: 1 })
    expect(orderVerdict({ status: 0, signedTransactions: [other, elsewhere, pro()] }, ids).confirmed).toBe(true)
  })

  it('turns down a refunded purchase', () => {
    const verdict = orderVerdict({ status: 0, signedTransactions: [pro({ revocationDate: Date.UTC(2026, 10, 5) })] }, ids)
    expect(verdict.confirmed).toBe(false)
    expect(verdict.reason).toContain('refunded')
  })

  it("turns down another app's purchase, even one named like ours", () => {
    const lookalike = jws({ transactionId: '3', bundleId: 'com.example.other', productId, purchaseDate: 1 })
    const verdict = orderVerdict({ status: 0, signedTransactions: [lookalike] }, ids)
    expect(verdict.confirmed).toBe(false)
    expect(verdict.reason).toContain('no murmur Pro')
  })

  it('turns down an order Apple does not know, or one with nothing in it', () => {
    expect(orderVerdict({ status: 1 }, ids)).toMatchObject({ confirmed: false })
    expect(orderVerdict({ status: 1 }, ids).reason).toContain('not an order')
    expect(orderVerdict({ status: 0, signedTransactions: [] }, ids)).toMatchObject({ confirmed: false })
  })

  // Found by the review gate: a free code given to a desktop buyer unlocks
  // Pro here, and must never earn a second desktop key.
  it('turns down Pro unlocked with an offer code, naming the code', () => {
    const coded = pro({ offerType: 3, offerIdentifier: 'founders' })
    const verdict = orderVerdict({ status: 0, signedTransactions: [coded] }, ids)
    expect(verdict.confirmed).toBe(false)
    expect(verdict.reason).toContain('founders')
    expect(verdict.reason).toContain('desktop order')
  })

  it('confirms a paid purchase even when Apple leaves out its date', () => {
    const undated = jws({ transactionId: '7', bundleId, productId })
    expect(() => orderVerdict({ status: 0, signedTransactions: [undated] }, ids)).not.toThrow()
    expect(orderVerdict({ status: 0, signedTransactions: [undated] }, ids).confirmed).toBe(true)
  })

  it('reads past a transaction it cannot decode', () => {
    expect(orderVerdict({ status: 0, signedTransactions: ['not-a-jws', pro()] }, ids).confirmed).toBe(true)
    const verdict = orderVerdict({ status: 0, signedTransactions: ['e30.!!!.c2ln'] }, ids)
    expect(verdict.confirmed).toBe(false)
    expect(verdict.reason).toContain('could not be read')
  })
})

describe('issuedFor', () => {
  const ledger = [
    JSON.stringify({ id: 'cs_live_abc', to: 'a@example.com', founder: true, at: Date.UTC(2026, 8, 30), key: 'MURMUR-x' }),
    'not json',
    JSON.stringify({ id: 'MLYB2C3D4E', to: 'b@example.com', founder: false, at: Date.UTC(2026, 10, 3), key: 'MURMUR-y' })
  ].join('\n')

  it('finds a key already issued for the order, with its day', () => {
    expect(issuedFor(ledger, 'MLYB2C3D4E')).toBe('2026-11-03')
  })

  it('finds nothing for a new order or an empty ledger', () => {
    expect(issuedFor(ledger, 'MLYZZZZZZZ')).toBeNull()
    expect(issuedFor('', 'MLYB2C3D4E')).toBeNull()
  })
})
