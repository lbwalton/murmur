// SPDX-License-Identifier: GPL-3.0-only
import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkoutUrl, verifyLicense } from './license'
import pro from '../../shared/pro.json'

function b64u(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// An ephemeral keypair per run: the real signing key never enters tests.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUB = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

function issue(payload: object): string {
  const buf = Buffer.from(JSON.stringify(payload))
  const sig = sign(null, buf, privateKey)
  return `MURMUR-${b64u(buf)}.${b64u(sig)}`
}

describe('verifyLicense', () => {
  it('accepts a properly signed key and returns its payload', () => {
    const key = issue({ id: 'ord_123', at: 1757300000000, to: 'buyer@example.com' })
    const payload = verifyLicense(key, PUB)
    expect(payload).toEqual({ id: 'ord_123', at: 1757300000000, to: 'buyer@example.com' })
  })

  it('tolerates surrounding whitespace from a copy and paste', () => {
    const key = issue({ id: 'ord_ws', at: 1 })
    expect(verifyLicense(`  ${key}\n`, PUB)?.id).toBe('ord_ws')
  })

  it('rejects a tampered payload', () => {
    const key = issue({ id: 'ord_real', at: 1 })
    const sig = key.split('.')[1]
    const forged = `MURMUR-${b64u(Buffer.from(JSON.stringify({ id: 'ord_fake', at: 1 })))}.${sig}`
    expect(verifyLicense(forged, PUB)).toBeNull()
  })

  it('rejects a key signed by a different keypair', () => {
    const other = generateKeyPairSync('ed25519')
    const buf = Buffer.from(JSON.stringify({ id: 'ord_evil', at: 1 }))
    const sig = sign(null, buf, other.privateKey)
    expect(verifyLicense(`MURMUR-${b64u(buf)}.${b64u(sig)}`, PUB)).toBeNull()
  })

  it('rejects malformed keys without throwing', () => {
    for (const junk of ['', 'MURMUR', 'MURMUR-abc', 'MURMUR-abc-def', 'MURMUR-!!!.###', 'not a key at all']) {
      expect(verifyLicense(junk, PUB)).toBeNull()
    }
  })

  it('carries the founding member flag through verification', () => {
    const payload = verifyLicense(issue({ id: 'ord_f', at: 5, f: true }), PUB)
    expect(payload?.f).toBe(true)
    const plain = verifyLicense(issue({ id: 'ord_p', at: 5 }), PUB)
    expect(plain?.f).toBeUndefined()
  })

  it('rejects a signed payload missing required fields', () => {
    expect(verifyLicense(issue({ to: 'x@example.com' }), PUB)).toBeNull()
  })
})

describe('checkoutUrl (US-172)', () => {
  const closes = Date.parse(pro.founders.closes)

  it('closes at midnight Pacific at the end of December 31, 2026', () => {
    expect(closes).toBe(Date.parse('2027-01-01T00:00:00-08:00'))
  })

  it('fills in the FOUNDERS code on the configured Payment Link while the founders window is open', () => {
    expect(checkoutUrl(Date.parse('2026-11-16T12:00:00-08:00'))).toBe(`${pro.buyUrl}?prefilled_promo_code=FOUNDERS`)
    expect(checkoutUrl(closes - 1)).toBe(`${pro.buyUrl}?prefilled_promo_code=FOUNDERS`)
  })

  it('opens the plain Payment Link once the window closes', () => {
    expect(checkoutUrl(closes)).toBe(pro.buyUrl)
    expect(checkoutUrl(Date.parse('2027-06-01T00:00:00Z'))).toBe(pro.buyUrl)
  })
})
