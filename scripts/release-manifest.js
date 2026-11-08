#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Writes release/SHA256SUMS and release/murmur-<version>.cdx.json from
// the build in release/, before the release is published (US-142).
//
//   npm run release:manifest -- <version>
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFileSync, readdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { installerNames, shippedSbom, sumsFile } = require('./lib/release-manifest')

const root = join(__dirname, '..')
const dir = join(root, 'release')
const version = process.argv[2]
if (!version) throw new Error('usage: npm run release:manifest -- <version>')

const installers = installerNames(readdirSync(dir)).filter((name) => name.includes(version))
if (installers.length === 0) throw new Error(`no installers for ${version} in release/`)

const hashes = Object.fromEntries(
  installers.map((name) => [name, createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')])
)
writeFileSync(join(dir, 'SHA256SUMS'), sumsFile(version, hashes))

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const full = JSON.parse(
  execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--package-lock-only'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 1 << 27,
    // npm is npm.cmd on Windows, which Node only runs through a shell.
    shell: process.platform === 'win32'
  })
)
const sbom = shippedSbom(full, Object.keys(pkg.dependencies))
writeFileSync(join(dir, `murmur-${version}.cdx.json`), `${JSON.stringify(sbom, null, 2)}\n`)
console.log(`release/SHA256SUMS: ${installers.length} installers; parts list: ${sbom.components.length} packages`)
