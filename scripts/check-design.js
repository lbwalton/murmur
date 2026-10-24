#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Design lint: raw colors may live ONLY in src/renderer/tokens.css (Swift
// reads them from ios/Generated/Tokens.swift, generated from it).
// Everything else in the renderer and the website (site/, which copies
// tokens.css at build time) consumes tokens, so the night studio palette
// cannot drift one file at a time.
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join, relative } = require('node:path')

const root = join(__dirname, '..')
const rendererDir = join(root, 'src', 'renderer')
const siteDir = join(root, 'site')
const TOKENS = join(rendererDir, 'tokens.css')
const HEX = /#[0-9a-fA-F]{3,8}\b/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'dist' && entry !== 'node_modules') walk(full, out)
    } else if (/\.(css|tsx|ts|html)$/.test(entry)) out.push(full)
  }
  return out
}

const violations = []
for (const file of [...walk(rendererDir), ...walk(siteDir)]) {
  if (file === TOKENS) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const matches = line.match(HEX)
    if (matches) violations.push(`${relative(root, file)}:${i + 1}  ${matches.join(' ')}`)
  })
}

// The iPhone app: no hex, and no hand-built colors, outside the
// generated Tokens.swift (ios/prd.json conventions.design).
const iosDir = join(root, 'ios')
const SWIFT_COLOR = /\b(?:UI|NS|CG)?Color\((?:\.\w+\s*,\s*)?(?:red|white|hue|displayP3Red|gray)\s*:/g
const IOS_SKIP = new Set(['Generated', 'build', '.build', 'DerivedData'])

function walkSwift(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!IOS_SKIP.has(entry) && !entry.endsWith('.xcodeproj')) walkSwift(full, out)
    } else if (entry.endsWith('.swift')) out.push(full)
  }
  return out
}

for (const file of walkSwift(iosDir)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const matches = [...(line.match(HEX) || []), ...(line.match(SWIFT_COLOR) || [])]
      if (matches.length) violations.push(`${relative(root, file)}:${i + 1}  ${matches.join(' ')}`)
    })
}

if (violations.length > 0) {
  console.error('design lint: raw color outside tokens.css')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log('design lint: clean, all color flows through tokens.css')
