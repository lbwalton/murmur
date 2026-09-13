// SPDX-License-Identifier: GPL-3.0-only
// murmur Pro licensing. Keys are ed25519 signatures verified OFFLINE
// against the public key in shared/pro.json: no licensing server, no
// phone-home, nothing to outlive the company. A key looks like
// MURMUR-<payload>.<signature> where payload is base64url JSON
// ({ id, at, to? }) and the signature covers the payload bytes. The
// dot separator is deliberate: base64url can contain hyphens, so a
// hyphen there would parse ambiguously.
// Cosmetics stay earned, never bought; Pro is support and convenience.
import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import pro from '../../shared/pro.json'
import { registerSmokeCheck } from './smoke'

export interface LicensePayload {
  id: string
  at: number
  to?: string
  /** Founding member: bought during the founders window; carries a
   *  permanent ten percent discount on future paid products. */
  f?: boolean
}

export type LicenseStatus =
  /** retained: a key is deactivated but still saved on this machine,
   *  one click from coming back. */
  | { pro: false; retained: boolean }
  | { pro: true; since: number; id: string; founder: boolean }

function b64uToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Verify a license key string offline. Pure except for crypto. */
export function verifyLicense(key: string, publicKeyB64: string): LicensePayload | null {
  try {
    const match = /^MURMUR-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key.trim())
    if (!match) return null
    const payloadBuf = b64uToBuf(match[1])
    const sig = b64uToBuf(match[2])
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki'
    })
    if (!cryptoVerify(null, payloadBuf, publicKey, sig)) return null
    const parsed: unknown = JSON.parse(payloadBuf.toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const p = parsed as Record<string, unknown>
    if (typeof p.id !== 'string' || typeof p.at !== 'number') return null
    return {
      id: p.id,
      at: p.at,
      to: typeof p.to === 'string' ? p.to : undefined,
      f: typeof p.f === 'boolean' ? p.f : undefined
    }
  } catch {
    return null
  }
}

function licenseFile(): string {
  return join(app.getPath('userData'), 'license.key')
}

// A deactivated key parks here: still on the machine, out of force.
function retainedFile(): string {
  return join(app.getPath('userData'), 'license.key.off')
}

export function readLicenseStatus(): LicenseStatus {
  try {
    if (!existsSync(licenseFile())) return { pro: false, retained: existsSync(retainedFile()) }
    const key = readFileSync(licenseFile(), 'utf8')
    const payload = verifyLicense(key, pro.publicKey)
    if (!payload) return { pro: false, retained: existsSync(retainedFile()) }
    return { pro: true, since: payload.at, id: payload.id, founder: payload.f === true }
  } catch {
    return { pro: false, retained: false }
  }
}
const readStatus = readLicenseStatus

/**
 * Deactivate Pro but keep the key parked on this machine: previewing
 * the free experience must never mean hunting the key down again. The
 * status read reports whatever the files actually say, so a failed
 * move is loud in logs and honest in the UI.
 */
export function deactivateLicense(): LicenseStatus {
  try {
    if (existsSync(licenseFile())) renameSync(licenseFile(), retainedFile())
  } catch (error) {
    console.error('[murmur] license deactivate failed:', error)
  }
  return readStatus()
}

export function reactivateLicense(): LicenseStatus {
  try {
    if (existsSync(retainedFile())) renameSync(retainedFile(), licenseFile())
  } catch (error) {
    console.error('[murmur] license reactivate failed:', error)
  }
  return readStatus()
}

/** Forget the key entirely, active or parked (handing off a machine). */
export function removeLicense(): LicenseStatus {
  rmSync(licenseFile(), { force: true })
  rmSync(retainedFile(), { force: true })
  return readStatus()
}

export function initLicense(): void {
  ipcMain.handle('license:status', () => readStatus())
  ipcMain.handle('license:buy', async () => {
    // Only ever the configured Payment Link, never an arbitrary URL.
    if (!pro.buyUrl) return
    const { shell } = await import('electron')
    await shell.openExternal(pro.buyUrl)
  })
  ipcMain.handle('license:set', (_event, key: unknown) => {
    if (typeof key !== 'string') return readStatus()
    const payload = verifyLicense(key, pro.publicKey)
    if (!payload) return readStatus()
    writeFileSync(licenseFile(), key.trim())
    // A fresh activation supersedes any parked key; two keys on disk
    // would make the retained state ambiguous.
    rmSync(retainedFile(), { force: true })
    return readStatus()
  })
  ipcMain.handle('license:deactivate', () => deactivateLicense())
  ipcMain.handle('license:reactivate', () => reactivateLicense())
  ipcMain.handle('license:remove', () => removeLicense())

  registerSmokeCheck('licenseSwitch', () => {
    // Pure file mechanics on the hermetic smoke profile: a deactivate
    // round trip preserves the key bytes, remove forgets everything.
    // Key validity is irrelevant here; verification is the status
    // read's job and the real signing key never exists in smoke.
    writeFileSync(licenseFile(), 'MURMUR-probe.notasignature')
    const off = deactivateLicense()
    const offOk = off.pro === false && off.retained === true && !existsSync(licenseFile())
    reactivateLicense()
    const backOk =
      existsSync(licenseFile()) && readFileSync(licenseFile(), 'utf8') === 'MURMUR-probe.notasignature'
    const gone = removeLicense()
    return offOk && backOk && gone.pro === false && gone.retained === false
  })

  registerSmokeCheck('license', () => {
    // A tampered or garbage key must never validate; a status read on
    // a fresh profile must be quietly non-pro. The real signing key is
    // never available here by design.
    const garbage = verifyLicense('MURMUR-aGVsbG8.bm90YXNpZw', pro.publicKey)
    return garbage === null && readStatus().pro === false
  })
}
