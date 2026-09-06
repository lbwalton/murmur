#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Design lint: raw hex colors may live ONLY in src/renderer/tokens.css.
// Everything else in the renderer consumes tokens, so the night studio
// palette cannot drift one file at a time.
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, relative } = require('node:path')

const root = join(__dirname, '..')
const rendererDir = join(root, 'src', 'renderer')
const TOKENS = join(rendererDir, 'tokens.css')
const HEX = /#[0-9a-fA-F]{3,8}\b/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(css|tsx|ts|html)$/.test(entry)) out.push(full)
  }
  return out
}

const violations = []
for (const file of walk(rendererDir)) {
  if (file === TOKENS) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const matches = line.match(HEX)
    if (matches) violations.push(`${relative(root, file)}:${i + 1}  ${matches.join(' ')}`)
  })
}

if (violations.length > 0) {
  console.error('design lint: raw hex outside tokens.css')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log('design lint: clean, all color flows through tokens.css')
