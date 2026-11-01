// SPDX-License-Identifier: GPL-3.0-only
// What security scanners grade on murmurapp.app, held so a change to
// headers.js or the build cannot quietly undo it (US-118).
import { describe, expect, it } from 'vitest'
import { HEADERS, SECURITY_HEADERS, headersFile } from './headers'
import { SECURITY_CONTACT, VALID_DAYS, securityTxt } from './security-txt'

const header = (name) => HEADERS.find(([key]) => key === name)?.[1]

describe('security headers', () => {
  it('sends the six graded headers plus COOP on every path', () => {
    expect(SECURITY_HEADERS.map(([name]) => name)).toEqual([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy'
    ])
    const file = headersFile()
    expect(file.startsWith('/*\n')).toBe(true)
    for (const [name, value] of HEADERS) expect(file).toContain(`  ${name}: ${value}\n`)
  })

  it('never lets inline or eval code run', () => {
    const csp = header('Content-Security-Policy')
    expect(csp).not.toContain("'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  // Scanners grade these; the .app ending is preloaded either way (site/README.md, Security).
  it('keeps HSTS preload-ready', () => {
    const hsts = header('Strict-Transport-Security')
    expect(Number(hsts.match(/max-age=(\d+)/)[1])).toBeGreaterThanOrEqual(31536000)
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
  })

  it('lets browser-based scanners read every security header', () => {
    const exposed = header('Access-Control-Expose-Headers').split(', ')
    expect(exposed).toEqual(SECURITY_HEADERS.map(([name]) => name))
  })
})

describe('security.txt', () => {
  const now = new Date('2026-10-31T12:00:00Z')
  const text = securityTxt('https://murmurapp.app', now)

  it('names the security inbox and its own canonical address', () => {
    expect(text).toContain(`Contact: ${SECURITY_CONTACT}\n`)
    expect(SECURITY_CONTACT).toBe('mailto:security@murmurapp.app')
    expect(text).toContain('Canonical: https://murmurapp.app/.well-known/security.txt\n')
  })

  // RFC 9116 asks for an Expires under a year away; each build renews it.
  it('expires just under a year after the build', () => {
    const expires = Date.parse(text.match(/^Expires: (.+)$/m)[1])
    expect((expires - now.getTime()) / 86_400_000).toBe(VALID_DAYS)
    expect(VALID_DAYS).toBeLessThan(365)
  })
})
