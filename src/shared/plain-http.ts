// SPDX-License-Identifier: GPL-3.0-only
// Plain http sends a key and a voice in the open, so a typed base URL
// that uses it has to be confirmed, and until it is, nothing is sent
// (US-140). This machine is the 1 exception: traffic to it never leaves.

// 0.0.0.0 is what local servers print, and it reaches this machine.
const LOOPBACK = /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1)$/
const PRIVATE =
  /^(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|f[cd][0-9a-f]{2}:.*|fe80:.*|[^.:]+|.+\.local|.+\.lan|.+\.home\.arpa)$/

function parsed(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

const hostOf = (url: URL): string => url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

/** The host a person must confirm before anything goes to this URL, or
 *  null when it needs no confirmation: https, this machine, or not a URL. */
export function plainHttpHost(url: string): string | null {
  const target = parsed(url.trim())
  if (target === null || target.protocol !== 'http:') return null
  const host = hostOf(target)
  return LOOPBACK.test(host) ? null : host
}

/** A home or office network, as opposed to the open internet. */
export function isPrivateHost(host: string): boolean {
  return PRIVATE.test(host)
}

/** Whether a request to this URL has to wait for a confirmation. */
export function blockedPlainHttp(url: string, trustedHosts: readonly string[]): string | null {
  const host = plainHttpHost(url)
  return host !== null && !trustedHosts.includes(host) ? host : null
}
