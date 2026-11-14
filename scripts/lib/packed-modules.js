// SPDX-License-Identifier: GPL-3.0-only
// Every module the packaged app needs at run time, and which of them a
// packed app.asar is missing. A test build of 2026-11-08 was packed from
// a worktree whose node_modules was a link to another checkout's, so
// electron-builder packed only the 3 direct dependencies; uiohook-napi
// could not find node-gyp-build and the app stopped at an error dialog
// before any window opened. scripts/after-pack.js runs this on every
// build, so a build like that fails instead of shipping.
const { existsSync, readFileSync } = require('node:fs')
const { dirname, join, relative, sep } = require('node:path')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

/** Where Node would find `name` from a package at `fromDir`: its own
 *  node_modules first, then each parent's, up to the project root. */
function resolveFrom(root, fromDir, name) {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dir === root) return null
    const up = dirname(dir)
    // Leave a nested node_modules folder whole: a/node_modules/b looks in
    // a/node_modules/b/node_modules, then a/node_modules, then a.
    dir = up.endsWith(`${sep}node_modules`) ? dirname(up) : up
    if (relative(root, dir).startsWith('..')) return null
  }
}

/** The installed path, relative to the root and with forward slashes, of
 *  every package the app's dependencies need, all the way down. A missing
 *  regular dependency throws; a missing optional one is skipped. */
function runtimeModules(root) {
  const found = new Set()
  const visit = (dir) => {
    const pkg = readJson(join(dir, 'package.json'))
    const wanted = [
      ...Object.keys(pkg.dependencies ?? {}).map((name) => ({ name, optional: false })),
      ...Object.keys(pkg.optionalDependencies ?? {}).map((name) => ({ name, optional: true }))
    ]
    for (const { name, optional } of wanted) {
      const at = resolveFrom(root, dir, name)
      if (!at) {
        if (optional) continue
        throw new Error(`${name} (needed by ${pkg.name ?? 'the app'}) is not installed; run npm ci`)
      }
      const key = relative(root, at).split(sep).join('/')
      if (found.has(key)) continue
      found.add(key)
      visit(at)
    }
  }
  visit(root)
  return [...found].sort()
}

/** Where Node could find a package installed at `path` once packed:
 *  that place, or any node_modules above it. electron-builder lays the
 *  asar out its own way (electron-updater's own semver lands at the top),
 *  so the exact npm path is not required. */
function packedPlaces(path) {
  const chain = path.replace(/^node_modules\//, '').split('/node_modules/')
  const name = chain.pop()
  const places = []
  for (let i = chain.length; i >= 0; i--)
    places.push(`node_modules/${[...chain.slice(0, i), name].join('/node_modules/')}`)
  return places
}

/** Which of the needed modules a packed asar lacks, given its file list
 *  (paths like /node_modules/x/package.json, either slash). */
function missingModules(needed, asarEntries) {
  const packed = new Set(asarEntries.map((entry) => entry.split('\\').join('/')))
  return needed.filter((path) => !packedPlaces(path).some((place) => packed.has(`/${place}/package.json`)))
}

module.exports = { missingModules, packedPlaces, resolveFrom, runtimeModules }
