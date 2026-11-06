// SPDX-License-Identifier: GPL-3.0-only
// The one fetch the main process uses. Requests ride Chromium's network
// stack (Electron net.fetch), never Node's: Chromium trusts the
// operating system's certificates and follows its proxy and PAC
// settings, the way the browser and the updater already do. A work
// network that inspects secure traffic re-signs every connection with
// its own root certificate (Zscaler and the like); Node's fetch carries
// its own certificate list, refused every such connection, and logged
// only fetch failed (US-109, live-found 2026-10-19). Cookies and the
// HTTP cache stay off, as they always were under Node's fetch, so a
// connection test always asks the server. Outside Electron (unit
// tests), Node's fetch stands in.
import { blockedPlainHttp } from '../shared/plain-http'

let trustedHttpHosts: () => readonly string[] = () => []

/** Where appFetch reads the plain http hosts the person confirmed. */
export function readTrustedHttpHostsFrom(read: () => readonly string[]): void {
  trustedHttpHosts = read
}

export const appFetch: typeof fetch = async (input, init) => {
  // No key and no voice go over plain http until the person says so
  // (US-140). Every provider request passes here, whichever field the
  // address came from.
  const url = input instanceof Request ? input.url : String(input)
  const held = blockedPlainHttp(url, trustedHttpHosts())
  if (held !== null) throw new Error(`plain http to ${held} is not confirmed`)
  if (process.versions.electron) {
    const { app, net } = await import('electron')
    await app.whenReady()
    return net.fetch(input instanceof URL ? input.href : input, { credentials: 'omit', cache: 'no-store', ...init })
  }
  return fetch(input, init)
}
