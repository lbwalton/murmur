# iPhone Foundation: Scaffold, CI, and App Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up murmur's iPhone project (the app, the keyboard extension, the shared drawer, and the MurmurCore package), generated entirely from text, with `npm run ios:test` and `npm run ios:smoke` green locally and in CI, and the App Store Connect record created.

**Architecture:** XcodeGen turns `ios/project.yml` into a git-ignored Xcode project. A single Node driver, `scripts/ios.js`, generates everything that must not be committed (Swift colors from `tokens.css`, the app icon, a copy of `shared/*.json`, the project), then runs the tests or the headless smoke on murmur's own simulator. The app prints `SMOKE_RESULT` exactly the way desktop's smoke does.

**Tech Stack:** Swift 6 (SwiftUI, UIKit for the keyboard), Swift Testing, XcodeGen, Node 22 scripts with vitest, GitHub Actions on `macos-26`.

**Spec:** `ios/prd.json` (stories IOS-001, IOS-002, IOS-004, plus `stack`, `decisions`, and `conventions`), approved by LaBroi on 2026-10-10. Also read `CLAUDE.md` and `DESIGN.md`. IOS-003 (MurmurCore passes desktop's answer key) gets its own plan, written next; it needs only the package from Task 4 here.

## Global Constraints

- iOS 26 minimum (`deploymentTarget iOS: "26.0"`), iPhone only for now (`TARGETED_DEVICE_FAMILY: "1"`).
- App `com.lbwalton.murmur.ios`, keyboard `com.lbwalton.murmur.ios.keyboard`, app group `group.com.lbwalton.murmur`, team `4B55ZVBVKN` (Eze Media LLC).
- Swift 6 language mode (`SWIFT_VERSION: "6.0"`, `swift-tools-version: 6.0`). It must build with Xcode 26.6 (CI's default on `macos-26`, checked 2026-10-10) and with Xcode 27 locally, so use nothing newer than the iOS 26.0 SDK.
- No third-party Swift packages.
- No binary assets committed. Everything generated lands in `ios/Generated/` (git-ignored) or `ios/build/` (git-ignored).
- `npm install`, `npm run typecheck`, `npm run test`, and `npm run smoke` never need Xcode. The new `scripts/lib/ios*.test.js` files run on desktop CI's Windows runner too: no `xcrun`, no POSIX-only paths in tests.
- Every `.ts`, `.tsx`, `.js`, `.css`, and `.swift` file starts with `// SPDX-License-Identifier: GPL-3.0-only` (CSS uses `/* */`; `Package.swift` puts it on line 2, after the tools version).
- Colors only through the generated `Tokens` enum. No hex and no `Color(red:...)` in hand-written Swift.
- The product name is always lowercase murmur. No em dashes or spaced hyphens as clause separators in copy, comments, or commits.
- Commits start with the story id (`IOS-001: ...`). Run `git pull --rebase origin main` before every commit. `npm run typecheck` and `npm run test` must be green before every commit; from Task 6 on, `npm run ios:test` too; from Task 7 on, `npm run ios:smoke` too.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- Never push without LaBroi's OK, and run the review gate (an independent reviewer agent over the full diff) before any push.

## Review Focus

1. **Another project's simulator is booted.** LaBroi's Mac has other projects' simulators running (for example `Parently QA`). The smoke and the tests must use only murmur's own simulator, named `murmur smoke`, and must shut down only that one. Pinned by the picker tests in Task 3.
2. **XcodeGen isn't installed** (a fresh clone, or CI before `brew install`). Every `ios:` command should stop with `xcodegen is not installed. Install it with: brew install xcodegen`, never a stack trace. Pinned by the `findOnPath` tests in Task 3 and the `need()` guard in Task 5.
3. **`tokens.css` changes shape** (3- or 8-digit hex, `rgb()`, comments full of colons, another theme block). The generator must still emit exactly the `:root` colors and skip everything else. Pinned in Task 1.
4. **A bad file lands in `shared/`** (invalid JSON, or a non-JSON file). The copy must take only `*.json`, and the smoke must fail by naming the bad file. Pinned in Task 3 (copy filter) and Task 4 (`invalidJSON`).
5. **App Store Connect rejects an app icon with an alpha channel.** The default icon must be written as RGB (PNG color type 2). Pinned in Task 2.

---

### Task 1: Night studio colors for Swift

**Files:**
- Create: `scripts/lib/ios-tokens.js`
- Test: `scripts/lib/ios-tokens.test.js`

**Interfaces:**
- Produces: `parseColor(value: string) -> [r, g, b, a] | null`, `parseRootTokens(css: string) -> Array<{ name: string, rgba: [number, number, number, number] }>`, `camel(name: string) -> string`, `toSwift(tokens) -> string` (an internal `enum Tokens` of `static let` SwiftUI `Color`s), and `colorSetJson(rgba) -> string` (an asset catalog color set, used for the launch screen).

- [ ] **Step 1: Write the failing test**

```js
// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { camel, colorSetJson, parseColor, parseRootTokens, toSwift } from './ios-tokens'

const SAMPLE = `/* SPDX-License-Identifier: GPL-3.0-only */
/* A comment: with colons, and a fake --token: #123456; inside. */
:root {
  /* ground: inside the block, with a fake --ghost: #123456; that must not count */
  --ink: #0f0e11;
  --short: #fff;
  --veil: #ffffff80;
  --panel-glass: rgba(23, 22, 27, 0.96);
  --plain: rgb(1, 2, 3);
  --font-body:
    'Inter',
    -apple-system,
    sans-serif;
  --cream-06: rgba(236, 233, 228, 0.06);
}

:root[data-theme='mist'] {
  --ink: #10131a;
}
`

describe('night studio for Swift', () => {
  it('reads every color form tokens.css can hold', () => {
    expect(parseColor('#0f0e11')).toEqual([15, 14, 17, 1])
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseColor('#ffffff80')).toEqual([255, 255, 255, 0.502])
    expect(parseColor('rgba(23, 22, 27, 0.96)')).toEqual([23, 22, 27, 0.96])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1])
    expect(parseColor("'Inter', sans-serif")).toBeNull()
  })

  it('takes only the :root colors, in order, skipping fonts, comments, and themes', () => {
    expect(parseRootTokens(SAMPLE)).toEqual([
      { name: 'ink', rgba: [15, 14, 17, 1] },
      { name: 'short', rgba: [255, 255, 255, 1] },
      { name: 'veil', rgba: [255, 255, 255, 0.502] },
      { name: 'panel-glass', rgba: [23, 22, 27, 0.96] },
      { name: 'plain', rgba: [1, 2, 3, 1] },
      { name: 'cream-06', rgba: [236, 233, 228, 0.06] }
    ])
  })

  it('reads the real tokens.css', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'renderer', 'tokens.css'), 'utf8')
    const names = parseRootTokens(css).map((t) => t.name)
    for (const name of ['ink', 'panel', 'text', 'brand', 'amber', 'red', 'ok', 'founder-gold', 'smoke', 'rice', 'ember']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('font-body')
    expect(names.filter((n) => n === 'ink')).toHaveLength(1)
  })

  it('names tokens the Swift way', () => {
    expect(camel('panel-lift')).toBe('panelLift')
    expect(camel('cream-06')).toBe('cream06')
    expect(camel('heat-invert-bg')).toBe('heatInvertBg')
  })

  it('writes a Swift enum with the license header and exact values', () => {
    const swift = toSwift(parseRootTokens(SAMPLE))
    expect(swift.startsWith('// SPDX-License-Identifier: GPL-3.0-only\n')).toBe(true)
    expect(swift).toContain('enum Tokens {')
    expect(swift).toContain('    static let ink = Color(.sRGB, red: 15.0 / 255, green: 14.0 / 255, blue: 17.0 / 255, opacity: 1.0)')
    expect(swift).toContain('    static let panelGlass = Color(.sRGB, red: 23.0 / 255, green: 22.0 / 255, blue: 27.0 / 255, opacity: 0.96)')
  })

  it('writes an asset catalog color set for the launch screen', () => {
    const set = JSON.parse(colorSetJson([15, 14, 17, 1]))
    expect(set.colors[0].color).toEqual({
      'color-space': 'srgb',
      components: { red: '0.059', green: '0.055', blue: '0.067', alpha: '1.000' }
    })
    expect(set.info).toEqual({ author: 'xcode', version: 1 })
  })
})
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `npx vitest run scripts/lib/ios-tokens.test.js`
Expected: FAIL, because `./ios-tokens` can't be found.

- [ ] **Step 3: Write the implementation**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Night studio for Swift (ios/prd.json conventions.design): reads the
// :root block of src/renderer/tokens.css and writes the same colors as a
// Swift enum, so the iPhone app and the desktop app change color
// together. scripts/ios.js writes the result into ios/Generated, which
// is never committed.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i

/** [r, g, b, a] with r, g, b in 0 to 255 and a in 0 to 1, or null for a non-color. */
function parseColor(value) {
  const v = value.trim()
  const hex = v.match(HEX)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    const byte = (i) => parseInt(h.slice(i, i + 2), 16)
    const alpha = h.length === 8 ? Math.round((byte(6) / 255) * 1000) / 1000 : 1
    return [byte(0), byte(2), byte(4), alpha]
  }
  const rgb = v.match(RGB)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  return null
}

/** The color tokens of the plain :root block, in file order. Fonts and
 *  anything else that is not a color are skipped; themes are ignored. */
function parseRootTokens(css) {
  const start = css.indexOf(':root {')
  if (start < 0) throw new Error('tokens.css has no :root block')
  const end = css.indexOf('\n}', start)
  const body = css.slice(start, end < 0 ? undefined : end).replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = []
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const rgba = parseColor(match[2])
    if (rgba) tokens.push({ name: match[1], rgba })
  }
  return tokens
}

/** panel-lift becomes panelLift. */
function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

const decimal = (n) => (Number.isInteger(n) ? `${n}.0` : String(n))

function toSwift(tokens) {
  const lines = tokens.map(
    ({ name, rgba: [r, g, b, a] }) =>
      `    /// --${name}\n    static let ${camel(name)} = Color(.sRGB, red: ${r}.0 / 255, green: ${g}.0 / 255, blue: ${b}.0 / 255, opacity: ${decimal(a)})`
  )
  return [
    '// SPDX-License-Identifier: GPL-3.0-only',
    '// Generated by scripts/ios.js from src/renderer/tokens.css. Do not edit:',
    '// change tokens.css, and both apps change together.',
    'import SwiftUI',
    '',
    'enum Tokens {',
    ...lines,
    '}',
    ''
  ].join('\n')
}

/** An asset catalog color set (the launch screen's ground). */
function colorSetJson([r, g, b, a]) {
  const unit = (n) => (n / 255).toFixed(3)
  return (
    JSON.stringify(
      {
        colors: [
          {
            color: { 'color-space': 'srgb', components: { red: unit(r), green: unit(g), blue: unit(b), alpha: a.toFixed(3) } },
            idiom: 'universal'
          }
        ],
        info: { author: 'xcode', version: 1 }
      },
      null,
      2
    ) + '\n'
  )
}

module.exports = { parseColor, parseRootTokens, camel, toSwift, colorSetJson }
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `npx vitest run scripts/lib/ios-tokens.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add scripts/lib/ios-tokens.js scripts/lib/ios-tokens.test.js
git commit -m "IOS-001: night studio colors for Swift, generated from tokens.css"
```

---

### Task 2: The iPhone app icon

**Files:**
- Modify: `scripts/lib/draw.js` (the `encodePng` function at lines 38 to 56: an RGB option)
- Create: `scripts/lib/ios-icon.js`
- Test: `scripts/lib/ios-icon.test.js`

**Interfaces:**
- Consumes: `markOnInkRgba(w, h, s, brush)`, `RICE`, `AMBER`, and `EMBER` from `scripts/lib/icons.js`; `cleanEnsoScene` and `paintBrushedEnso` from `scripts/lib/enso.js`; `render` and `encodePng` from `scripts/lib/draw.js`; `RasterContext` from `scripts/lib/raster.js`.
- Produces: `encodePng(width, height, rgba, { alpha = true } = {})`, where `alpha: false` writes PNG color type 2. Also `iosIconSet(brush, size = 1024) -> { 'icon-1024.png': Buffer, 'icon-1024-dark.png': Buffer, 'icon-1024-tinted.png': Buffer, 'Contents.json': string }` and `grayscale(rgba: Buffer) -> Buffer`.

- [ ] **Step 1: Write the failing test**

```js
// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest'
import { encodePng } from './draw'
import { grayscale, iosIconSet } from './ios-icon'

// A PNG's color type sits at byte 25: the 8-byte signature, the IHDR
// chunk's length and type (8), then width, height, and bit depth (9).
const colorType = (png) => png[25]
const width = (png) => png.readUInt32BE(16)

describe('the iPhone app icon', () => {
  it('can write a PNG without an alpha channel', () => {
    const rgba = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255])
    expect(colorType(encodePng(2, 1, rgba))).toBe(6)
    expect(colorType(encodePng(2, 1, rgba, { alpha: false }))).toBe(2)
  })

  it('makes the default icon opaque RGB, which App Store Connect requires', () => {
    const set = iosIconSet(null, 64)
    expect(colorType(set['icon-1024.png'])).toBe(2)
    expect(width(set['icon-1024.png'])).toBe(64)
  })

  it('keeps transparency for the dark and tinted versions iOS grounds itself', () => {
    const set = iosIconSet(null, 64)
    expect(colorType(set['icon-1024-dark.png'])).toBe(6)
    expect(colorType(set['icon-1024-tinted.png'])).toBe(6)
  })

  it('turns the tinted version gray and keeps its alpha', () => {
    const out = grayscale(Buffer.from([240, 164, 75, 200]))
    expect(out[0]).toBe(out[1])
    expect(out[1]).toBe(out[2])
    expect(out[3]).toBe(200)
  })

  it('lists all three in the icon set with the right appearances', () => {
    const contents = JSON.parse(iosIconSet(null, 64)['Contents.json'])
    expect(contents.images.map((i) => i.filename)).toEqual(['icon-1024.png', 'icon-1024-dark.png', 'icon-1024-tinted.png'])
    expect(contents.images.every((i) => i.idiom === 'universal' && i.platform === 'ios' && i.size === '1024x1024')).toBe(true)
    expect(contents.images[1].appearances).toEqual([{ appearance: 'luminosity', value: 'dark' }])
    expect(contents.images[2].appearances).toEqual([{ appearance: 'luminosity', value: 'tinted' }])
  })
})
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `npx vitest run scripts/lib/ios-icon.test.js`
Expected: FAIL, because `./ios-icon` can't be found.

- [ ] **Step 3: Add the RGB option to `encodePng` in `scripts/lib/draw.js`**

Replace the whole function (lines 38 to 56) with:

```js
function encodePng(width, height, rgba, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = alpha ? 6 : 2 // color type RGBA, or RGB for an opaque image
  const stride = 1 + width * channels
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter none
    if (alpha) {
      rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
    } else {
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4
        const to = y * stride + 1 + x * 3
        raw[to] = rgba[from]
        raw[to + 1] = rgba[from + 1]
        raw[to + 2] = rgba[from + 2]
      }
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}
```

- [ ] **Step 4: Write `scripts/lib/ios-icon.js`**

```js
// SPDX-License-Identifier: GPL-3.0-only
// murmur's iPhone app icon (ios/prd.json IOS-001): the ensō pill from the
// same geometry and brush as every other icon (scripts/lib/icons.js),
// full bleed on ink because iOS rounds the corners itself, plus the dark
// and tinted versions iOS asks for. Nothing here is committed: npm run
// ios:generate writes it into ios/Generated.
const { encodePng, render } = require('./draw')
const { RasterContext } = require('./raster')
const { cleanEnsoScene, paintBrushedEnso } = require('./enso')
const { markOnInkRgba, RICE, AMBER, EMBER } = require('./icons')

/** The mark alone on transparency: iOS lays its own dark ground under it. */
function markRgba(brush, size) {
  if (!brush) return render(size, cleanEnsoScene(size, { loop: RICE, dot: AMBER }))
  const ctx = new RasterContext(size, size)
  paintBrushedEnso(brush, ctx, size, { loop: RICE, dot: AMBER, splat: EMBER })
  return ctx.toRgba()
}

/** One gray per pixel with alpha kept; iOS tints it with the person's color. */
function grayscale(rgba) {
  const out = Buffer.from(rgba)
  for (let i = 0; i < out.length; i += 4) {
    const y = Math.round(0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2])
    out[i] = y
    out[i + 1] = y
    out[i + 2] = y
  }
  return out
}

const image = (filename, appearance) => ({
  ...(appearance ? { appearances: [{ appearance: 'luminosity', value: appearance }] } : {}),
  filename,
  idiom: 'universal',
  platform: 'ios',
  size: '1024x1024'
})

/** Every file of AppIcon.appiconset, by name. size is 1024 except in tests. */
function iosIconSet(brush, size = 1024) {
  const mark = markRgba(brush, size)
  const contents = {
    images: [image('icon-1024.png'), image('icon-1024-dark.png', 'dark'), image('icon-1024-tinted.png', 'tinted')],
    info: { author: 'xcode', version: 1 }
  }
  return {
    'icon-1024.png': encodePng(size, size, markOnInkRgba(size, size, size, brush), { alpha: false }),
    'icon-1024-dark.png': encodePng(size, size, mark),
    'icon-1024-tinted.png': encodePng(size, size, grayscale(mark)),
    'Contents.json': JSON.stringify(contents, null, 2) + '\n'
  }
}

module.exports = { iosIconSet, grayscale }
```

- [ ] **Step 5: Run the tests to make sure they pass, and that desktop icons are unchanged**

Run: `npx vitest run scripts/lib/ios-icon.test.js scripts/lib/raster.test.js`
Expected: PASS.

Run: `node scripts/gen-icons.js`
Expected: `icons generated: 9 png, icon.icns, icon.ico, 8 tray (brushed mark)`. The RGBA default path is untouched.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add scripts/lib/draw.js scripts/lib/ios-icon.js scripts/lib/ios-icon.test.js
git commit -m "IOS-001: the iPhone app icon, full bleed with dark and tinted versions"
```

---

### Task 3: Driver helpers (simulator, tools, shared copy, smoke line)

**Files:**
- Create: `scripts/lib/ios.js`
- Test: `scripts/lib/ios.test.js`

**Interfaces:**
- Produces:
  - `SMOKE_SIMULATOR = 'murmur smoke'`
  - `SIM_SIGNING: string[]` (xcodebuild settings for ad hoc simulator signing)
  - `pickSmokeSimulator(list) -> { udid } | { create: { name, deviceType, runtime } }`, where `list` is the parsed output of `xcrun simctl list --json devicetypes runtimes devices`
  - `compareVersions(a, b) -> number`
  - `findOnPath(name, pathEnv = process.env.PATH, exists = existsSync) -> string | null`
  - `copySharedJson(src, dest) -> number` (the count of files copied)
  - `parseSmokeLine(output) -> { ok, checks } | null`

- [ ] **Step 1: Check the real `simctl` JSON field names this code relies on**

Run: `xcrun simctl list --json runtimes`
Expected: each runtime has `identifier`, `version` (like `"26.5"`), `platform` (`"iOS"`), `isAvailable`, and `supportedDeviceTypes` (each with `name`, `identifier`, and `productFamily`). If any field name differs, use the real name in the fixture and in the code below.

- [ ] **Step 2: Write the failing test**

```js
// SPDX-License-Identifier: GPL-3.0-only
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compareVersions, copySharedJson, findOnPath, parseSmokeLine, pickSmokeSimulator } from './ios'

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
    expect(findOnPath('xcodegen', undefined, exists)).toBeNull()
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
```

- [ ] **Step 3: Run the test to make sure it fails**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: FAIL, because `./ios` can't be found.

- [ ] **Step 4: Write the implementation**

```js
// SPDX-License-Identifier: GPL-3.0-only
// Helpers for scripts/ios.js (ios/prd.json IOS-001): murmur's own
// simulator, the tools on PATH, the shared rules copy, and the app's
// SMOKE_RESULT line. Pure where it can be, so desktop CI tests it on
// every platform without Xcode.
const { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } = require('node:fs')
const { delimiter, join } = require('node:path')

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
  const type = iphones.find((t) => t.name === 'iPhone 17') || iphones[iphones.length - 1]
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

module.exports = { SMOKE_SIMULATOR, SIM_SIGNING, compareVersions, pickSmokeSimulator, findOnPath, copySharedJson, parseSmokeLine }
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `npx vitest run scripts/lib/ios.test.js`
Expected: PASS (10 tests).

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add scripts/lib/ios.js scripts/lib/ios.test.js
git commit -m "IOS-001: helpers for the iPhone driver: murmur's own simulator, tools, shared copy, smoke line"
```

---

### Task 4: The MurmurCore package

**Files:**
- Create: `ios/MurmurCore/Package.swift`
- Create: `ios/MurmurCore/Sources/MurmurCore/SharedData.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/SharedDataTests.swift`
- Create: `ios/.gitignore`

**Interfaces:**
- Produces (module `MurmurCore`):
  - `public struct SharedData: Sendable { public let directory: URL; public init(directory: URL) }`
  - `public func fileNames() throws -> [String]`: sorted `.json` names
  - `public func data(named: String) throws -> Data`
  - `public func decode<T: Decodable>(_ type: T.Type, from name: String) throws -> T`
  - `public func validateAll() throws -> [String]`: every name, or throws on the first file that isn't JSON
  - `public enum SharedDataError: Error, Equatable, CustomStringConvertible { case missing(String); case invalidJSON(String) }`

- [ ] **Step 1: Write `ios/.gitignore`**

```
# Everything generated by npm run ios:generate or the build. Never committed.
/Generated/
/build/
/murmur.xcodeproj/
/MurmurCore/.build/
/MurmurCore/.swiftpm/
xcuserdata/
```

- [ ] **Step 2: Write `ios/MurmurCore/Package.swift`**

```swift
// swift-tools-version: 6.0
// SPDX-License-Identifier: GPL-3.0-only
// MurmurCore: murmur's rules in Swift, with no UI. The app and the
// keyboard both link it, and swift test runs it on the Mac without a
// simulator (ios/prd.json stack.core).
import PackageDescription

let package = Package(
    name: "MurmurCore",
    platforms: [.iOS("26.0"), .macOS("15.0")],
    products: [.library(name: "MurmurCore", targets: ["MurmurCore"])],
    targets: [
        .target(name: "MurmurCore"),
        .testTarget(name: "MurmurCoreTests", dependencies: ["MurmurCore"])
    ]
)
```

- [ ] **Step 3: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// The repo's shared/ folder, found from this file's own path:
/// MurmurCoreTests, Tests, MurmurCore, ios, then the repo root.
let repoShared = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("shared")

@Suite struct SharedDataTests {
    @Test func listsTheRepoRules() throws {
        let names = try SharedData(directory: repoShared).fileNames()
        #expect(names.contains("format-spec.json"))
        #expect(names.contains("test-vectors.json"))
        #expect(names.contains("provider-catalog.json"))
        #expect(names == names.sorted())
    }

    @Test func everyRepoFileParses() throws {
        let shared = SharedData(directory: repoShared)
        #expect(try shared.validateAll() == shared.fileNames())
    }

    @Test func namesTheFileThatIsNotJSON() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("{}".utf8).write(to: dir.appendingPathComponent("good.json"))
        try Data("{ not json".utf8).write(to: dir.appendingPathComponent("bad.json"))
        try Data("ignored".utf8).write(to: dir.appendingPathComponent("readme.txt"))
        #expect(try SharedData(directory: dir).fileNames() == ["bad.json", "good.json"])
        #expect(throws: SharedDataError.invalidJSON("bad.json")) {
            try SharedData(directory: dir).validateAll()
        }
    }

    @Test func aMissingFileSaysWhich() {
        #expect(throws: SharedDataError.missing("nope.json")) {
            try SharedData(directory: repoShared).data(named: "nope.json")
        }
    }

    @Test func decodesATypedValue() throws {
        struct Catalog: Decodable { let catalogVersion: Int }
        let catalog = try SharedData(directory: repoShared).decode(Catalog.self, from: "provider-catalog.json")
        #expect(catalog.catalogVersion >= 1)
    }
}
```

- [ ] **Step 4: Run the test to make sure it fails**

Run: `swift test --package-path ios/MurmurCore`
Expected: FAIL to compile, with `cannot find 'SharedData' in scope`.

- [ ] **Step 5: Write the implementation**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The shared rules: shared/*.json at the repo root, bundled into the app
// at build time. Swift never keeps its own copy of a rule; everything
// that decides behavior is read from these files (ios/prd.json
// conventions.parity).
import Foundation

public enum SharedDataError: Error, Equatable, CustomStringConvertible {
    case missing(String)
    case invalidJSON(String)

    public var description: String {
        switch self {
        case .missing(let name): "shared rule \(name) is missing"
        case .invalidJSON(let name): "shared rule \(name) is not valid JSON"
        }
    }
}

public struct SharedData: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    /// Every .json file in the folder, sorted by name.
    public func fileNames() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasSuffix(".json") }
            .sorted()
    }

    public func data(named name: String) throws -> Data {
        let url = directory.appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: url.path) else { throw SharedDataError.missing(name) }
        return try Data(contentsOf: url)
    }

    public func decode<T: Decodable>(_ type: T.Type, from name: String) throws -> T {
        try JSONDecoder().decode(type, from: data(named: name))
    }

    /// Parses every file and returns their names; throws for the first
    /// one that is not JSON, naming it.
    public func validateAll() throws -> [String] {
        let names = try fileNames()
        for name in names {
            do {
                _ = try JSONSerialization.jsonObject(with: data(named: name))
            } catch {
                throw SharedDataError.invalidJSON(name)
            }
        }
        return names
    }
}
```

- [ ] **Step 6: Run the test to make sure it passes**

Run: `swift test --package-path ios/MurmurCore`
Expected: PASS (5 tests). `git status` must not show `ios/MurmurCore/.build`.

- [ ] **Step 7: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add ios/.gitignore ios/MurmurCore
git commit -m "IOS-001: MurmurCore, with the shared rules loader"
```

---

### Task 5: The Xcode project, the app, and the keyboard

**Files:**
- Create: `ios/project.yml`
- Create: `ios/App/MurmurApp.swift`, `ios/App/ContentView.swift`, `ios/App/PrivacyInfo.xcprivacy`
- Create: `ios/Keyboard/KeyboardViewController.swift`, `ios/Keyboard/PrivacyInfo.xcprivacy`
- Create: `ios/Shared/AppGroup.swift`
- Create: `ios/AppTests/AppTestsPlaceholder.swift` (Task 6 replaces it)
- Create: `scripts/ios.js` (the `generate` command only)
- Modify: `package.json` (`scripts`: add `ios:generate`)

**Interfaces:**
- Consumes: `parseRootTokens`, `toSwift`, and `colorSetJson` (Task 1); `iosIconSet` (Task 2); `findOnPath` and `copySharedJson` (Task 3); `MurmurCore` (Task 4); `loadBrush` from `scripts/lib/enso.js`.
- Produces: `enum AppGroup { static let identifier: String; static var containerURL: URL? }` (shared by both targets); the generated `enum Tokens`; the app module `murmur`; the keyboard principal class `KeyboardViewController`; the scheme `murmur` with test target `murmurTests`; and, in `scripts/ios.js`, `generateAll() -> Promise<number>` (the shared file count), plus the helpers `run(cmd, args, options)`, which throws on a non-zero exit, and `need(tool, hint)`.

- [ ] **Step 1: Install XcodeGen (one time per Mac)**

Run: `brew install xcodegen`, then `xcodegen --version`
Expected: a version of 2.40 or later.

- [ ] **Step 2: Write `ios/project.yml`**

```yaml
# SPDX-License-Identifier: GPL-3.0-only
# murmur for iPhone as an XcodeGen recipe (ios/prd.json IOS-001).
# npm run ios:generate turns this into murmur.xcodeproj, which is
# git-ignored: change this file, never the project.
name: murmur
options:
  bundleIdPrefix: com.lbwalton.murmur
  deploymentTarget:
    iOS: "26.0"
  createIntermediateGroups: true
settings:
  base:
    DEVELOPMENT_TEAM: 4B55ZVBVKN
    CODE_SIGN_STYLE: Automatic
    SWIFT_VERSION: "6.0"
    MARKETING_VERSION: "0.1.0"
    CURRENT_PROJECT_VERSION: "1"
    TARGETED_DEVICE_FAMILY: "1"
packages:
  MurmurCore:
    path: MurmurCore
targets:
  murmur:
    type: application
    platform: iOS
    sources:
      - path: App
      - path: Shared
      - path: Generated/Tokens.swift
      - path: Generated/Assets.xcassets
      - path: Generated/shared
        type: folder
        buildPhase: resources
    dependencies:
      - target: murmurKeyboard
      - package: MurmurCore
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.lbwalton.murmur.ios
        PRODUCT_NAME: murmur
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
    info:
      path: Generated/App-Info.plist
      properties:
        CFBundleDisplayName: murmur
        CFBundleShortVersionString: $(MARKETING_VERSION)
        CFBundleVersion: $(CURRENT_PROJECT_VERSION)
        ITSAppUsesNonExemptEncryption: false
        LSRequiresIPhoneOS: true
        NSMicrophoneUsageDescription: murmur listens only while you dictate and sends what you say to the provider you chose.
        UIBackgroundModes: [audio]
        UILaunchScreen:
          UIColorName: LaunchInk
        UIApplicationSceneManifest:
          UIApplicationSupportsMultipleScenes: false
        UISupportedInterfaceOrientations: [UIInterfaceOrientationPortrait]
    entitlements:
      path: Generated/murmur.entitlements
      properties:
        com.apple.security.application-groups:
          - group.com.lbwalton.murmur
  murmurKeyboard:
    type: app-extension
    platform: iOS
    sources:
      - path: Keyboard
      - path: Shared
      - path: Generated/Tokens.swift
    dependencies:
      - package: MurmurCore
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.lbwalton.murmur.ios.keyboard
        PRODUCT_NAME: murmurKeyboard
    info:
      path: Generated/Keyboard-Info.plist
      properties:
        CFBundleDisplayName: murmur
        CFBundleShortVersionString: $(MARKETING_VERSION)
        CFBundleVersion: $(CURRENT_PROJECT_VERSION)
        NSExtension:
          NSExtensionPointIdentifier: com.apple.keyboard-service
          NSExtensionPrincipalClass: $(PRODUCT_MODULE_NAME).KeyboardViewController
          NSExtensionAttributes:
            IsASCIICapable: false
            PrefersRightToLeft: false
            PrimaryLanguage: en-US
            RequestsOpenAccess: true
    entitlements:
      path: Generated/murmurKeyboard.entitlements
      properties:
        com.apple.security.application-groups:
          - group.com.lbwalton.murmur
  murmurTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: AppTests
    dependencies:
      - target: murmur
    settings:
      base:
        GENERATE_INFOPLIST_FILE: YES
        PRODUCT_BUNDLE_IDENTIFIER: com.lbwalton.murmur.ios.tests
        TEST_HOST: $(BUILT_PRODUCTS_DIR)/murmur.app/murmur
        BUNDLE_LOADER: $(TEST_HOST)
schemes:
  murmur:
    build:
      targets:
        murmur: all
        murmurTests: [test]
    test:
      targets:
        - murmurTests
```

- [ ] **Step 3: Write the Swift sources**

`ios/Shared/AppGroup.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The shared drawer between the app and the keyboard (the app group
// group.com.lbwalton.murmur): settings the keyboard needs, the mailbox,
// and the levels file. History never goes here; the keyboard sees only
// the newest take (ios/prd.json conventions.privacy).
import Foundation

enum AppGroup {
    static let identifier = "group.com.lbwalton.murmur"

    /// The group's container, or nil when the entitlement is missing.
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
```

`ios/App/MurmurApp.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// murmur for iPhone. The app holds the microphone, the key, the cleanup,
// and the history; the keyboard extension stays thin (ios/prd.json).
import SwiftUI

@main
struct MurmurApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

`ios/App/ContentView.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it.
struct ContentView: View {
    var body: some View {
        Text("murmur")
            .font(.largeTitle.weight(.semibold))
            .foregroundStyle(Tokens.brand)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Tokens.ink)
    }
}

#Preview {
    ContentView()
}
```

`ios/Keyboard/KeyboardViewController.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard. For now a quiet placeholder with the one key Apple
// requires, the switch to the next keyboard; the dictation pad arrives in
// IOS-008.
import SwiftUI
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let nextKeyboard = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(Tokens.panel)

        let label = UILabel()
        label.text = "murmur"
        label.textColor = UIColor(Tokens.textDim)
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true

        nextKeyboard.setImage(UIImage(systemName: "globe"), for: .normal)
        nextKeyboard.tintColor = UIColor(Tokens.text)
        nextKeyboard.accessibilityLabel = "Next keyboard"
        nextKeyboard.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        for subview in [label, nextKeyboard] {
            subview.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(subview)
        }
        let height = view.heightAnchor.constraint(equalToConstant: 216)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            height,
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            nextKeyboard.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 8),
            nextKeyboard.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8),
            nextKeyboard.widthAnchor.constraint(equalToConstant: 44),
            nextKeyboard.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        nextKeyboard.isHidden = !needsInputModeSwitchKey
    }
}
```

`ios/AppTests/AppTestsPlaceholder.swift` (an empty target fails to build; Task 6 replaces this):

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Testing

@Test func theTestTargetBuilds() {
    #expect(Bool(true))
}
```

- [ ] **Step 4: Write both privacy manifests**

`ios/App/PrivacyInfo.xcprivacy` and `ios/Keyboard/PrivacyInfo.xcprivacy`, with identical content. They declare no tracking, no collected data, and no required-reason APIs yet; later stories add each API as they use it.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
</dict>
</plist>
```

- [ ] **Step 5: Write `scripts/ios.js` with the `generate` command**

```js
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
```

- [ ] **Step 6: Add the npm script**

In `package.json` `scripts`, after `"roadmap"`, add:

```json
    "ios:generate": "node scripts/ios.js generate",
```

- [ ] **Step 7: Generate and check that a missing tool gets a clear message**

Run: `PATH=/usr/bin:/bin node scripts/ios.js generate`
Expected: exits 1 with `ios: xcodegen is not installed. Install it with: brew install xcodegen`, and no stack trace.

Run: `npm run ios:generate`
Expected: `ios: generated the colors, the brushed icon, 8 shared rules, and murmur.xcodeproj` (the count is however many `shared/*.json` files exist). `git status --short` shows no files under `ios/Generated` or `ios/murmur.xcodeproj`.

- [ ] **Step 8: Build for the simulator and check what landed in the bundles**

Run: `xcodebuild build -project ios/murmur.xcodeproj -scheme murmur -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/build/DerivedData -quiet CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER=`
Expected: exits 0.

Then check the built app (`APP=ios/build/DerivedData/Build/Products/Debug-iphonesimulator/murmur.app`):

```bash
plutil -extract CFBundleDisplayName raw "$APP/Info.plist"
plutil -extract CFBundleDisplayName raw "$APP/PlugIns/murmurKeyboard.appex/Info.plist"
plutil -extract NSExtension.NSExtensionAttributes.RequestsOpenAccess raw "$APP/PlugIns/murmurKeyboard.appex/Info.plist"
plutil -extract UIBackgroundModes.0 raw "$APP/Info.plist"
plutil -extract ITSAppUsesNonExemptEncryption raw "$APP/Info.plist"
ls "$APP/PrivacyInfo.xcprivacy" "$APP/PlugIns/murmurKeyboard.appex/PrivacyInfo.xcprivacy" "$APP/shared/format-spec.json"
codesign -d --entitlements - "$APP"
```

Expected: `murmur`, `murmur`, `true`, `audio`, `false`; the three files are listed; the entitlements include `group.com.lbwalton.murmur`. If either `PrivacyInfo.xcprivacy` is missing, the installed XcodeGen doesn't put `.xcprivacy` files into resources by itself. In that case, change that target's source entry in `project.yml` to exclude the file and add it again with `buildPhase: resources`, then regenerate and rebuild.

- [ ] **Step 9: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add ios/project.yml ios/App ios/Keyboard ios/Shared ios/AppTests scripts/ios.js package.json
git commit -m "IOS-001: the Xcode project, generated from ios/project.yml: the app, the keyboard, and the shared drawer"
```

---

### Task 6: App tests and `npm run ios:test`

**Files:**
- Create: `ios/App/KeychainStore.swift`
- Delete: `ios/AppTests/AppTestsPlaceholder.swift`
- Test: `ios/AppTests/KeychainStoreTests.swift`, `ios/AppTests/AppGroupTests.swift`
- Modify: `scripts/ios.js` (add `simulator()`, `shutdown()`, and the `test` command)
- Modify: `package.json` (add `ios:test`)

**Interfaces:**
- Consumes: `AppGroup` (Task 5); `pickSmokeSimulator`, `SIM_SIGNING` (Task 3); `generateAll`, `run` (Task 5).
- Produces: `struct KeychainStore: Sendable { let service: String; func save(_ value: String, account: String) throws; func read(account: String) throws -> String?; func delete(account: String) throws }`, `enum KeychainError: Error, Equatable { case status(OSStatus); case unexpectedData }`. In `scripts/ios.js`: `simulator() -> string` (a booted udid) and `shutdown(udid)`.

- [ ] **Step 1: Write the failing tests**

`ios/AppTests/KeychainStoreTests.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Security
import Testing
@testable import murmur

@Suite(.serialized) struct KeychainStoreTests {
    let store = KeychainStore(service: "com.lbwalton.murmur.ios.tests")

    @Test func savesReadsAndDeletes() throws {
        let account = "round-trip"
        defer { try? store.delete(account: account) }
        try store.save("first", account: account)
        #expect(try store.read(account: account) == "first")
        try store.delete(account: account)
        #expect(try store.read(account: account) == nil)
    }

    @Test func savingAgainReplacesTheValue() throws {
        let account = "replace"
        defer { try? store.delete(account: account) }
        try store.save("old", account: account)
        try store.save("new", account: account)
        #expect(try store.read(account: account) == "new")
    }

    @Test func readingOrDeletingNothingIsNotAnError() throws {
        #expect(try store.read(account: "never-saved") == nil)
        try store.delete(account: "never-saved")
    }

    @Test func itemsStayOnThisDeviceAndOpenAfterFirstUnlock() throws {
        let account = "accessibility"
        defer { try? store.delete(account: account) }
        try store.save("value", account: account)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: store.service,
            kSecAttrAccount: account,
            kSecReturnAttributes: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        #expect(SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess)
        let attributes = try #require(item as? [String: Any])
        #expect(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    }
}
```

`ios/AppTests/AppGroupTests.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Test func theSharedDrawerOpens() throws {
    let container = try #require(AppGroup.containerURL)
    let probe = container.appendingPathComponent("test-\(UUID().uuidString).txt")
    defer { try? FileManager.default.removeItem(at: probe) }
    try Data("murmur".utf8).write(to: probe)
    #expect(try String(contentsOf: probe, encoding: .utf8) == "murmur")
}
```

Delete `ios/AppTests/AppTestsPlaceholder.swift`.

- [ ] **Step 2: Add the `test` command to `scripts/ios.js`**

Add `execFileSync` to the `node:child_process` import, and `pickSmokeSimulator` and `SIM_SIGNING` to the `./lib/ios` import. Add `project` and `derived` constants beside `generated`, and these functions above `COMMANDS`:

```js
const project = join(iosDir, 'murmur.xcodeproj')
const derived = join(iosDir, 'build', 'DerivedData')

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
```

Add `test` to `COMMANDS`, and update the header comment:

```js
//   node scripts/ios.js test       MurmurCore on the Mac, then the app's tests on murmur's own simulator
```

In `package.json` `scripts`, add `"ios:test": "node scripts/ios.js test",` after `ios:generate`.

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `npm run ios:test`
Expected: MurmurCore passes, then the app test build FAILS with `cannot find 'KeychainStore' in scope`.

- [ ] **Step 4: Write `ios/App/KeychainStore.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The app's own Keychain items (ios/prd.json conventions.privacy):
// readable after first unlock, so a session behind the Lock Screen can
// still reach the key, on this device only, never synced or restored to
// another device. No access group is set, so items land in the app's own
// group and the keyboard extension can never read them.
import Foundation
import Security

enum KeychainError: Error, Equatable {
    case status(OSStatus)
    case unexpectedData
}

struct KeychainStore: Sendable {
    let service: String

    func save(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let status = SecItemUpdate(baseQuery(account) as CFDictionary, [kSecValueData: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery(account)
            add[kSecValueData] = data
            add[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            try check(SecItemAdd(add as CFDictionary, nil))
        } else {
            try check(status)
        }
    }

    func read(account: String) throws -> String? {
        var query = baseQuery(account)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        try check(status)
        guard let data = item as? Data else { throw KeychainError.unexpectedData }
        return String(decoding: data, as: UTF8.self)
    }

    func delete(account: String) throws {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        if status == errSecItemNotFound { return }
        try check(status)
    }

    private func baseQuery(_ account: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }

    private func check(_ status: OSStatus) throws {
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }
}
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npm run ios:test`
Expected: MurmurCore 5 tests pass, then the app's 5 tests pass, then `murmur smoke` shuts down. Confirm that `xcrun simctl list devices booted` still shows any simulators that were booted before.

If the Keychain tests fail with `status(-34018)` (a missing entitlement), or the app group test finds a nil container, the simulator signature isn't carrying the entitlements, or the tests aren't hosted in the app. Stop and investigate with superpowers:systematic-debugging before changing anything. Start with `codesign -d --entitlements - ios/build/DerivedData/Build/Products/Debug-iphonesimulator/murmur.app` and the `TEST_HOST` setting in `project.yml`. Never loosen a test to get past it. Whatever fixes it must also work on CI, which has no signing certificates, so record the cause and the fix in IOS-001's notes.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
git pull --rebase origin main
git add ios/App/KeychainStore.swift ios/AppTests scripts/ios.js package.json
git commit -m "IOS-001: the app's Keychain store, and npm run ios:test on murmur's own simulator"
```

---

### Task 7: The headless smoke

**Files:**
- Create: `ios/App/Smoke/SmokeRunner.swift`
- Modify: `ios/App/MurmurApp.swift` (run the smoke when launched with `--smoke`)
- Test: `ios/AppTests/SmokeRequestTests.swift`
- Modify: `scripts/ios.js` (the `smoke` command)
- Modify: `package.json` (add `ios:smoke`)

**Interfaces:**
- Consumes: `KeychainStore` (Task 6), `AppGroup` (Task 5), `SharedData` (Task 4); `simulator`, `shutdown`, `onSimulator`, and `generateAll` (Tasks 5 and 6); `parseSmokeLine` (Task 3).
- Produces: `struct SmokeRequest: Equatable { let sharedCount: Int; init?(arguments: [String]) }` and `enum SmokeRunner { static func runAndExit(_ request: SmokeRequest) -> Never }`. The app prints `SMOKE_RESULT {"checks":{"appGroup":true,"keychain":true,"sharedJson":true},"ok":true}`. Later stories add a named check here for each subsystem.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import murmur

@Suite struct SmokeRequestTests {
    @Test func anOrdinaryLaunchIsNotASmoke() {
        #expect(SmokeRequest(arguments: ["murmur"]) == nil)
    }

    @Test func readsTheSharedCount() {
        #expect(SmokeRequest(arguments: ["murmur", "--smoke", "--shared-count=8"])?.sharedCount == 8)
    }

    @Test func aMissingCountCanNeverMatch() {
        #expect(SmokeRequest(arguments: ["murmur", "--smoke"])?.sharedCount == -1)
    }
}
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npm run ios:test`
Expected: FAIL with `cannot find 'SmokeRequest' in scope`.

- [ ] **Step 3: Write `ios/App/Smoke/SmokeRunner.swift`**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The headless smoke (npm run ios:smoke): launched with --smoke, the app
// runs every subsystem check, prints one SMOKE_RESULT line, and exits.
// The same contract as desktop's smoke: {"ok": Bool, "checks": {name: Bool}},
// and a failed check explains itself on a line starting "smoke <name>:".
import Foundation
import MurmurCore

struct SmokeRequest: Equatable {
    /// How many shared rule files the build bundled; -1 when not given,
    /// which no real count matches.
    let sharedCount: Int

    /// Nil unless the app was launched with --smoke.
    init?(arguments: [String]) {
        guard arguments.contains("--smoke") else { return nil }
        let prefix = "--shared-count="
        sharedCount = arguments.lazy
            .filter { $0.hasPrefix(prefix) }
            .compactMap { Int($0.dropFirst(prefix.count)) }
            .first ?? -1
    }
}

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

enum SmokeRunner {
    static func runAndExit(_ request: SmokeRequest) -> Never {
        let checks: [(name: String, run: () throws -> Void)] = [
            ("appGroup", checkAppGroup),
            ("keychain", checkKeychain),
            ("sharedJson", { try checkSharedJson(expected: request.sharedCount) })
        ]
        var results: [String: Bool] = [:]
        for check in checks {
            do {
                try check.run()
                results[check.name] = true
            } catch {
                results[check.name] = false
                emit("smoke \(check.name): \(error)")
            }
        }
        let ok = results.values.allSatisfy { $0 }
        let payload: [String: Any] = ["ok": ok, "checks": results]
        let json = (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])) ?? Data()
        emit("SMOKE_RESULT " + String(decoding: json, as: UTF8.self))
        exit(ok ? 0 : 1)
    }

    /// Unbuffered, so nothing is lost when the app exits right after.
    private static func emit(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    static func checkAppGroup() throws {
        guard let container = AppGroup.containerURL else {
            throw SmokeFailure("no container for \(AppGroup.identifier)")
        }
        let probe = container.appendingPathComponent("smoke-\(UUID().uuidString).txt")
        defer { try? FileManager.default.removeItem(at: probe) }
        try Data("murmur smoke".utf8).write(to: probe)
        let back = try String(contentsOf: probe, encoding: .utf8)
        guard back == "murmur smoke" else { throw SmokeFailure("read back \(back)") }
    }

    static func checkKeychain() throws {
        let store = KeychainStore(service: "com.lbwalton.murmur.ios.smoke")
        let account = "smoke"
        defer { try? store.delete(account: account) }
        try store.save("not-a-real-key", account: account)
        guard try store.read(account: account) == "not-a-real-key" else {
            throw SmokeFailure("read back a different value")
        }
        try store.delete(account: account)
        guard try store.read(account: account) == nil else {
            throw SmokeFailure("delete left the item behind")
        }
    }

    static func checkSharedJson(expected: Int) throws {
        guard let directory = Bundle.main.url(forResource: "shared", withExtension: nil) else {
            throw SmokeFailure("no shared folder in the app bundle")
        }
        let names = try SharedData(directory: directory).validateAll()
        guard names.count == expected else {
            throw SmokeFailure("bundled \(names.count) shared rules, expected \(expected)")
        }
    }
}
```

- [ ] **Step 4: Run the smoke from the app's entry point**

Replace the body of `ios/App/MurmurApp.swift`'s `MurmurApp` with:

```swift
@main
struct MurmurApp: App {
    init() {
        if let request = SmokeRequest(arguments: ProcessInfo.processInfo.arguments) {
            SmokeRunner.runAndExit(request)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

- [ ] **Step 5: Add the `smoke` command to `scripts/ios.js`**

Add `parseSmokeLine` to the `./lib/ios` import, a `BUNDLE_ID` constant, and:

```js
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
```

Add `smoke` to `COMMANDS`, add a header comment line (`//   node scripts/ios.js smoke      boots the app headless and relays its SMOKE_RESULT`), and add `"ios:smoke": "node scripts/ios.js smoke",` to `package.json` `scripts`.

- [ ] **Step 6: Run the tests and the smoke**

Run: `npm run ios:test`
Expected: PASS, including the 3 `SmokeRequestTests`.

Run: `npm run ios:smoke`
Expected: the last line is `SMOKE_RESULT {"checks":{"appGroup":true,"keychain":true,"sharedJson":true},"ok":true}` and the exit code is 0.

- [ ] **Step 7: Prove the smoke can fail**

Temporarily add `ios/Generated/shared/broken.json` holding `{ nope`, then run the smoke steps by hand without regenerating:

```bash
UDID=$(xcrun simctl list devices available | sed -n 's/.*murmur smoke (\([^)]*\)).*/\1/p' | head -1)
xcrun simctl bootstatus "$UDID" -b
xcodebuild build -project ios/murmur.xcodeproj -scheme murmur -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath ios/build/DerivedData -quiet CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER=
xcrun simctl install "$UDID" ios/build/DerivedData/Build/Products/Debug-iphonesimulator/murmur.app
xcrun simctl launch --console "$UDID" com.lbwalton.murmur.ios --smoke --shared-count=9
xcrun simctl shutdown "$UDID"
```

Expected: `smoke sharedJson: shared rule broken.json is not valid JSON` and `"ok":false`. Then run `npm run ios:generate`; regenerating clears the stray file.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git pull --rebase origin main
git add ios/App ios/AppTests scripts/ios.js package.json
git commit -m "IOS-001: the headless smoke: app group, Keychain, and the bundled shared rules"
```

---

### Task 8: The design and license lints cover ios/

**Files:**
- Modify: `scripts/check-headers.js` (`ROOTS`, `EXTENSIONS`, and the `walk` skip list)
- Modify: `scripts/check-design.js` (a Swift pass)

**Interfaces:**
- Consumes: nothing new. Produces: `npm run test` failing on any Swift file under `ios/` that lacks the SPDX header, or that holds a hex color or a `Color(red:...)`-style constructor outside `ios/Generated`.

- [ ] **Step 1: Show both lints miss Swift today**

```bash
printf 'import SwiftUI\nlet probe = Color(red: 1, green: 0, blue: 0)\nlet hex = "#ff0000"\n' > ios/App/LintProbe.swift
npm run check:headers
npm run check:design
```

Expected: both PASS. That's the gap this task closes.

- [ ] **Step 2: Extend `scripts/check-headers.js`**

Change `ROOTS`, `EXTENSIONS`, and `walk` to:

```js
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
```

- [ ] **Step 3: Extend `scripts/check-design.js`**

Update the header comment's first sentence to say: `Design lint: raw colors may live ONLY in src/renderer/tokens.css (Swift reads them from ios/Generated/Tokens.swift, generated from it).` Then, after the existing renderer and site loop and before the `if (violations.length > 0)` block, add:

```js
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
```

Change the failure message line to `console.error('design lint: raw color outside tokens.css')`.

- [ ] **Step 4: Show both lints now catch the probe**

```bash
npm run check:headers
npm run check:design
```

Expected: `check:headers` fails listing `ios/App/LintProbe.swift`; `check:design` fails listing `ios/App/LintProbe.swift:2  Color(red:` and `ios/App/LintProbe.swift:3  #ff0000`.

- [ ] **Step 5: Remove the probe and confirm everything else is clean**

```bash
rm ios/App/LintProbe.swift
npm run test
```

Expected: `headers: every source file declares GPL-3.0-only`, `design lint: clean, all color flows through tokens.css`, and every vitest test passes.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck
npm run ios:test
npm run ios:smoke
git pull --rebase origin main
git add scripts/check-headers.js scripts/check-design.js
git commit -m "IOS-001: the license and design lints cover the iPhone app"
```

---

### Task 9: The docs: ios/README.md, README.md, CONTRIBUTING.md

**Files:**
- Create: `ios/README.md`
- Create: `CONTRIBUTING.md`
- Modify: `README.md` (a new `## murmur on iPhone` section after `## Build from source`, and a new `## Contributing` section before `## License`)

**Interfaces:** none (prose only).

- [ ] **Step 1: Write `ios/README.md`**

````markdown
# murmur for iPhone

The iPhone app: a keyboard that is a dictation pad around the waveform pill, backed by the murmur app, which holds the microphone, your key, the cleanup, and your history. The plan is [prd.json](prd.json); progress is [ROADMAP.md](ROADMAP.md). It is not on the App Store yet.

## What do I need to build it?

- A Mac with Xcode 26 or later, and an iOS 26 or later simulator runtime (Xcode, Settings, Components)
- Node 22 or later, and `npm install` run once at the repo root
- XcodeGen: `brew install xcodegen`

## How do I build and test it?

```
npm run ios:generate   # the colors, the icon, the shared rules, and ios/murmur.xcodeproj
open ios/murmur.xcodeproj
npm run ios:test       # MurmurCore's tests on the Mac, then the app's tests on a simulator
npm run ios:smoke      # builds the app, launches it headless, and prints SMOKE_RESULT
```

The tests and the smoke run on murmur's own simulator, named murmur smoke, created the first time and shut down afterward. Other simulators are left alone.

Nothing generated is committed: `ios/Generated`, `ios/build`, and `ios/murmur.xcodeproj` are rebuilt from `ios/project.yml`, `src/renderer/tokens.css`, the icon scripts, and `shared/`. Change those, never the generated files.

## How is it laid out?

- `project.yml`: the XcodeGen recipe for the app (`murmur`), the keyboard (`murmurKeyboard`), and the tests (`murmurTests`)
- `MurmurCore/`: murmur's rules in Swift, with no UI, tested by `swift test`
- `App/`: the app, which owns the microphone, the key, and history
- `Keyboard/`: the keyboard extension, which stays thin and never touches the network
- `Shared/`: code both targets compile, such as the app group (the shared drawer between them)

## Can I put my own build on my iPhone?

Yes. Change `DEVELOPMENT_TEAM` and the three identifiers in `project.yml` (the app, the keyboard, and the app group) to your own, run `npm run ios:generate`, and build from Xcode. Simulator builds need no Apple account at all.
````

- [ ] **Step 2: Write `CONTRIBUTING.md`**

```markdown
# Contributing to murmur

murmur's source is open so anyone can read it, learn from it, and build it for themselves. murmur does not accept outside code: pull requests are closed without being merged. That keeps Eze Media LLC the sole copyright holder, which is what lets murmur ship on the App Store as well as under the GPL.

## What helps

- **Bug reports.** Open an issue with the steps that cause it and what you expected. For the desktop app, attach the diagnostics report: [how to save one](docs/troubleshooting.md).
- **Ideas and requests.** Open an issue and describe what you were trying to do. The why matters more than the how.

## Building it yourself

- Desktop: see Build from source in [README.md](README.md).
- iPhone: see [ios/README.md](ios/README.md).
```

- [ ] **Step 3: Add the two README sections**

After the `## Build from source` section and before `## Project process`, add:

```markdown
## murmur on iPhone

The iPhone app is being built in [ios/](ios/): a keyboard that is a dictation pad, backed by the murmur app. It is not on the App Store yet. Its plan is [ios/prd.json](ios/prd.json), and you can build it yourself with [ios/README.md](ios/README.md).
```

Before `## License`, add:

```markdown
## Contributing

murmur does not accept outside code; issues and ideas are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
```

- [ ] **Step 4: Check the copy rules**

Run: `grep -nE "—|–| - |Murmur[^C]" ios/README.md CONTRIBUTING.md README.md`
Expected: no lines from the new text. Lines that use `-` as a list bullet at the start of a line are fine.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add ios/README.md CONTRIBUTING.md README.md
git commit -m "IOS-001: how to build murmur for iPhone, and murmur accepts no outside code"
```

---

### Task 10: Register the identifiers, and IOS-001 passes

**Files:**
- Modify: `scripts/ios.js` (the `register` command)
- Modify: `package.json` (add `ios:register`)
- Modify: `ios/prd.json` (IOS-001 `passes` and `notes`), then regenerate `ios/ROADMAP.md`

**Interfaces:**
- Consumes: `generateAll`, `run` (Task 5); the environment variables `APPLE_API_KEY` (the path to the .p8), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`, which `~/.zshenv` loads from `~/.config/apple-notary/env`. Never print their values.

- [ ] **Step 1: Add the `register` command**

```js
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
```

Add `register` to `COMMANDS`, add a header comment line (`//   node scripts/ios.js register   one device build that registers the bundle ids and app group`), and add `"ios:register": "node scripts/ios.js register",` to `package.json`.

- [ ] **Step 2: Register**

Run: `npm run ios:register`
Expected: `ios: both bundle ids and the app group are registered under Eze Media LLC`.

If it fails, act on the error and record what happened in IOS-001's notes:
- **The key isn't allowed to manage identifiers or profiles.** Add to HANDOFF.md and the chat reply: "(1) Open Xcode. (2) Xcode menu, Settings, Accounts. (3) Click the plus at the bottom left, choose Apple Account, and sign in as lbwalton@gmail.com. (4) Tell Claude it's done." Then run `node scripts/ios.js register --xcode-account`.
- **Your team has no devices.** Add to HANDOFF.md and the chat reply: "(1) Plug your iPhone into the Mac with a cable. (2) Unlock it and tap Trust if it asks. (3) On the iPhone, Settings, Privacy and Security, Developer Mode, turn it on and restart when asked. (4) Tell Claude it's done." Then rerun.
- **The app group can't be created automatically.** Add the app group in HANDOFF.md: "(1) Go to developer.apple.com/account and sign in as lbwalton@gmail.com. (2) Certificates, IDs and Profiles, then Identifiers, then the plus button. (3) Choose App Groups, Continue. (4) Description: murmur; Identifier: group.com.lbwalton.murmur. Continue, then Register. (5) Tell Claude it's done." Then rerun.

- [ ] **Step 3: Confirm the desktop gates still never need Xcode**

Run: `grep -n "ios" package.json`
Expected: only the `ios:` scripts mention it; `postinstall` is unchanged (`node scripts/gen-icons.js && node scripts/fetch-display-face.js`). `npm run test` exercises `scripts/lib/ios*.test.js` without calling `xcrun` or `xcodebuild`.

- [ ] **Step 4: Mark IOS-001 passed**

Check every IOS-001 criterion against what was verified in Tasks 1 to 10. In `ios/prd.json`, set IOS-001 `passes` to `true`, and write `notes` saying how each criterion was verified: the test counts, the plutil and codesign checks from Task 5 Step 8, the smoke result line, the lint probes from Task 8, the register result, and any fallback used in Task 6 Step 5 or Task 10 Step 2. Then run `npm run roadmap`.

- [ ] **Step 5: Gates and commit**

```bash
npm run typecheck
npm run test
npm run ios:test
npm run ios:smoke
git pull --rebase origin main
git add scripts/ios.js package.json ios/prd.json ios/ROADMAP.md HANDOFF.md
git commit -m "IOS-001 passes: the scaffold, its tests and smoke, and the identifiers registered"
```

---

### Task 11: CI on a Mac (IOS-002)

**Files:**
- Create: `.github/workflows/ios.yml`
- Modify: `ios/prd.json` (IOS-002 `passes` and `notes`), then regenerate `ios/ROADMAP.md`

**Interfaces:**
- Consumes: `npm run ios:test` and `npm run ios:smoke` (Tasks 6 and 7).

- [ ] **Step 1: Write `.github/workflows/ios.yml`**

```yaml
# The iPhone gates (ios/prd.json IOS-002): MurmurCore's tests, the app's
# tests, and the headless smoke on a Mac, whenever iPhone code, the
# shared rules, or what the iPhone build generates from changes.
# Desktop's gates stay in ci.yml. macos-26's default Xcode is 26.6 with
# the iOS 26.5 simulator (runner image checked 2026-10-10).
name: ios

on:
  push:
    branches: [main]
    paths:
      - 'ios/**'
      - 'shared/**'
      - 'scripts/**'
      - 'src/renderer/tokens.css'
      - 'src/renderer/brush.ts'
      - 'package.json'
      - '.github/workflows/ios.yml'
  pull_request:
    paths:
      - 'ios/**'
      - 'shared/**'
      - 'scripts/**'
      - 'src/renderer/tokens.css'
      - 'src/renderer/brush.ts'
      - 'package.json'
      - '.github/workflows/ios.yml'

jobs:
  ios:
    runs-on: macos-26
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: brew install xcodegen
      - run: npm run ios:test
      - run: npm run ios:smoke
```

- [ ] **Step 2: Gates and commit**

```bash
npm run typecheck
npm run test
git pull --rebase origin main
git add .github/workflows/ios.yml
git commit -m "IOS-002: CI runs the iPhone tests and smoke on a Mac"
```

- [ ] **Step 3: Review gate, then ask LaBroi before the first push**

Dispatch an independent reviewer agent over `git diff main...feature/ios` against CLAUDE.md, DESIGN.md, and `ios/prd.json` conventions. Fix confirmed findings and re-run every gate. Escalate disputed findings to LaBroi. Then ask LaBroi, in plain words, whether `feature/ios` can go to GitHub (the repo is public) with a draft pull request into main, so CI can run. Do not push without his yes.

- [ ] **Step 4: Push and open the draft pull request (after his yes)**

```bash
git push -u origin feature/ios
gh pr create --draft --base main --head feature/ios --title "murmur for iPhone (in progress)" --body "Building ios/prd.json story by story. Draft until LaBroi says to merge."
gh pr checks --watch
```

Expected: the `ios` job and both `ci.yml` jobs pass.

- [ ] **Step 5: Prove a broken test turns CI red**

```bash
git switch -c scratch/ios-ci-red
```

Add `#expect(Bool(false), "deliberate CI check")` inside `listsTheRepoRules` in `ios/MurmurCore/Tests/MurmurCoreTests/SharedDataTests.swift`, then:

```bash
git commit -am "scratch: a deliberate failing test to prove CI turns red"
git push -u origin scratch/ios-ci-red
gh pr create --draft --base feature/ios --head scratch/ios-ci-red --title "scratch: CI red check" --body "Deliberate failure for IOS-002; closed and deleted once proven."
gh pr checks --watch
```

Expected: the `ios` job FAILS at `npm run ios:test`. Then revert the commit, push, and watch it go green:

```bash
git revert --no-edit HEAD
git push
gh pr checks --watch
```

Expected: the `ios` job passes. Then close the scratch PR and delete the branch:

```bash
gh pr close scratch/ios-ci-red --delete-branch
git switch feature/ios
git branch -D scratch/ios-ci-red
```

- [ ] **Step 6: IOS-002 passes**

In `ios/prd.json`, set IOS-002 `passes` to `true`, with `notes` that link both runs (the red one and the green one) and confirm `ci.yml` is unchanged (`git diff main -- .github/workflows/ci.yml` is empty). Run `npm run roadmap`, then the gates, then:

```bash
git pull --rebase origin main
git add ios/prd.json ios/ROADMAP.md
git commit -m "IOS-002 passes: CI turns red on a broken iPhone test and green on the fix"
git push
```

---

### Task 12: The App Store Connect record (IOS-004, LaBroi)

**Files:**
- Modify: `HANDOFF.md` (the steps), then `ios/prd.json` (IOS-004) and `prd.json` (US-034), then both roadmaps

- [ ] **Step 1: Put the steps in HANDOFF.md and in the chat reply**

Add under `## Now`:

```markdown
- [ ] IOS-004 the App Store Connect record for murmur on iPhone (added YYYY-MM-DD, the day this line is written). (1) Go to appstoreconnect.apple.com and sign in as lbwalton@gmail.com. (2) Click Apps, then the blue plus button at the top left, then New App. (3) Check iOS. Name: murmur. If App Store Connect says the name is taken, try murmur dictation, keeping murmur lowercase. Primary language: English (U.S.). Bundle ID: pick com.lbwalton.murmur.ios from the list. SKU: murmur-ios. User access: Full Access. Click Create. (4) Open the new app's TestFlight tab, click the plus beside Internal Testing, name the group murmur team, and add yourself (lbwalton@gmail.com). (5) Tell Claude the store name you ended up with. The old Undertone Voice Dictation record stays as it is.
```

Write the same five steps in the chat reply as a numbered list.

- [ ] **Step 2: When LaBroi confirms, close IOS-004 and US-034**

In `ios/prd.json`, set IOS-004 `passes` to `true`, with `notes` naming the store name, the date, and that the bundle id appeared in the list (which proves Task 10's registration). In `prd.json`, set US-034 `passes` to `true`, adding to its `notes`: `IOS-004 created the App Store Connect record on YYYY-MM-DD (store name: the name LaBroi reported).`, with the real date and name filled in. Tick the HANDOFF item. Run `npm run roadmap`, then the gates, then:

```bash
git pull --rebase origin main
git add ios/prd.json ios/ROADMAP.md prd.json ROADMAP.md HANDOFF.md
git commit -m "IOS-004 and US-034 pass: murmur has its own App Store Connect record"
```

Push only with LaBroi's OK, after the review gate.
