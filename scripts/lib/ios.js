// SPDX-License-Identifier: GPL-3.0-only
// Helpers for scripts/ios.js (ios/prd.json IOS-001): murmur's own
// simulator, the tools on PATH, the shared rules copy, and the app's
// SMOKE_RESULT line. Pure where it can be, so desktop CI tests it on
// every platform without Xcode.
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } = require('node:fs')
const { basename, delimiter, join } = require('node:path')
const { DISPLAY_FACE_FILE, isWholeWoff2 } = require('./display-face')

const SMOKE_SIMULATOR = 'murmur smoke'
const MIN_IOS = 26

/** Simulator builds sign ad hoc, so CI needs no certificates; the
 *  entitlements (the app group) still ride along in the signature. */
const SIM_SIGNING = ['CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=-', 'DEVELOPMENT_TEAM=', 'PROVISIONING_PROFILE_SPECIFIER=']

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * murmur's own simulator from `xcrun simctl list --json devicetypes
 * runtimes devices`: the device named murmur smoke on an available iOS
 * 26 or later runtime, or a recipe to create one on the newest such
 * runtime. Never another project's simulator, booted or not.
 */
function pickSmokeSimulator(list) {
  const runtimes = list.runtimes.filter(
    (r) => r.isAvailable && r.platform === 'iOS' && Number(String(r.version).split('.')[0]) >= MIN_IOS
  )
  if (runtimes.length === 0) {
    throw new Error(`no iOS ${MIN_IOS} or later simulator runtime is installed (Xcode, Settings, Components)`)
  }
  for (const runtime of runtimes) {
    const found = (list.devices[runtime.identifier] || []).find((d) => d.name === SMOKE_SIMULATOR && d.isAvailable)
    if (found) return { udid: found.udid }
  }
  const newest = [...runtimes].sort((a, b) => compareVersions(b.version, a.version))[0]
  const iphones = (newest.supportedDeviceTypes || list.devicetypes).filter((t) => t.productFamily === 'iPhone')
  // simctl lists the newest iPhone first.
  const type = iphones.find((t) => t.name === 'iPhone 17') || iphones[0]
  if (!type) throw new Error(`iOS ${newest.version} offers no iPhone simulator`)
  return { create: { name: SMOKE_SIMULATOR, deviceType: type.identifier, runtime: newest.identifier } }
}

/** The tool's full path, or null when no PATH directory holds it. */
function findOnPath(name, pathEnv = process.env.PATH, exists = existsSync) {
  for (const dir of (pathEnv || '').split(delimiter)) {
    if (dir && exists(join(dir, name))) return join(dir, name)
  }
  return null
}

/** Mirrors shared/*.json into dest, which starts empty each time. */
function copySharedJson(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const names = readdirSync(src).filter((f) => f.endsWith('.json'))
  for (const name of names) copyFileSync(join(src, name), join(dest, name))
  return names.length
}

/** The app's {"ok", "checks"} result, or null when it never printed one. */
function parseSmokeLine(output) {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('SMOKE_RESULT '))
  return line ? JSON.parse(line.slice('SMOKE_RESULT '.length)) : null
}

/** The folder the app saved its pill shots in (IOS-010), or null when it
 *  never said. */
function parsePillShotsLine(output) {
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('PILL_SHOTS '))
  return line ? line.slice('PILL_SHOTS '.length) : null
}

/** A setting's value in project.yml, such as MARKETING_VERSION. */
function projectSetting(projectYml, name) {
  const match = projectYml.match(new RegExp(`^\\s*${name}:\\s*"?([^"\\s]+)"?\\s*$`, 'm'))
  if (!match) throw new Error(`project.yml has no ${name}`)
  return match[1]
}

/** The build number for App Store Connect (IOS-015): the count of commits
 *  behind the build, which only grows, so every upload has a new one. */
function buildNumber(countText) {
  const count = Number.parseInt(String(countText).trim(), 10)
  if (!Number.isInteger(count) || count < 1 || String(count) !== String(countText).trim()) {
    throw new Error(`not a commit count: ${String(countText).trim()}`)
  }
  return String(count)
}

/** Export options for an App Store Connect build signed by the team. */
function exportOptionsPlist(teamId) {
  if (!/^[A-Z0-9]{10}$/.test(teamId)) throw new Error(`not a team id: ${teamId}`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>method</key>',
    '  <string>app-store-connect</string>',
    '  <key>destination</key>',
    '  <string>export</string>',
    '  <key>teamID</key>',
    `  <string>${teamId}</string>`,
    '  <key>signingStyle</key>',
    '  <string>automatic</string>',
    '  <key>uploadSymbols</key>',
    '  <true/>',
    '  <key>manageAppVersionAndBuildNumber</key>',
    '  <false/>',
    '</dict>',
    '</plist>',
    ''
  ].join('\n')
}

const SYSTEM_PATHS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin']

/** PATH with the system's own tools first: Homebrew's rsync breaks the
 *  copy step of xcodebuild -exportArchive. */
function systemFirstPath(pathEnv = '') {
  const rest = pathEnv.split(delimiter).filter((entry) => entry && !SYSTEM_PATHS.includes(entry))
  return [...SYSTEM_PATHS, ...rest].join(delimiter)
}

/** xcrun's arguments to upload an ipa with an App Store Connect API key:
 *  the key's id and issuer only, as altool reads the key file itself, and
 *  JSON out, so a failure can be read from what altool says. */
function uploadArgs(ipa, keyId, issuer) {
  if (!keyId || !issuer) throw new Error('uploading needs APPLE_API_KEY_ID and APPLE_API_ISSUER')
  return ['altool', '--upload-app', '-f', ipa, '-t', 'ios', '--apiKey', keyId, '--apiIssuer', issuer, '--output-format', 'json']
}

const RELEASE_FLAGS = { '--upload': 'upload', '--xcode-account': 'xcodeAccount' }

/** The release's options. Uploading is opt in (--upload), so a mistyped or
 *  swallowed flag can only ever mean a dry run; npm keeps flags given
 *  without -- for itself, which stops the run instead. */
function releaseOptions(args, env) {
  for (const name of ['npm_config_upload', 'npm_config_no_upload', 'npm_config_xcode_account']) {
    if (env[name] !== undefined) {
      throw new Error('npm kept a flag meant for the release: put -- before it, as in npm run ios:release -- --upload')
    }
  }
  const options = { upload: false, xcodeAccount: false }
  for (const arg of args) {
    const key = RELEASE_FLAGS[arg]
    if (!key) throw new Error(`unknown option ${arg}: the release takes --upload and --xcode-account`)
    options[key] = true
  }
  return options
}

/** Why an upload must not go ahead, or null: the build number is the
 *  commit count, so what goes up must be exactly a commit, counted in a
 *  full clone. A dry run is never blocked. */
function releaseBlocker({ upload, dirty, shallow }) {
  if (!upload) return null
  if (dirty) return 'the working tree has uncommitted changes: commit them first, so the build number names the code that ships'
  if (shallow) return 'this is a shallow clone, whose commit count is not the real build number: fetch the full history first'
  return null
}

/** What altool said went wrong, or null. Newer altool can exit 0 after a
 *  failed upload, so its JSON (product-errors) and its error lines are
 *  read too. */
function altoolFailure(output) {
  for (const line of output.split(/\r?\n/)) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      const errors = JSON.parse(text)['product-errors']
      if (Array.isArray(errors) && errors.length > 0) return String(errors[0].message ?? JSON.stringify(errors[0]))
    } catch {
      // Not the JSON answer; the lines below still get read.
    }
  }
  const error = output.split(/\r?\n/).find((line) => /(\*\*\* Error:|^\s*ERROR:|UPLOAD FAILED|Validation failed)/i.test(line))
  return error ? error.trim() : null
}

const ALL_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight'
]

/** Why Apple would refuse the app's devices, or null, from its Info.plist:
 *  an app that runs on iPad must turn every way there, for multitasking
 *  (App Store Connect error 90474, met on the first upload, 2026-10-14). */
function deviceProblem(info) {
  if (!(info.UIDeviceFamily ?? []).includes(2)) return null
  const turns = info['UISupportedInterfaceOrientations~ipad'] ?? info.UISupportedInterfaceOrientations ?? []
  const missing = ALL_ORIENTATIONS.filter((o) => !turns.includes(o))
  return missing.length === 0 ? null : `the app runs on iPad but does not turn every way there (missing ${missing.join(', ')}); Apple refuses that`
}

/** Why altool would not find the key file, or null: it looks for
 *  AuthKey_<id>.p8 in its own folders or API_PRIVATE_KEYS_DIR. */
function keyFileProblem(keyPath, keyId) {
  if (!keyPath) return 'set APPLE_API_KEY to the path of the App Store Connect key file'
  const want = `AuthKey_${keyId}.p8`
  return basename(keyPath) === want ? null : `the key file must be named ${want} for altool to find it`
}

/** The bundled script from Vite's build result: one chunk, as a string. */
function journeyScript(result) {
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output ?? [])
  const chunk = outputs.find((o) => o.type === 'chunk')
  if (!chunk || !chunk.code) throw new Error('the Journey page built no script')
  return chunk.code
}

/** The page with the tokens, the display face's rule (empty without it),
 *  and the script set in. A script that could close its own tag, or a
 *  page missing a mark, stops the build. */
function fillJourneyPage(template, tokens, script, font = '') {
  for (const mark of ['/*TOKENS*/', '/*FONT*/', '/*SCRIPT*/']) {
    if (template.split(mark).length !== 2) throw new Error(`the Journey page needs exactly one ${mark}`)
  }
  if (/<\/script/i.test(script)) throw new Error('the Journey script contains a closing script tag')
  return template.replace('/*TOKENS*/', () => tokens).replace('/*FONT*/', () => font).replace('/*SCRIPT*/', () => script)
}

/**
 * The display face for the page (IOS-019): its rule and its license file,
 * or null when the face is missing or not a whole woff2 (the cards then
 * set their titles in a condensed system face). A release requires it.
 */
function readDisplayFace(fonts, { require: needed = false } = {}) {
  const face = join(fonts, DISPLAY_FACE_FILE)
  const license = join(fonts, 'OFL.txt')
  const bytes = existsSync(face) && existsSync(license) ? readFileSync(face) : null
  if (bytes && isWholeWoff2(bytes)) return { rule: displayFaceRule(bytes), license }
  if (needed) throw new Error('the display face is missing or broken: run node scripts/fetch-display-face.js --require')
  return null
}

/** The display face's @font-face rule (IOS-019), the woff2 inlined, so the
 *  page loads no file for it: the family, the weight, and the condensed
 *  widths desktop fetches. */
function displayFaceRule(woff2) {
  // Desktop sets its card titles condensed (75%) with the canvas's
  // fontStretch, which WebKit's canvas lacks; registered at 75% alone, the
  // face is set at desktop's width there too (IOS-021).
  return `@font-face { font-family: "murmur display"; src: url(data:font/woff2;base64,${woff2.toString('base64')}) format("woff2"); font-weight: 800; font-stretch: 75%; font-display: block; }`
}

module.exports = {
  SMOKE_SIMULATOR,
  SIM_SIGNING,
  compareVersions,
  pickSmokeSimulator,
  findOnPath,
  copySharedJson,
  parseSmokeLine,
  parsePillShotsLine,
  projectSetting,
  buildNumber,
  exportOptionsPlist,
  systemFirstPath,
  uploadArgs,
  releaseOptions,
  releaseBlocker,
  altoolFailure,
  deviceProblem,
  keyFileProblem,
  journeyScript,
  fillJourneyPage,
  displayFaceRule,
  readDisplayFace
}
