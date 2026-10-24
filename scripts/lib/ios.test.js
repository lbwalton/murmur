// SPDX-License-Identifier: GPL-3.0-only
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ALTOOL_TIME_LIMIT_MS,
  altoolFailure,
  altoolRunFailure,
  buildNumber,
  compareVersions,
  copySharedJson,
  deviceProblem,
  displayFaceRule,
  readDisplayFace,
  exportOptionsPlist,
  fillJourneyPage,
  findOnPath,
  journeyScript,
  parsePillShotsLine,
  parseSmokeLine,
  keyFileProblem,
  pickSmokeSimulator,
  projectSetting,
  releaseBlocker,
  releaseOptions,
  systemFirstPath,
  uploadArgs
} from './ios'

const iphone17 = { name: 'iPhone 17', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', productFamily: 'iPhone' }
const iphone18 = { name: 'iPhone 18 Pro', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro', productFamily: 'iPhone' }
const ipad = { name: 'iPad (A16)', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-A16', productFamily: 'iPad' }
const runtime = (version, extra = {}) => ({
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replace('.', '-')}`,
  version,
  platform: 'iOS',
  isAvailable: true,
  supportedDeviceTypes: [iphone17, iphone18, ipad],
  ...extra
})
const ios265 = runtime('26.5')
const ios270 = runtime('27.0')
const ios18 = runtime('18.6')
const device = (name, udid, extra = {}) => ({ name, udid, state: 'Shutdown', isAvailable: true, ...extra })

describe('the smoke simulator', () => {
  it('never borrows another project simulator, even a booted one', () => {
    const list = {
      devicetypes: [iphone17, iphone18, ipad],
      runtimes: [ios265, ios270],
      devices: { [ios270.identifier]: [device('Parently QA', 'P1', { state: 'Booted' }), device('iPhone 18 Pro', 'X1', { state: 'Booted' })] }
    }
    expect(pickSmokeSimulator(list)).toEqual({
      create: { name: 'murmur smoke', deviceType: iphone17.identifier, runtime: ios270.identifier }
    })
  })

  it('reuses murmur smoke on any iOS 26 or later runtime', () => {
    const list = { devicetypes: [iphone17], runtimes: [ios265, ios270], devices: { [ios265.identifier]: [device('murmur smoke', 'M1')] } }
    expect(pickSmokeSimulator(list)).toEqual({ udid: 'M1' })
  })

  it('skips a murmur smoke device that is no longer available', () => {
    const list = {
      devicetypes: [iphone17],
      runtimes: [ios270],
      devices: { [ios270.identifier]: [device('murmur smoke', 'OLD', { isAvailable: false })] }
    }
    expect(pickSmokeSimulator(list)).toHaveProperty('create')
  })

  it('falls back to any iPhone when iPhone 17 is not offered', () => {
    const only18 = runtime('27.0', { supportedDeviceTypes: [ipad, iphone18] })
    const list = { devicetypes: [iphone18, ipad], runtimes: [only18], devices: {} }
    expect(pickSmokeSimulator(list).create.deviceType).toBe(iphone18.identifier)
  })

  it('falls back to the newest iPhone, which simctl lists first', () => {
    const iphone11 = { name: 'iPhone 11', identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-11', productFamily: 'iPhone' }
    const no17 = runtime('27.0', { supportedDeviceTypes: [iphone18, ipad, iphone11] })
    const list = { devicetypes: [iphone18, ipad, iphone11], runtimes: [no17], devices: {} }
    expect(pickSmokeSimulator(list).create.deviceType).toBe(iphone18.identifier)
  })

  it('says what to install when no iOS 26 runtime exists', () => {
    const list = { devicetypes: [iphone17], runtimes: [ios18], devices: {} }
    expect(() => pickSmokeSimulator(list)).toThrow(/no iOS 26 or later simulator runtime/)
  })

  it('compares versions numerically', () => {
    expect(compareVersions('27.0', '26.5')).toBeGreaterThan(0)
    expect(compareVersions('26.10', '26.9')).toBeGreaterThan(0)
    expect(compareVersions('26.5', '26.5')).toBe(0)
  })
})

describe('tools on PATH', () => {
  it('finds a tool and reports a missing one as null', () => {
    const pathEnv = ['/opt/homebrew/bin', '/usr/bin'].join(delimiter)
    const exists = (p) => p === join('/opt/homebrew/bin', 'xcodegen')
    expect(findOnPath('xcodegen', pathEnv, exists)).toBe(join('/opt/homebrew/bin', 'xcodegen'))
    expect(findOnPath('xcodegen', '/usr/bin', exists)).toBeNull()
    expect(findOnPath('xcodegen', '', exists)).toBeNull()
  })
})

describe('the shared rules copy', () => {
  const dirs = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it('copies only JSON and clears files that were removed from shared/', () => {
    const src = mkdtempSync(join(tmpdir(), 'murmur-src-'))
    const dest = mkdtempSync(join(tmpdir(), 'murmur-dest-'))
    dirs.push(src, dest)
    writeFileSync(join(src, 'format-spec.json'), '{}')
    writeFileSync(join(src, 'notes.txt'), 'not a rule')
    writeFileSync(join(dest, 'removed.json'), '{}')
    expect(copySharedJson(src, dest)).toBe(1)
    expect(readdirSync(dest)).toEqual(['format-spec.json'])
  })
})

describe('the smoke line', () => {
  it('finds SMOKE_RESULT among other output, Windows or pty line endings included', () => {
    const output = 'booting\r\nsmoke keychain: status -34018\r\nSMOKE_RESULT {"ok":false,"checks":{"keychain":false}}\r\n'
    expect(parseSmokeLine(output)).toEqual({ ok: false, checks: { keychain: false } })
  })

  it('returns null when the app never printed it', () => {
    expect(parseSmokeLine('crashed\n')).toBeNull()
  })
})

describe('the pill shots line', () => {
  it('finds where the app saved its pill shots', () => {
    expect(parsePillShotsLine('drawing\r\nPILL_SHOTS /Users/x/Library/tmp/pill-shots\r\n')).toBe('/Users/x/Library/tmp/pill-shots')
  })

  it('returns null when the app failed or never said', () => {
    expect(parsePillShotsLine('PILL_SHOTS_FAILED disk full\n')).toBeNull()
    expect(parsePillShotsLine('crashed\n')).toBeNull()
  })
})

describe('the release (IOS-015)', () => {
  const yml = ['settings:', '  base:', '    DEVELOPMENT_TEAM: 4B55ZVBVKN', '    MARKETING_VERSION: "0.1.0"', '    CURRENT_PROJECT_VERSION: "1"', ''].join('\n')

  it('reads the version and team from project.yml', () => {
    expect(projectSetting(yml, 'MARKETING_VERSION')).toBe('0.1.0')
    expect(projectSetting(yml, 'DEVELOPMENT_TEAM')).toBe('4B55ZVBVKN')
    expect(() => projectSetting(yml, 'MISSING')).toThrow('project.yml has no MISSING')
  })

  it('numbers a build by its commit count, and nothing else', () => {
    expect(buildNumber('412\n')).toBe('412')
    for (const bad of ['', '0', '-3', '12a', '1.5']) expect(() => buildNumber(bad)).toThrow('not a commit count')
  })

  it('exports for App Store Connect, signed by the team, with the build number kept', () => {
    const plist = exportOptionsPlist('4B55ZVBVKN')
    expect(plist).toContain('<key>method</key>\n  <string>app-store-connect</string>')
    expect(plist).toContain('<key>teamID</key>\n  <string>4B55ZVBVKN</string>')
    expect(plist).toContain('<key>manageAppVersionAndBuildNumber</key>\n  <false/>')
    expect(plist).toContain('<key>destination</key>\n  <string>export</string>')
    expect(() => exportOptionsPlist('nope')).toThrow('not a team id')
  })

  it('puts the system tools first, so Homebrew rsync never runs the export', () => {
    const path = systemFirstPath(['/opt/homebrew/bin', '/usr/bin', '/Users/me/bin', '/bin'].join(delimiter))
    expect(path.split(delimiter)).toEqual(['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/Users/me/bin'])
  })

  it('uploads with the key id and issuer, never the key file, and asks for JSON', () => {
    expect(uploadArgs('/tmp/murmur.ipa', 'KEYID12345', 'issuer-uuid')).toEqual([
      'altool', '--upload-app', '-f', '/tmp/murmur.ipa', '-t', 'ios', '--apiKey', 'KEYID12345', '--apiIssuer', 'issuer-uuid', '--output-format', 'json'
    ])
    expect(() => uploadArgs('/tmp/murmur.ipa', '', 'issuer')).toThrow('APPLE_API_KEY_ID')
  })

  it('uploads only when asked with --upload, and refuses flags it does not know', () => {
    expect(releaseOptions([], {})).toEqual({ upload: false, xcodeAccount: false })
    expect(releaseOptions(['--upload'], {})).toEqual({ upload: true, xcodeAccount: false })
    expect(releaseOptions(['--xcode-account'], {})).toEqual({ upload: false, xcodeAccount: true })
    for (const flag of ['--no-upload', '--dry-run', '--uplaod', 'upload']) {
      expect(() => releaseOptions([flag], {})).toThrow(`unknown option ${flag}`)
    }
  })

  it('stops when npm took a flag meant for the release (no -- before it)', () => {
    for (const name of ['npm_config_upload', 'npm_config_no_upload', 'npm_config_xcode_account']) {
      expect(() => releaseOptions([], { [name]: 'true' })).toThrow('npm run ios:release -- --upload')
    }
  })

  it('uploads only a clean commit from a full clone, so the build number names what shipped', () => {
    expect(releaseBlocker({ upload: true, dirty: false, shallow: false })).toBeNull()
    expect(releaseBlocker({ upload: true, dirty: true, shallow: false })).toContain('uncommitted changes')
    expect(releaseBlocker({ upload: true, dirty: false, shallow: true })).toContain('shallow clone')
    expect(releaseBlocker({ upload: false, dirty: true, shallow: true })).toBeNull()
  })

  it('reads a failed upload from what altool says, not only its exit code', () => {
    const failed = JSON.stringify({ 'product-errors': [{ code: -19232, message: 'The bundle version must be higher than the previously uploaded version.' }] })
    expect(altoolFailure(`2026-10-13 altool[1:2] some log line\n${failed}\n`)).toBe('The bundle version must be higher than the previously uploaded version.')
    expect(altoolFailure('*** Error: Unable to upload archive.')).toBe('*** Error: Unable to upload archive.')
    expect(altoolFailure('ERROR: [ContentDelivery.Uploader] Invalid bundle')).toBe('ERROR: [ContentDelivery.Uploader] Invalid bundle')
    expect(altoolFailure('UPLOAD FAILED with 1 error')).toBe('UPLOAD FAILED with 1 error')
    expect(altoolFailure(JSON.stringify({ 'success-message': "No errors uploading 'murmur.ipa'", 'product-errors': [] }))).toBeNull()
    expect(altoolFailure("No errors uploading 'murmur.ipa'")).toBeNull()
  })

  it('stops altool past its time limit and says so, since a hung validation once waited an hour', () => {
    // The shape spawnSync gives a run it stopped, which the release reads.
    const stopped = spawnSync('sleep', ['5'], { timeout: 50 })
    expect(stopped.error?.code).toBe('ETIMEDOUT')
    expect(altoolRunFailure(stopped, '')).toContain(`${ALTOOL_TIME_LIMIT_MS / 60_000} minutes`)
    expect(ALTOOL_TIME_LIMIT_MS).toBeGreaterThanOrEqual(10 * 60_000)
    expect(altoolRunFailure({ status: 0 }, "No errors uploading 'murmur.ipa'")).toBeNull()
    expect(altoolRunFailure({ status: 0 }, '*** Error: Unable to upload archive.')).toBe('*** Error: Unable to upload archive.')
    expect(altoolRunFailure({ status: 1 }, '')).toBe('altool exited 1')
    expect(altoolRunFailure({ error: new Error('spawnSync xcrun ENOENT'), status: null }, '')).toBe('spawnSync xcrun ENOENT')
  })

  it('refuses an app that runs on iPad without turning every way, as Apple does (90474)', () => {
    const all = ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
    const portrait = ['UIInterfaceOrientationPortrait']
    expect(deviceProblem({ UIDeviceFamily: [1], UISupportedInterfaceOrientations: portrait })).toBeNull()
    expect(deviceProblem({ UIDeviceFamily: [1, 2], UISupportedInterfaceOrientations: portrait })).toContain('iPad')
    expect(deviceProblem({ UIDeviceFamily: [1, 2], UISupportedInterfaceOrientations: all })).toBeNull()
    expect(deviceProblem({ UIDeviceFamily: [1, 2], UISupportedInterfaceOrientations: portrait, 'UISupportedInterfaceOrientations~ipad': all })).toBeNull()
    expect(deviceProblem({ UIDeviceFamily: [2], 'UISupportedInterfaceOrientations~ipad': portrait })).toContain('iPad')
  })

  it('needs the key file named for its id, where altool looks for it', () => {
    expect(keyFileProblem('/Users/me/.appstoreconnect/private_keys/AuthKey_KEYID12345.p8', 'KEYID12345')).toBeNull()
    expect(keyFileProblem('/Users/me/keys/murmur.p8', 'KEYID12345')).toContain('AuthKey_KEYID12345.p8')
    expect(keyFileProblem('', 'KEYID12345')).toContain('APPLE_API_KEY')
  })
})

describe('the Journey page (IOS-018)', () => {
  const template = '<style>/*TOKENS*/\n/*FONT*/</style><script>/*SCRIPT*/</script>'

  it('takes the one script Vite built', () => {
    expect(journeyScript([{ output: [{ type: 'asset', source: 'x' }, { type: 'chunk', code: 'var a=1' }] }])).toBe('var a=1')
    expect(journeyScript({ output: [{ type: 'chunk', code: 'var b=2' }] })).toBe('var b=2')
    expect(() => journeyScript([{ output: [] }])).toThrow(/no script/)
  })

  it('sets the tokens, the font, and the script into the page, as written', () => {
    const page = fillJourneyPage(template, ':root { --ink: #0f0e11; }', 'a.replace(/x/, "$&")', '@font-face { src: url($&) }')
    expect(page).toBe('<style>:root { --ink: #0f0e11; }\n@font-face { src: url($&) }</style><script>a.replace(/x/, "$&")</script>')
    expect(fillJourneyPage(template, '', 'x')).toBe('<style>\n</style><script>x</script>')
  })

  it('inlines the display face (IOS-019), so the page loads no file for it', () => {
    const rule = displayFaceRule(Buffer.from('wOF2 face'))
    expect(rule).toContain('font-family: "murmur display"')
    expect(rule).toContain(`url(data:font/woff2;base64,${Buffer.from('wOF2 face').toString('base64')}) format("woff2")`)
    expect(rule).toContain('font-weight: 800')
    // Condensed as desktop sets its titles, even where the canvas cannot
    // condense (WebKit, IOS-021).
    expect(rule).toContain('font-stretch: 75%;')
  })

  it('refuses a script that could close its own tag, and a page without its marks', () => {
    expect(() => fillJourneyPage(template, '', 'x("</script>")')).toThrow(/closing script tag/)
    expect(() => fillJourneyPage('<script>/*SCRIPT*/</script>', '', 'x')).toThrow(/TOKENS/)
    expect(() => fillJourneyPage('<style>/*TOKENS*/</style><script>/*SCRIPT*/</script>', '', 'x')).toThrow(/FONT/)
    expect(() => fillJourneyPage(template + '/*SCRIPT*/', '', 'x')).toThrow(/SCRIPT/)
  })
})

describe('the display face for the page (IOS-019)', () => {
  const dirs = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  const fonts = (face) => {
    const dir = mkdtempSync(join(tmpdir(), 'murmur-face-'))
    dirs.push(dir)
    if (face) writeFileSync(join(dir, 'bricolage-grotesque-display.woff2'), face)
    writeFileSync(join(dir, 'OFL.txt'), 'SIL OPEN FONT LICENSE')
    return dir
  }
  const whole = () => {
    const bytes = Buffer.alloc(16)
    bytes.write('wOF2', 0, 'latin1')
    bytes.writeUInt32BE(16, 8)
    return bytes
  }

  it('reads a whole face and its license', () => {
    const face = readDisplayFace(fonts(whole()))
    expect(face.rule).toContain('font-family: "murmur display"')
    expect(face.license).toMatch(/OFL\.txt$/)
  })

  it('goes without a missing or broken face, unless a release needs one', () => {
    expect(readDisplayFace(fonts(null))).toBeNull()
    expect(readDisplayFace(fonts(whole().subarray(0, 12)))).toBeNull()
    expect(() => readDisplayFace(fonts(null), { require: true })).toThrow(/display face/)
    expect(() => readDisplayFace(fonts(whole().subarray(0, 12)), { require: true })).toThrow(/display face/)
  })
})
