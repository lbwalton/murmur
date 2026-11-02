# TestFlight 1 (IOS-015) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Core dictation on LaBroi's own iPhone. `npm run ios:release` archives murmur with a build number from git, exports and checks the signed ipa, has Apple validate it, and uploads it to App Store Connect with the existing App Store Connect API key, all with no clicking in Xcode. `ios/RELEASING.md` is the runbook.

**Architecture:**
- Small, pure helpers in `scripts/lib/ios.js` (tested with vitest):
  - read a project.yml setting;
  - turn a commit count into a build number;
  - write the App Store export options;
  - put the system tools first on PATH (Homebrew rsync breaks the export);
  - build altool's upload arguments.
- `scripts/ios.js release` strings them together:
  1. `xcodebuild archive` with `CURRENT_PROJECT_VERSION` set to the build number;
  2. `xcodebuild -exportArchive`;
  3. checks on the archive and on the unzipped ipa;
  4. then, unless `--no-upload`, `altool --validate-app` and `--upload-app`.
- Signing and upload both use the API key trio from the environment (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`), as `register` does.

**Tech Stack:** Node (child_process), xcodebuild, xcrun altool, vitest.

**Spec:** `ios/prd.json` IOS-015, `CLAUDE.md`, and the root `RELEASING.md` for desktop's runbook shape. Parently's uploads from this Mac use the same chain (archive, exportArchive with the system rsync first, altool), recorded in LaBroi's Parently notes.

**Proven before writing:** in a throwaway copy of `feature/ios` at 48a7d07:
- The release helpers' 5 new vitest cases passed (18 in `scripts/lib/ios.test.js`).
- `npm run ios:release -- --no-upload` ran end to end with the API key: it archived murmur 0.1.0 (373), exported `murmur.ipa` (2.8 MB), and passed every check.
- The exported app was inspected by hand. It carries an iOS Team Store provisioning profile, is signed by Apple Distribution: Eze Media LLC (4B55ZVBVKN), has `get-task-allow` false, and lists no test devices.
- Signing with the account signed in to Xcode failed from this shell ("No Accounts", since the account's keychain entry is unreadable here), so the API key is the default.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The build number is the commit count of HEAD.** It only grows, it needs no state, and it matches what a reader can recompute. If wrong: one helper.
2. **Signing and upload use the API key by default.** `--xcode-account` signs with Xcode's account. This mirrors `register`.
3. **Apple validates the ipa just before the upload,** so a refusal arrives before a build number is used.
4. **The upload waits for LaBroi's yes, every time.** It sends the build to Apple. Parently's notes ask the same.
5. **The internal group is murmur team,** made with the record in IOS-004; the runbook says how to add a build to it. (Corrected by the review gate: the first draft had LaBroi make a second group.)
6. **The orientation warning stays.** "All interface orientations must be supported unless the app requires full screen" is about iPad multitasking, and murmur is iPhone only and portrait only. If wrong: one Info.plist key.

## Global Constraints

- Never print, log, or commit `APPLE_API_*` values or the .p8 contents. The script passes the key path and ids to xcodebuild and altool only.
- No secrets in the repo; `ios/build/` stays ignored.
- No em dashes or spaced hyphens in comments, docs, or messages. murmur is lowercase.
- Commits start with `IOS-015:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **A build number that repeats or goes backwards.** It only grows with commits; a non-number stops the run. Pinned by the vitest case `numbers a build by its commit count, and nothing else` (Task 1).
2. **An ipa signed for development or missing the app group goes up.** The release checks the unzipped ipa and stops. Verified by the `--no-upload` run (Task 2).
3. **Homebrew's rsync breaking the export.** Pinned by `puts the system tools first` (Task 1) and the dry run (Task 2).
4. **A key value printed or written to disk by the script.** Only ids and the path are passed. Pinned by `uploads with the key id and issuer, never the key file` (Task 1).
5. **An upload that runs without LaBroi's yes.** `--no-upload` is the default way to prove a build, and the runbook and HANDOFF say to ask first (Task 3).

---

### Task 1: The release helpers

**Files:** Modify `scripts/lib/ios.js` and `scripts/lib/ios.test.js`.

**Interfaces:**
- Produces `projectSetting(projectYml, name)` and `buildNumber(countText)`.
- Produces `exportOptionsPlist(teamId)` and `systemFirstPath(pathEnv)`.
- Produces `uploadArgs(ipa, keyId, issuer)`.

- [ ] **Step 1: Write the failing tests**

In `scripts/lib/ios.test.js`, replace the `import { ... } from './ios'` line with:

```js
import {
  buildNumber,
  compareVersions,
  copySharedJson,
  exportOptionsPlist,
  findOnPath,
  parsePillShotsLine,
  parseSmokeLine,
  pickSmokeSimulator,
  projectSetting,
  systemFirstPath,
  uploadArgs
} from './ios'
```

At the end of the file, add:

```js
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

  it('uploads with the key id and issuer, never the key file', () => {
    expect(uploadArgs('/tmp/murmur.ipa', 'KEYID12345', 'issuer-uuid')).toEqual([
      'altool', '--upload-app', '-f', '/tmp/murmur.ipa', '-t', 'ios', '--apiKey', 'KEYID12345', '--apiIssuer', 'issuer-uuid'
    ])
    expect(() => uploadArgs('/tmp/murmur.ipa', '', 'issuer')).toThrow('APPLE_API_KEY_ID')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: the new cases fail with `projectSetting is not a function` (and the like).

- [ ] **Step 3: Write the helpers**

In `scripts/lib/ios.js`, replace the `module.exports = { ... }` line with:

```js
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
 *  the key's id and issuer only, as altool reads the key file itself. */
function uploadArgs(ipa, keyId, issuer) {
  if (!keyId || !issuer) throw new Error('uploading needs APPLE_API_KEY_ID and APPLE_API_ISSUER')
  return ['altool', '--upload-app', '-f', ipa, '-t', 'ios', '--apiKey', keyId, '--apiIssuer', issuer]
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
  uploadArgs
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: 18 tests pass. Then `npm run test` passes 904.

- [ ] **Step 5: Run the gates and commit**

```bash
git add scripts/lib/ios.js scripts/lib/ios.test.js
git commit -m "IOS-015: the release helpers: a build number from git, App Store export options, the system rsync first, and the upload's arguments"
```

### Task 2: npm run ios:release

**Files:** Modify `scripts/ios.js` and `package.json`.

The dry run is the test here: it archives, exports, and checks a real build without sending anything.

**Interfaces:**
- Consumes Task 1's helpers.
- Produces `node scripts/ios.js release [--no-upload] [--xcode-account]` and `npm run ios:release`.

- [ ] **Step 1: Write the command**

In `scripts/ios.js`, make four changes:
1. In the header comment, after the `register` line, add:

```js
//   node scripts/ios.js release    archives for the App Store, checks, and uploads to TestFlight (--no-upload stops before)
```

2. Replace `const { join } = require('node:path')` with `const { dirname, join } = require('node:path')`.
3. Replace the `require('./lib/ios')` line with:

```js
const {
  SIM_SIGNING,
  buildNumber,
  copySharedJson,
  exportOptionsPlist,
  findOnPath,
  parsePillShotsLine,
  parseSmokeLine,
  pickSmokeSimulator,
  projectSetting,
  systemFirstPath,
  uploadArgs
} = require('./lib/ios')
```

4. Before `const COMMANDS = {`, add the following, and add `release` to `COMMANDS` after `register`:

```js
/** TestFlight (IOS-015): archives murmur for the App Store with a build
 *  number from git, exports the signed ipa, checks it, has Apple validate
 *  it, and uploads it to App Store Connect, all with the App Store Connect
 *  API key from the environment (signing can use the account signed in to
 *  Xcode with --xcode-account). --no-upload stops with the ipa checked and
 *  nothing sent. */
async function release() {
  await generateAll()
  const yml = readFileSync(join(iosDir, 'project.yml'), 'utf8')
  const version = projectSetting(yml, 'MARKETING_VERSION')
  const team = projectSetting(yml, 'DEVELOPMENT_TEAM')
  const build = buildNumber(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' }))
  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env
  const useKey = !process.argv.includes('--xcode-account') && APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER
  const auth = useKey
    ? ['-authenticationKeyPath', APPLE_API_KEY, '-authenticationKeyID', APPLE_API_KEY_ID, '-authenticationKeyIssuerID', APPLE_API_ISSUER]
    : []
  console.log(`ios: signing with ${useKey ? 'the App Store Connect API key' : 'the account signed in to Xcode'}`)
  const out = join(iosDir, 'build', 'release', `${version}-${build}`)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const archive = join(out, 'murmur.xcarchive')
  console.log(`ios: archiving murmur ${version} (${build})`)
  run('xcodebuild', [
    'archive', '-project', project, '-scheme', 'murmur', '-configuration', 'Release', '-destination', 'generic/platform=iOS',
    '-archivePath', archive, '-derivedDataPath', join(iosDir, 'build', 'ReleaseData'), '-allowProvisioningUpdates', '-quiet',
    `CURRENT_PROJECT_VERSION=${build}`, ...auth
  ])
  const options = join(out, 'ExportOptions.plist')
  writeFileSync(options, exportOptionsPlist(team))
  const exported = join(out, 'export')
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', exported, '-exportOptionsPlist', options, '-allowProvisioningUpdates', '-quiet', ...auth], {
    env: { ...process.env, PATH: systemFirstPath(process.env.PATH) }
  })
  const app = join(archive, 'Products', 'Applications', 'murmur.app')
  const checks = {
    CFBundleShortVersionString: version,
    CFBundleVersion: build,
    ITSAppUsesNonExemptEncryption: 'false'
  }
  for (const [key, want] of Object.entries(checks)) {
    const got = plistValue(app, key)
    if (got !== want) throw new Error(`the archive's ${key} is ${got}, not ${want}`)
  }
  if (plistValue(join(app, 'PlugIns', 'murmurKeyboard.appex'), 'CFBundleVersion') !== build) {
    throw new Error('the keyboard carries a different build number')
  }
  // What goes to Apple is the ipa: both bundles in it must be signed for the
  // App Store (no test devices) with profiles that carry the app group.
  const ipa = join(exported, 'murmur.ipa')
  const unpacked = join(out, 'unpacked')
  run('unzip', ['-q', ipa, '-d', unpacked])
  const shipped = join(unpacked, 'Payload', 'murmur.app')
  const group = plistValue(shipped, 'MurmurAppGroup')
  for (const bundle of [shipped, join(shipped, 'PlugIns', 'murmurKeyboard.appex')]) {
    const profile = execFileSync('security', ['cms', '-D', '-i', join(bundle, 'embedded.mobileprovision')], { encoding: 'utf8' })
    if (!profile.includes(group)) throw new Error(`${bundle}: its provisioning profile lacks the app group ${group}`)
    if (profile.includes('<key>ProvisionedDevices</key>')) throw new Error(`${bundle}: signed for test devices, not the App Store`)
  }
  if (process.argv.includes('--no-upload')) {
    console.log(`ios: murmur ${version} (${build}) is checked and ready at ${ipa}; nothing was sent (--no-upload)`)
    return 0
  }
  // altool reads the key file from the folder it is in.
  const env = APPLE_API_KEY ? { ...process.env, API_PRIVATE_KEYS_DIR: dirname(APPLE_API_KEY) } : process.env
  const upload = uploadArgs(ipa, APPLE_API_KEY_ID, APPLE_API_ISSUER)
  run('xcrun', ['altool', '--validate-app', ...upload.slice(2)], { env })
  run('xcrun', upload, { env })
  console.log(`ios: murmur ${version} (${build}) is uploaded; it shows in TestFlight once App Store Connect has processed it`)
  return 0
}
```

In `package.json`, after `"ios:register": "node scripts/ios.js register",`, add:

```json
    "ios:release": "node scripts/ios.js release",
```

- [ ] **Step 2: Run the dry run**

Run: `npm run ios:release -- --no-upload`
Expected:
- It prints `ios: signing with the App Store Connect API key` and `ios: archiving murmur 0.1.0 (<commit count>)`.
- It ends with `is checked and ready at .../ios/build/release/0.1.0-<count>/export/murmur.ipa; nothing was sent (--no-upload)`, exit 0.

- [ ] **Step 3: Run the gates and commit**

```bash
git add scripts/ios.js package.json
git commit -m "IOS-015: npm run ios:release archives, checks, validates, and uploads to TestFlight with the API key"
```

### Task 3: The runbook, the live checks, and the notes

**Files:**
- Create: `ios/RELEASING.md`.
- Modify: `HANDOFF.md`, `ios/prd.json`, `ios/README.md`.

- [ ] **Step 1: The runbook**

`ios/RELEASING.md`, whole:

```markdown
# Releasing murmur for iPhone

How a build gets from this repo to TestFlight (ios/prd.json IOS-015). Desktop has its own runbook in the root RELEASING.md. The order matters; each step assumes the previous one held.

## Version and build numbers

- **Version** is `MARKETING_VERSION` in `ios/project.yml` (0.1.0 for the TestFlight builds). Bump it in its own commit when an App Store version changes.
- **Build** is the number of commits behind the build (`git rev-list --count HEAD`). `npm run ios:release` sets it at archive time, so `CURRENT_PROJECT_VERSION` in `ios/project.yml` stays 1 and is never edited by hand. It only grows, so every new commit uploads with a new build number. App Store Connect refuses a second upload of the same build number, so a rebuild of the same commit needs a new commit first.

## What the Mac needs once

- The App Store Connect API key in the environment: `APPLE_API_KEY` (the path to the .p8 file), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. On LaBroi's Mac they live in `~/.config/apple-notary/env`, which `~/.zshenv` loads. Never print them, log them, or commit them.
- The Apple Distribution certificate for Eze Media LLC (team 4B55ZVBVKN) in the login keychain.
- The App Store Connect record murmur voice dictation for `com.lbwalton.murmur.ios`, which exists (IOS-004).

Signing uses the API key with automatic provisioning: the first archive creates the App Store profiles for the app and the keyboard. `--xcode-account` signs with the account signed in to Xcode instead, which works only from a Terminal that can read the login keychain.

## Archive, check, and upload

1. **Gates.** `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke` green on the commit you ship.
2. **Dry run.** `npm run ios:release -- --no-upload` generates the project, archives murmur for the App Store, exports the signed ipa into `ios/build/release/<version>-<build>/export/`, and checks it. Nothing is sent. The checks:
   - the version and build number in the archive;
   - export compliance set (below);
   - the keyboard carrying the same build;
   - both bundles in the ipa signed for the App Store, with no test devices and profiles that carry the app group.
3. **Upload.** `npm run ios:release` does all of that, then has Apple validate the ipa, then uploads it. Ask LaBroi before every upload: it sends the build to Apple.
4. **Processing.** App Store Connect processes the build for 5 to 30 minutes. Apple emails lbwalton@gmail.com when it is ready, or when it is not and why.

## Export compliance

murmur makes only HTTPS requests through Apple's own networking and adds no encryption of its own, so it is exempt. `ITSAppUsesNonExemptEncryption` is false in the app's Info.plist, and App Store Connect does not ask about encryption for each build. If murmur ever adds encryption of its own, this answer changes before the next upload.

## TestFlight test notes

Paste this into the build's What to Test in App Store Connect, TestFlight, under the build:

> First TestFlight build of murmur voice dictation. Finish first run: microphone, the murmur keyboard, Full Access, and your provider key. Then dictate with the murmur keyboard in Messages, Notes, Mail, and Safari. Try a take where you say nothing (nothing should be typed) and a take with Wi-Fi and cellular off (it should wait, then send when you retry). If something goes wrong, Settings, Diagnostics, Save report makes a report you can read and then share.

## Internal testing

- In App Store Connect, open murmur voice dictation, then TestFlight. Once, create an internal group (murmur internal) with LaBroi in it and automatic distribution on, so every processed build reaches it.
- On the iPhone, install TestFlight from the App Store. The invite goes to lbwalton@gmail.com, the App Store Connect account; the phone's iCloud is a different Apple ID, so open the invite email on the phone, or sign in to TestFlight as lbwalton@gmail.com.

## Before inviting anyone else

- LaBroi's live checks in HANDOFF.md pass on his own iPhone first.
- External testers need Beta App Review: fill in Test Information in App Store Connect (a feedback email, a contact, the privacy policy address, a beta description) and the app's privacy details. murmur collects nothing itself: takes go only to the provider you choose with your own key, and diagnostics are never sent by themselves.
- Problems found in TestFlight become fixes or stories in ios/prd.json before the next build (IOS-015).
```

- [ ] **Step 2: The live checks**

In `HANDOFF.md`, under `## Now`, after the IOS-013 live check, add:

```markdown
- [ ] IOS-015 TestFlight 1, once Claude has asked and you have said yes to the upload (added 2026-10-13). (1) Wait for Apple's email to lbwalton@gmail.com saying the build is ready to test (usually 5 to 30 minutes after the upload). (2) On appstoreconnect.apple.com, open Apps, murmur voice dictation, TestFlight. Under Internal Testing, click the plus, name the group murmur internal, add yourself, and turn on automatic distribution. The group should list build 0.1.0 with the number Claude gave you. (3) On your iPhone, install TestFlight from the App Store. Open the invite email sent to lbwalton@gmail.com, tap View in TestFlight, then Install. (4) Open murmur and finish first run: allow the microphone, add the murmur keyboard, turn on Full Access, and paste your Groq key. Each step should check itself off. (5) In Messages, Notes, Mail, and Safari, switch to the murmur keyboard, tap the pill, say a sentence, and tap again. Each time your words should land in the field. (6) Tap the pill, say nothing for three seconds, and tap again: nothing should be typed. (7) Turn on Airplane Mode and dictate a take: the pill should show that it failed, and nothing is typed. Turn Airplane Mode off and open murmur. Home should say 1 take waiting to retry; tap it, then Retry: the words should come back and be copied. (8) Then work through the IOS-005 to IOS-013 live checks above, and tell Claude what each step did; anything that went wrong becomes a fix before TestFlight 2.
```

- [ ] **Step 3: The README and the notes**

In `ios/README.md`, list `npm run ios:release` with the other commands and point to `ios/RELEASING.md`.

In `ios/prd.json`, set IOS-015's `notes` to say what was built and verified, the rulings above, that the upload and the live check wait for LaBroi (`passes` stays false), and the gate counts. Write only the notes field.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/RELEASING.md HANDOFF.md ios/prd.json ios/README.md
git commit -m "IOS-015: the iPhone release runbook and TestFlight 1's live checks"
```
