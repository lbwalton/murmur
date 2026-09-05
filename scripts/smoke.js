#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Placeholder until US-004 lands the real headless harness. For now it
// verifies the build artifacts exist so the smoke script is never a no-op.
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const artifacts = [
  'out/main/index.js',
  'out/preload/settings.js',
  'out/preload/overlay.js',
  'out/renderer/settings/index.html',
  'out/renderer/overlay/index.html'
]

const checks = {}
for (const rel of artifacts) checks[rel] = existsSync(join(root, rel))
const ok = Object.values(checks).every(Boolean)

console.log('SMOKE_RESULT ' + JSON.stringify({ ok, checks: { buildArtifacts: ok } }))
if (!ok) {
  console.error('missing artifacts:', Object.keys(checks).filter((k) => !checks[k]))
}
process.exit(ok ? 0 : 1)
