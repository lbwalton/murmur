#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Stable download names for a release (US-063).
//
//   npm run release:stable -- check [version]        verify a release (default: latest)
//   npm run release:stable -- publish <version>      upload the stable copies, then verify
//   npm run release:stable -- publish <version> --dry-run
//
// publish copies the files a release already published (the build in
// release/ when it matches GitHub's sha256, otherwise a download from
// the release) to murmur-mac.dmg and murmur-windows.exe and uploads
// them with --clobber. check fails when a copy is missing or differs,
// and when the release is the latest also follows the permanent links.
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { STABLE, checkRelease, sourceFor } = require('./lib/stable-assets')

const REPO = 'lbwalton/murmur'
const root = join(__dirname, '..')

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function release(tag) {
  const args = ['release', 'view', ...(tag ? [tag] : []), '--repo', REPO, '--json', 'tagName,assets']
  const data = JSON.parse(gh(args))
  return {
    tag: data.tagName,
    version: data.tagName.replace(/^v/, ''),
    assets: data.assets.map((a) => ({ name: a.name, digest: a.digest ?? null }))
  }
}

function sha256(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`
}

/** Where a permanent link points (its first redirect, which names the
 *  release tag) and whether the file at the end of the chain answers.
 *  The final address is GitHub's storage host, which never names the
 *  tag, so the tag is read from the first hop. */
function follow(url) {
  const curl = (args) => execFileSync('curl', args, { encoding: 'utf8' }).trim()
  const first = curl(['-sI', '-o', '/dev/null', '-w', '%{redirect_url}', url])
  const status = Number(curl(['-sIL', '-o', '/dev/null', '-w', '%{http_code}', url]))
  return { status, points: first }
}

function check(version) {
  const rel = release(version ? `v${version}` : undefined)
  const latest = !version || release().tag === rel.tag
  const problems = checkRelease(rel.version, rel.assets)
  if (latest) {
    for (const stable of Object.values(STABLE)) {
      const url = `https://github.com/${REPO}/releases/latest/download/${stable}`
      const { status, points } = follow(url)
      if (!points.endsWith(`/download/${rel.tag}/${stable}`) || status !== 200) {
        problems.push(`${url} points at ${points || '(nowhere)'} and answers ${status}, not the ${rel.tag} file`)
      }
    }
  }
  if (problems.length > 0) {
    console.error(`stable assets for ${rel.tag}: ${problems.length} problem(s)`)
    for (const p of problems) console.error(`  ${p}`)
    return false
  }
  console.log(`stable assets for ${rel.tag}: murmur-mac.dmg and murmur-windows.exe match${latest ? ', and both permanent links serve them' : ''}`)
  return true
}

/** The shipped bytes of a release file: the local build when it is the
 *  exact file the release published, otherwise a fresh download from
 *  the release itself. Either way the digest must match. */
function shipped(rel, source, staging) {
  const published = rel.assets.find((a) => a.name === source).digest
  if (!published) throw new Error(`${rel.tag} reports no digest for ${source}; cannot prove a copy is identical`)
  const local = join(root, 'release', source)
  if (existsSync(local) && sha256(local) === published) return local
  console.log(`${source}: downloading the published file from ${rel.tag}`)
  gh(['release', 'download', rel.tag, '--pattern', source, '--dir', staging, '--clobber', '--repo', REPO])
  const fetched = join(staging, source)
  if (sha256(fetched) !== published) throw new Error(`${source} downloaded from ${rel.tag} does not match its digest`)
  return fetched
}

function publish(version, dryRun) {
  const rel = release(`v${version}`)
  const names = rel.assets.map((a) => a.name)
  const staging = join(tmpdir(), `murmur-stable-${version}`)
  mkdirSync(staging, { recursive: true })
  try {
    const uploads = []
    for (const [platform, stable] of Object.entries(STABLE)) {
      const source = sourceFor(platform, version, names)
      if (!source) throw new Error(`${rel.tag} has no ${platform} file to copy; publish the release assets first`)
      const copy = join(staging, stable)
      copyFileSync(shipped(rel, source, staging), copy)
      uploads.push(copy)
      console.log(`${stable} <- ${source}`)
    }
    if (dryRun) {
      console.log(`dry run: would upload ${uploads.length} files to ${rel.tag}`)
      return true
    }
    gh(['release', 'upload', rel.tag, ...uploads, '--clobber', '--repo', REPO])
    return check(version)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function main() {
  const [command, version, flag] = process.argv.slice(2)
  if (command === 'check') return check(version)
  if (command === 'publish' && version) return publish(version, flag === '--dry-run')
  console.error('usage: stable-assets check [version] | publish <version> [--dry-run]')
  return false
}

try {
  process.exit(main() ? 0 : 1)
} catch (error) {
  console.error(`stable assets: ${error.message}`)
  process.exit(1)
}
