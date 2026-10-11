#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// The iPhone build's one entry point (ios/prd.json IOS-001):
//   node scripts/ios.js generate   colors, icon, shared rules, Xcode project
//   node scripts/ios.js test       MurmurCore on the Mac, then the app's tests on murmur's own simulator
//   node scripts/ios.js smoke      boots the app headless and relays its SMOKE_RESULT
//   node scripts/ios.js register   one device build that registers the bundle ids and app group
// Only the ios: commands need Xcode; npm install and the desktop gates never do.
const { execFileSync, spawnSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { loadBrush } = require('./lib/enso')
const { iosIconSet } = require('./lib/ios-icon')
const { colorSetJson, parseRootTokens, toSwift } = require('./lib/ios-tokens')
const { SIM_SIGNING, copySharedJson, findOnPath, parseSmokeLine, pickSmokeSimulator } = require('./lib/ios')

const root = join(__dirname, '..')
const iosDir = join(root, 'ios')
const generated = join(iosDir, 'Generated')
const project = join(iosDir, 'murmur.xcodeproj')
const derived = join(iosDir, 'build', 'DerivedData')

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

/** murmur's own simulator, created the first time, booted and ready. */
function simulator() {
  const list = JSON.parse(execFileSync('xcrun', ['simctl', 'list', '--json', 'devicetypes', 'runtimes', 'devices'], { encoding: 'utf8' }))
  const pick = pickSmokeSimulator(list)
  const udid =
    pick.udid ?? execFileSync('xcrun', ['simctl', 'create', pick.create.name, pick.create.deviceType, pick.create.runtime], { encoding: 'utf8' }).trim()
  run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'ignore' })
  return udid
}

/** Shuts down murmur's simulator only; other simulators are left alone. */
function shutdown(udid) {
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' })
}

const onSimulator = (udid) => ['-project', project, '-scheme', 'murmur', '-destination', `platform=iOS Simulator,id=${udid}`, '-derivedDataPath', derived, '-quiet', ...SIM_SIGNING]

async function test() {
  await generateAll()
  run('swift', ['test', '--package-path', join(iosDir, 'MurmurCore')])
  const udid = simulator()
  try {
    run('xcodebuild', ['test', ...onSimulator(udid)])
  } finally {
    shutdown(udid)
  }
  return 0
}

const BUNDLE_ID = 'com.lbwalton.murmur.ios'

async function smoke() {
  const count = await generateAll()
  const udid = simulator()
  try {
    run('xcodebuild', ['build', ...onSimulator(udid)])
    run('xcrun', ['simctl', 'install', udid, join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'murmur.app')])
    spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { stdio: 'ignore' })
    const launched = spawnSync('xcrun', ['simctl', 'launch', '--console', udid, BUNDLE_ID, '--smoke', `--shared-count=${count}`], {
      encoding: 'utf8',
      timeout: 120_000
    })
    const output = `${launched.stdout ?? ''}${launched.stderr ?? ''}`
    const result = parseSmokeLine(output)
    if (!result) {
      console.log(`SMOKE_RESULT ${JSON.stringify({ ok: false, checks: { appBooted: false } })}`)
      console.error('the app never printed SMOKE_RESULT. output follows:')
      console.error(output.slice(-2000))
      return 1
    }
    const why = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^smoke [A-Za-z]+:/.test(l))
    if (why.length > 0) console.error(why.join('\n'))
    console.log(`SMOKE_RESULT ${JSON.stringify(result)}`)
    return result.ok ? 0 : 1
  } finally {
    shutdown(udid)
  }
}

/** One device build with automatic provisioning: registers both bundle
 *  ids and the app group under Eze Media LLC, then proves the profiles
 *  carry the group. Uses the App Store Connect API key from the
 *  environment, or the account signed in to Xcode with --xcode-account. */
async function register() {
  await generateAll()
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env
  const useKey = !process.argv.includes('--xcode-account') && APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER
  const auth = useKey
    ? ['-authenticationKeyPath', APPLE_API_KEY, '-authenticationKeyID', APPLE_API_KEY_ID, '-authenticationKeyIssuerID', APPLE_API_ISSUER]
    : []
  console.log(`ios: registering with ${useKey ? 'the App Store Connect API key' : 'the account signed in to Xcode'}`)
  run('xcodebuild', ['build', '-project', project, '-scheme', 'murmur', '-destination', 'generic/platform=iOS', '-derivedDataPath', derived, '-allowProvisioningUpdates', '-quiet', ...auth])
  const app = join(derived, 'Build', 'Products', 'Debug-iphoneos', 'murmur.app')
  for (const bundle of [app, join(app, 'PlugIns', 'murmurKeyboard.appex')]) {
    const profile = execFileSync('security', ['cms', '-D', '-i', join(bundle, 'embedded.mobileprovision')], { encoding: 'utf8' })
    if (!profile.includes('group.com.lbwalton.murmur')) throw new Error(`${bundle}: its provisioning profile lacks the app group`)
  }
  console.log('ios: both bundle ids and the app group are registered under Eze Media LLC')
  return 0
}

const COMMANDS = {
  generate: async () => {
    await generateAll()
    return 0
  },
  test,
  smoke,
  register
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
