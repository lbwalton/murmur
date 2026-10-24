#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// License hygiene: every source file carries the SPDX GPL-3.0-only
// header so the license is unambiguous file by file.
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, relative } = require('node:path')

const root = join(__dirname, '..')
const SPDX = 'SPDX-License-Identifier: GPL-3.0-only'
const ROOTS = ['src', 'scripts', 'site', 'ios']
const EXTENSIONS = /\.(ts|tsx|js|css|swift)$/
// Generated and build output is skipped; ios/Generated carries the
// header anyway because its generator writes one.
const SKIP = new Set(['dist', 'node_modules', 'Generated', 'build', '.build', 'DerivedData'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP.has(entry) && !entry.endsWith('.xcodeproj')) walk(full, out)
    } else if (EXTENSIONS.test(entry)) out.push(full)
  }
  return out
}

const missing = []
for (const base of ROOTS) {
  for (const file of walk(join(root, base))) {
    const head = readFileSync(file, 'utf8').slice(0, 300)
    if (!head.includes(SPDX)) missing.push(relative(root, file))
  }
}

if (missing.length > 0) {
  console.error('missing SPDX headers:')
  for (const f of missing) console.error(`  ${f}`)
  process.exit(1)
}
console.log('headers: every source file declares GPL-3.0-only')
