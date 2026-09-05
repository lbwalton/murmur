#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Boots the built app headlessly in smoke mode, relays its SMOKE_RESULT
// line, and exits with the app's exit code. Needs no mic, network, or key.
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
// Required by node: importing the electron package from plain Node returns
// the path to the Electron binary.
const electronPath = require('electron')

const artifacts = [
  'out/main/index.js',
  'out/preload/settings.js',
  'out/preload/overlay.js',
  'out/renderer/settings/index.html',
  'out/renderer/overlay/index.html'
]
const missing = artifacts.filter((rel) => !existsSync(join(root, rel)))
if (missing.length > 0) {
  console.log(`SMOKE_RESULT ${JSON.stringify({ ok: false, checks: { buildArtifacts: false } })}`)
  console.error('missing artifacts:', missing)
  process.exit(1)
}

const child = spawn(electronPath, ['.'], {
  cwd: root,
  env: { ...process.env, MURMUR_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
child.stdout.on('data', (d) => {
  output += d.toString()
})
child.stderr.on('data', (d) => {
  output += d.toString()
})

const killTimer = setTimeout(() => {
  console.error('smoke timed out after 60s')
  child.kill('SIGKILL')
}, 60_000)

child.on('close', (code) => {
  clearTimeout(killTimer)
  const line = output.split('\n').find((l) => l.startsWith('SMOKE_RESULT '))
  if (!line) {
    console.log(`SMOKE_RESULT ${JSON.stringify({ ok: false, checks: { appBooted: false } })}`)
    console.error('app never printed SMOKE_RESULT. output follows:')
    console.error(output.slice(-2000))
    process.exit(1)
  }
  console.log(line)
  process.exit(code === 0 ? 0 : 1)
})
