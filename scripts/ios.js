#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// The iPhone build's one entry point (ios/prd.json IOS-001):
//   node scripts/ios.js generate   colors, icon, shared rules, Xcode project
// Only the ios: commands need Xcode; npm install and the desktop gates never do.
const { spawnSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadBrush } = require('./lib/enso')
const { iosIconSet } = require('./lib/ios-icon')
const { colorSetJson, parseRootTokens, toSwift } = require('./lib/ios-tokens')
const { copySharedJson, findOnPath } = require('./lib/ios')

const root = join(__dirname, '..')
const iosDir = join(root, 'ios')
const generated = join(iosDir, 'Generated')

/** Runs a command with its output shown; throws on a non-zero exit. */
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${cmd} ${args.slice(0, 2).join(' ')} exited ${result.status}`)
}

function need(tool, hint) {
  if (!findOnPath(tool)) throw new Error(`${tool} is not installed. ${hint}`)
}

/** Writes everything the project needs and is never committed, then the
 *  project itself. Returns how many shared rule files were bundled. */
async function generateAll() {
  need('xcodegen', 'Install it with: brew install xcodegen')
  mkdirSync(generated, { recursive: true })

  const tokens = parseRootTokens(readFileSync(join(root, 'src', 'renderer', 'tokens.css'), 'utf8'))
  writeFileSync(join(generated, 'Tokens.swift'), toSwift(tokens))

  const assets = join(generated, 'Assets.xcassets')
  const iconDir = join(assets, 'AppIcon.appiconset')
  const launchDir = join(assets, 'LaunchInk.colorset')
  mkdirSync(iconDir, { recursive: true })
  mkdirSync(launchDir, { recursive: true })
  writeFileSync(join(assets, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n')
  const brush = await loadBrush().catch(() => null)
  for (const [name, bytes] of Object.entries(iosIconSet(brush))) writeFileSync(join(iconDir, name), bytes)
  const ink = tokens.find((t) => t.name === 'ink')
  if (!ink) throw new Error('tokens.css has no --ink')
  writeFileSync(join(launchDir, 'Contents.json'), colorSetJson(ink.rgba))

  const count = copySharedJson(join(root, 'shared'), join(generated, 'shared'))
  run('xcodegen', ['generate', '--quiet'], { cwd: iosDir })
  console.log(`ios: generated the colors, the ${brush ? 'brushed' : 'clean'} icon, ${count} shared rules, and murmur.xcodeproj`)
  return count
}

const COMMANDS = {
  generate: async () => {
    await generateAll()
    return 0
  }
}

const command = COMMANDS[process.argv[2]]
if (!command) {
  console.error(`usage: node scripts/ios.js ${Object.keys(COMMANDS).join('|')}`)
  process.exit(2)
}
command().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`ios: ${error.message}`)
    process.exit(1)
  }
)
