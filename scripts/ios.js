#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// The iPhone build's one entry point (ios/prd.json IOS-001):
//   node scripts/ios.js generate   colors, icon, shared rules, Xcode project
//   node scripts/ios.js test       MurmurCore on the Mac, then the app's tests on murmur's own simulator
//   node scripts/ios.js smoke      boots the app headless and relays its SMOKE_RESULT
//   node scripts/ios.js pill-shots every stage of the pill, every style, as images in ios/build/pill-shots
//   node scripts/ios.js register   one device build that registers the bundle ids and app group
//   node scripts/ios.js release    archives for the App Store and checks it; --upload sends it to TestFlight
// Only the ios: commands need Xcode; npm install and the desktop gates never do.
const { execFileSync, spawnSync } = require('node:child_process')
const { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { loadBrush } = require('./lib/enso')
const { iosIconSet } = require('./lib/ios-icon')
const { colorSetJson, parseRootTokens, toSwift } = require('./lib/ios-tokens')
const {
  SIM_SIGNING,
  altoolFailure,
  fillJourneyPage,
  journeyScript,
  readDisplayFace,
  buildNumber,
  copySharedJson,
  deviceProblem,
  exportOptionsPlist,
  findOnPath,
  keyFileProblem,
  parsePillShotsLine,
  parseSmokeLine,
  pickSmokeSimulator,
  projectSetting,
  releaseBlocker,
  releaseOptions,
  systemFirstPath,
  uploadArgs
} = require('./lib/ios')

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

/** The Journey's painter page (IOS-018): desktop's brush engine and
 *  Journey painter, bundled by Vite into one script and set into the page
 *  with the tokens, so the app's web view loads one file and nothing else.
 *  The cards' display face (IOS-019), fetched at install like desktop's
 *  and never committed, goes in too, its license beside it; a release
 *  must have it. */
async function buildJourneyPage({ requireFont = false } = {}) {
  const { build } = await import('vite')
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: join(iosDir, 'Web', 'journey.ts'), formats: ['iife'], name: 'murmurJourneyPage', fileName: () => 'journey.js' }
    }
  })
  const script = journeyScript(out)
  const tokens = readFileSync(join(root, 'src', 'renderer', 'tokens.css'), 'utf8')
  const face = readDisplayFace(join(root, 'src', 'renderer', 'public', 'fonts'), { require: requireFont })
  const page = fillJourneyPage(readFileSync(join(iosDir, 'Web', 'journey.html'), 'utf8'), tokens, script, face?.rule ?? '')
  mkdirSync(join(generated, 'web'), { recursive: true })
  writeFileSync(join(generated, 'web', 'journey.html'), page)
  const shipped = join(generated, 'web', 'OFL.txt')
  if (face) copyFileSync(face.license, shipped)
  else rmSync(shipped, { force: true })
}

/** Writes everything the project needs and is never committed, then the
 *  project itself. Returns how many shared rule files were bundled. */
async function generateAll({ requireFont = false } = {}) {
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
  await buildJourneyPage({ requireFont })
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
    // A failing test would otherwise collect simulator diagnostics, which
    // can hang for ten minutes before the failure is reported.
    run('xcodebuild', ['test', ...onSimulator(udid), '-collect-test-diagnostics', 'never'])
  } finally {
    shutdown(udid)
  }
  return 0
}

/** A value from a built bundle's Info.plist, so the ids live only in
 *  project.yml (MURMUR_BUNDLE_ID and MURMUR_APP_GROUP). */
function plistValue(bundle, key) {
  return execFileSync('plutil', ['-extract', key, 'raw', join(bundle, 'Info.plist')], { encoding: 'utf8' }).trim()
}

async function smoke() {
  const count = await generateAll()
  const udid = simulator()
  try {
    run('xcodebuild', ['build', ...onSimulator(udid)])
    const app = join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'murmur.app')
    const bundleId = plistValue(app, 'CFBundleIdentifier')
    run('xcrun', ['simctl', 'install', udid, app])
    spawnSync('xcrun', ['simctl', 'terminate', udid, bundleId], { stdio: 'ignore' })
    // A shared CI runner can take a while to start the painter page's web
    // process the first time (IOS-018).
    const storeKit = join(iosDir, 'murmur.storekit')
    const launched = spawnSync('xcrun', ['simctl', 'launch', '--console', udid, bundleId, '--smoke', `--shared-count=${count}`, `--storekit=${storeKit}`], {
      encoding: 'utf8',
      timeout: 240_000
    })
    const output = `${launched.stdout ?? ''}${launched.stderr ?? ''}`
    const result = parseSmokeLine(output)
    if (!result) {
      console.log(`SMOKE_RESULT ${JSON.stringify({ ok: false, checks: { appBooted: false } })}`)
      console.error('the app never printed SMOKE_RESULT. output follows:')
      console.error(output.slice(-2000))
      return 1
    }
    const lines = output.split(/\r?\n/).map((l) => l.trim())
    const why = lines.filter((l) => /^smoke [A-Za-z]+:/.test(l))
    if (why.length > 0) console.error(why.join('\n'))
    const times = lines.flatMap((l) => /^smoke ([A-Za-z]+) took (\d+) ms$/.exec(l)?.slice(1, 3) ?? []).reduce((all, part, i, parts) => (i % 2 === 0 ? [...all, `${part} ${parts[i + 1]}`] : all), [])
    if (times.length > 0) console.log(`ios: smoke check times in ms: ${times.join(', ')}`)
    console.log(`SMOKE_RESULT ${JSON.stringify(result)}`)
    return result.ok ? 0 : 1
  } finally {
    shutdown(udid)
  }
}

/** Every stage of the pill, every style, as images (IOS-010), like
 *  desktop's ink shots: the app draws them in the simulator, and they land
 *  in ios/build/pill-shots. */
async function pillShots() {
  await generateAll()
  const udid = simulator()
  try {
    run('xcodebuild', ['build', ...onSimulator(udid)])
    const app = join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'murmur.app')
    const bundleId = plistValue(app, 'CFBundleIdentifier')
    run('xcrun', ['simctl', 'install', udid, app])
    spawnSync('xcrun', ['simctl', 'terminate', udid, bundleId], { stdio: 'ignore' })
    const launched = spawnSync('xcrun', ['simctl', 'launch', '--console', udid, bundleId, '--pill-shots'], { encoding: 'utf8', timeout: 120_000 })
    const output = `${launched.stdout ?? ''}${launched.stderr ?? ''}`
    const folder = parsePillShotsLine(output)
    if (!folder) {
      console.error('the app never said where its pill shots are. output follows:')
      console.error(output.slice(-2000))
      return 1
    }
    const out = join(iosDir, 'build', 'pill-shots')
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    const names = readdirSync(folder).filter((name) => name.endsWith('.png'))
    for (const name of names) copyFileSync(join(folder, name), join(out, name))
    console.log(`ios: ${names.length} pill shots in ${out}`)
    return names.length > 0 ? 0 : 1
  } finally {
    shutdown(udid)
  }
}

/** One device build with automatic provisioning: registers both bundle
 *  ids and the app group under the project's team (Eze Media LLC in
 *  murmur's own builds), then proves the profiles
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
  const group = plistValue(app, 'MurmurAppGroup')
  for (const bundle of [app, join(app, 'PlugIns', 'murmurKeyboard.appex')]) {
    const profile = execFileSync('security', ['cms', '-D', '-i', join(bundle, 'embedded.mobileprovision')], { encoding: 'utf8' })
    if (!profile.includes(group)) throw new Error(`${bundle}: its provisioning profile lacks the app group ${group}`)
  }
  console.log(`ios: both bundle ids and ${group} are registered under the project's team`)
  return 0
}

/** TestFlight (IOS-015): archives murmur for the App Store with a build
 *  number from git, exports the signed ipa, and checks it. Nothing is sent
 *  unless --upload is given (only after LaBroi says yes): then Apple
 *  validates the ipa and it is uploaded, all with the App Store Connect API
 *  key from the environment. Signing can use the account signed in to
 *  Xcode with --xcode-account. */
async function release() {
  const options = releaseOptions(process.argv.slice(3), process.env)
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const dirty = git('status', '--porcelain') !== ''
  const blocker = releaseBlocker({ upload: options.upload, dirty, shallow: git('rev-parse', '--is-shallow-repository') === 'true' })
  if (blocker) throw new Error(blocker)
  if (options.upload) {
    const problem = keyFileProblem(APPLE_API_KEY, APPLE_API_KEY_ID) ?? (APPLE_API_ISSUER ? null : 'set APPLE_API_ISSUER to upload')
    if (problem) throw new Error(problem)
  }
  // A release never ships the clean icon in place of the brushed one.
  if (!(await loadBrush().catch(() => null))) throw new Error('a release needs the brushed icon, which needs Node 22.13 or later')
  // A release carries the cards' display face, as desktop's does.
  await generateAll({ requireFont: true })
  const yml = readFileSync(join(iosDir, 'project.yml'), 'utf8')
  const version = projectSetting(yml, 'MARKETING_VERSION')
  const team = projectSetting(yml, 'DEVELOPMENT_TEAM')
  const build = buildNumber(git('rev-list', '--count', 'HEAD'))
  const commit = git('rev-parse', '--short=12', 'HEAD')
  const useKey = !options.xcodeAccount && APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER
  const auth = useKey
    ? ['-authenticationKeyPath', APPLE_API_KEY, '-authenticationKeyID', APPLE_API_KEY_ID, '-authenticationKeyIssuerID', APPLE_API_ISSUER]
    : []
  console.log(`ios: signing with ${useKey ? 'the App Store Connect API key' : 'the account signed in to Xcode'}`)
  if (dirty) console.log('ios: the working tree has uncommitted changes, so this dry run is not exactly a commit')
  const out = join(iosDir, 'build', 'release', `${version}-${build}`)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const archive = join(out, 'murmur.xcarchive')
  console.log(`ios: archiving murmur ${version} (${build}) from commit ${commit}`)
  run('xcodebuild', [
    'archive', '-project', project, '-scheme', 'murmur', '-configuration', 'Release', '-destination', 'generic/platform=iOS',
    '-archivePath', archive, '-derivedDataPath', join(iosDir, 'build', 'ReleaseData'), '-allowProvisioningUpdates', '-quiet',
    `CURRENT_PROJECT_VERSION=${build}`, `MURMUR_COMMIT=${commit}`, ...auth
  ])
  const exportOptions = join(out, 'ExportOptions.plist')
  writeFileSync(exportOptions, exportOptionsPlist(team))
  const exported = join(out, 'export')
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exported, '-exportOptionsPlist', exportOptions, '-allowProvisioningUpdates', '-quiet', ...auth], {
    env: { ...process.env, PATH: systemFirstPath(process.env.PATH) }
  })
  // What goes to Apple is the ipa, so every check reads the unzipped ipa:
  // the app and each of its extensions carry this build, are signed for the
  // App Store (no test devices, no debugging), and are entitled to the app
  // group.
  const ipa = join(exported, 'murmur.ipa')
  const unpacked = join(out, 'unpacked')
  run('unzip', ['-q', ipa, '-d', unpacked])
  const shipped = join(unpacked, 'Payload', 'murmur.app')
  const checks = { CFBundleShortVersionString: version, CFBundleVersion: build, ITSAppUsesNonExemptEncryption: 'false', MurmurCommit: commit }
  for (const [key, want] of Object.entries(checks)) {
    const got = plistValue(shipped, key)
    if (got !== want) throw new Error(`the ipa's ${key} is ${got}, not ${want}`)
  }
  const info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', join(shipped, 'Info.plist')], { encoding: 'utf8' }))
  const devices = deviceProblem(info)
  if (devices) throw new Error(devices)
  const group = plistValue(shipped, 'MurmurAppGroup')
  const plugins = join(shipped, 'PlugIns')
  const extensions = readdirSync(plugins).filter((name) => name.endsWith('.appex')).map((name) => join(plugins, name))
  for (const bundle of [shipped, ...extensions]) {
    if (plistValue(bundle, 'CFBundleVersion') !== build) throw new Error(`${bundle}: carries a different build number`)
    const profile = execFileSync('security', ['cms', '-D', '-i', join(bundle, 'embedded.mobileprovision')], { encoding: 'utf8' })
    if (profile.includes('<key>ProvisionedDevices</key>')) throw new Error(`${bundle}: signed for test devices, not the App Store`)
    const entitlements = signedEntitlements(bundle, out)
    if (!(entitlements['com.apple.security.application-groups'] ?? []).includes(group)) throw new Error(`${bundle}: not entitled to the app group ${group}`)
    if (entitlements['get-task-allow'] !== false) throw new Error(`${bundle}: signed for debugging, not the App Store`)
  }
  console.log(`ios: murmur ${version} (${build}), commit ${commit}, with ${extensions.length} extension${extensions.length === 1 ? "" : "s"}, is checked and ready at ${ipa}`)
  if (!options.upload) {
    console.log('ios: nothing was sent. After LaBroi says yes: npm run ios:release -- --upload')
    return 0
  }
  // altool reads the key file from the folder it is in.
  const env = { ...process.env, API_PRIVATE_KEYS_DIR: dirname(APPLE_API_KEY) }
  const upload = uploadArgs(ipa, APPLE_API_KEY_ID, APPLE_API_ISSUER)
  altool(['altool', '--validate-app', ...upload.slice(2)], env, 'validation')
  altool(upload, env, 'upload')
  console.log(`ios: murmur ${version} (${build}) is uploaded; it shows in TestFlight once App Store Connect has processed it`)
  return 0
}

/** A bundle's signed entitlements as an object. */
function signedEntitlements(bundle, scratch) {
  const file = join(scratch, 'entitlements.plist')
  const xml = execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', bundle], { stdio: ['ignore', 'pipe', 'ignore'] })
  writeFileSync(file, xml)
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }))
}

/** Runs altool, shows what it said, and fails on any failure it reports,
 *  whatever its exit code. */
function altool(args, env, step) {
  const result = spawnSync('xcrun', args, { env, encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)
  const failure = result.error?.message ?? altoolFailure(output) ?? (result.status === 0 ? null : `altool exited ${result.status}`)
  if (failure) throw new Error(`the ${step} failed: ${failure}`)
}

const COMMANDS = {
  generate: async () => {
    await generateAll()
    return 0
  },
  test,
  smoke,
  'pill-shots': pillShots,
  register,
  release
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
