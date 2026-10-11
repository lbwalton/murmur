// SPDX-License-Identifier: GPL-3.0-only
// Helpers for scripts/ios.js (ios/prd.json IOS-001): murmur's own
// simulator, the tools on PATH, the shared rules copy, and the app's
// SMOKE_RESULT line. Pure where it can be, so desktop CI tests it on
// every platform without Xcode.
const { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } = require('node:fs')
const { delimiter, join } = require('node:path')

const SMOKE_SIMULATOR = 'murmur smoke'
const MIN_IOS = 26

/** Simulator builds sign ad hoc, so CI needs no certificates; the
 *  entitlements (the app group) still ride along in the signature. */
const SIM_SIGNING = ['CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM=', 'PROVISIONING_PROFILE_SPECIFIER=']

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * murmur's own simulator from `xcrun simctl list --json devicetypes
 * runtimes devices`: the device named murmur smoke on an available iOS
 * 26 or later runtime, or a recipe to create one on the newest such
 * runtime. Never another project's simulator, booted or not.
 */
function pickSmokeSimulator(list) {
  const runtimes = list.runtimes.filter(
    (r) => r.isAvailable && r.platform === 'iOS' && Number(String(r.version).split('.')[0]) >= MIN_IOS
  )
  if (runtimes.length === 0) {
    throw new Error(`no iOS ${MIN_IOS} or later simulator runtime is installed (Xcode, Settings, Components)`)
  }
  for (const runtime of runtimes) {
    const found = (list.devices[runtime.identifier] || []).find((d) => d.name === SMOKE_SIMULATOR && d.isAvailable)
    if (found) return { udid: found.udid }
  }
  const newest = [...runtimes].sort((a, b) => compareVersions(b.version, a.version))[0]
  const iphones = (newest.supportedDeviceTypes || list.devicetypes).filter((t) => t.productFamily === 'iPhone')
  // simctl lists the newest iPhone first.
  const type = iphones.find((t) => t.name === 'iPhone 17') || iphones[0]
  if (!type) throw new Error(`iOS ${newest.version} offers no iPhone simulator`)
  return { create: { name: SMOKE_SIMULATOR, deviceType: type.identifier, runtime: newest.identifier } }
}

/** The tool's full path, or null when no PATH directory holds it. */
function findOnPath(name, pathEnv = process.env.PATH, exists = existsSync) {
  for (const dir of (pathEnv || '').split(delimiter)) {
    if (dir && exists(join(dir, name))) return join(dir, name)
  }
  return null
}

/** Mirrors shared/*.json into dest, which starts empty each time. */
function copySharedJson(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const names = readdirSync(src).filter((f) => f.endsWith('.json'))
  for (const name of names) copyFileSync(join(src, name), join(dest, name))
  return names.length
}

/** The app's {"ok", "checks"} result, or null when it never printed one. */
function parseSmokeLine(output) {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('SMOKE_RESULT '))
  return line ? JSON.parse(line.slice('SMOKE_RESULT '.length)) : null
}

module.exports = { SMOKE_SIMULATOR, SIM_SIGNING, compareVersions, pickSmokeSimulator, findOnPath, copySharedJson, parseSmokeLine }
