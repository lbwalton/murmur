// SPDX-License-Identifier: GPL-3.0-only
import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyLicense } from './license'

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
