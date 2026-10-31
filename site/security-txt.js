// SPDX-License-Identifier: GPL-3.0-only
// security.txt (RFC 9116, US-117): where to report a security problem
// in murmur or this site. Reports go to murmur's own address,
// security@murmurapp.app (LaBroi, 2026-10-31). Expires is 364 days
// after the build, so every deploy renews it; deploy again within 364
// days or it lapses.
const SECURITY_CONTACT = 'mailto:security@murmurapp.app'
const VALID_DAYS = 364

function securityTxt(siteUrl, now = new Date()) {
  const expires = new Date(now.getTime() + VALID_DAYS * 86_400_000)
  return [
    '# Security contact for murmur (RFC 9116).',
    '# Found a vulnerability in murmur or this site? Email us.',
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en',
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    ''
  ].join('\n')
}

module.exports = { SECURITY_CONTACT, VALID_DAYS, securityTxt }
