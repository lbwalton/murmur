# App Store launch (IOS-026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything murmur needs to go up for App Review is written, generated, and checked in the repo, so LaBroi's part is filing it in App Store Connect, creating the review key, approving the site deploy, and submitting.

**Architecture:** The listing lives in `ios/store/listing.json` and the review notes and privacy answers beside it in `ios/store/`, checked by `scripts/lib/ios-store.js` (lengths, bytes, voice, brand) under vitest. Screenshots come from `npm run ios:store-shots`: a debug-only `--store-shots` launch seeds murmur's simulator with sample takes, a key that is not a key, and a finished first run, and an XCUITest target walks the app and saves each screen; the script strips alpha, checks the size, and leaves them in `ios/build/store-shots` (already git-ignored). The site gains `/privacy/` and `/support/` pages written in `site/content.js`, linked from every footer, with the deploy build refusing to run without the support address. `ios/docs/iphone.md` moves to `docs/iphone.md` and joins `DOCS`.

**Tech Stack:** Node (scripts, site build, vitest), SwiftUI, XCUITest, `xcrun simctl` (status bar override, privacy grant, screenshots), `sips`.

**Spec:** ios/prd.json, IOS-026 (its seven acceptance criteria).

## Global Constraints

- murmur is always lowercase, in the listing too ("murmur voice dictation"). No em dashes, double hyphens, or spaced hyphens in any copy. Digits for numbers in copy written in LaBroi's voice.
- Apple's limits, checked 2026-10-22 against developer.apple.com (App information and Platform version information): name and subtitle at most 30 characters; promotional text at most 170; description at most 4000, plain text; keywords at most 100 bytes, each more than 2 characters, no app or company names, not repeating the app name; the support URL must lead to real contact information; a privacy policy URL is required for iOS.
- Screenshots, checked 2026-10-22 (Screenshot specifications): at least 1 for iPhone with Dynamic Island (medium display), 1206 by 2622 portrait for iPhone 17, up to 10, PNG or JPEG, no alpha channel. iPad screenshots wait for IOS-027 (the app is iPhone only: `TARGETED_DEVICE_FAMILY: "1"`).
- App privacy, checked 2026-10-22 (App privacy details): "collect" means sending data off the device so the developer or its third-party partners (code added to the app: analytics, ads, SDKs, vendors) can keep it past the real-time request. murmur adds no such code; takes go from the phone to the provider the person picked, under their own key. StoreKit purchases are Apple's.
- Nothing goes to App Store Connect, the site, or GitHub releases without LaBroi's yes. Filing the label, pasting the listing, uploading screenshots, deploying the site, and submitting are his steps in HANDOFF.md, spelled out in chat as numbered plain steps.
- The `--store-shots` mode exists only in Debug builds (`#if DEBUG`), and the release check proves the archived binary does not carry it.
- No binary assets in the repo: screenshots stay in `ios/build/`.
- Public site pages run the seo-geo-aeo checklist (title, description, canonical, JSON-LD, sitemap, llms.txt) and the design skills inside night studio; the docs and their headings stay phrased as questions.
- Gates before any commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`; the site build (`npm run site`) after site changes.

## Review Focus

1. A keyword list under 100 characters but over 100 bytes (a non-ASCII character): counted in UTF-8 bytes, so it fails the check.
2. A screenshot that keeps its alpha channel, or comes out at the simulator's size when a different iPhone is picked: the script fails on either, naming the file.
3. `--store-shots` passed to a TestFlight or App Store build: the flag is compiled out, and the release check fails if the binary still holds the string.
4. The privacy page claiming less than the apps send: it names everything that leaves the device on both platforms (takes and cleanup to the chosen provider, desktop's update check and license activation, the App Store's own purchase), checked against the code.
5. A deploy build without `SUPPORT_EMAIL`: it stops, since the support page Apple links to must carry contact information.

---

### Task 1: The listing and its checks

**Files:**
- Create: `ios/store/listing.json`, `scripts/lib/ios-store.js`, `scripts/lib/ios-store.test.js`

**Interfaces:**
- Produces: `listingProblems(listing) -> string[]` (empty when it passes), `keywordBytes(keywords) -> number`.

- [ ] **Step 1: Write the failing tests.** `listingProblems` on the real `ios/store/listing.json` returns `[]`; on copies it names: a 31 character subtitle; a 171 character promotional text; a 4001 character description; keywords of 99 characters but 101 bytes (one `é`); a 2 character keyword; a keyword repeating a word of the name; `Murmur` capitalized anywhere; an em dash, a double hyphen, or a spaced hyphen; a spelled-out number from 2 to 99 ("two takes"); a support, marketing, or privacy URL not on `https://murmurapp.app/`.
- [ ] **Step 2: Run** `npx vitest run scripts/lib/ios-store.test.js`. Expected: FAIL, the module does not exist.
- [ ] **Step 3: Write `ios/store/listing.json`**: `name` (the record's name, read from App Store Connect, expected `murmur voice dictation`), `subtitle`, `promotionalText`, `description`, `keywords`, `supportUrl` (`https://murmurapp.app/support/`), `marketingUrl` (`https://murmurapp.app/`), `privacyPolicyUrl` (`https://murmurapp.app/privacy/`), `primaryCategory` (Productivity), `secondaryCategory` (Utilities), `copyright` (`2026 Eze Media LLC`), each fact in the description true of build 530 (bring your own key, the keyboard and Full Access, notes, Transform, belts and the painting a day, Pro at $49 once). Then `scripts/lib/ios-store.js`.
- [ ] **Step 4: Run** the test. Expected: PASS. Run `npm run test`. Expected: green.
- [ ] **Step 5: Commit** with the gates.

### Task 2: The privacy answers and the manifest

**Files:**
- Create: `ios/store/privacy.md`
- Modify: `scripts/lib/ios-store.js`, `scripts/lib/ios-store.test.js`

- [ ] **Step 1: Write the failing test.** `manifestProblems(plistJson)` returns `[]` for `ios/App/PrivacyInfo.xcprivacy` (tracking false, no tracking domains, no collected data types) and names each when a copy sets tracking, adds a domain, or lists a collected type. The test also reads the keyboard extension's manifest if it has one (find it in `ios/project.yml`).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Write `manifestProblems`** (plutil to JSON is done by the test with `execFileSync('plutil', ...)` only on darwin; elsewhere the test reads the XML with a small parser already in `scripts/lib`, or skips with a reason). Write `ios/store/privacy.md`: the answer to file (Data Not Collected), why under Apple's definition with the check date, and each thing that leaves the phone (audio and words to the chosen transcription and cleanup provider under the person's key; the App Store's purchase and receipt; a diagnostics report only when the person saves and shares it).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with the gates.

### Task 3: The site's privacy and support pages

**Files:**
- Modify: `site/content.js`, `site/build.js`, `site/README.md`
- Create: `site/pages.test.js`

- [ ] **Step 1: Read what leaves each app**, desktop first: `git grep` the main process for `fetch`/`appFetch`/`net.request` and list every host (provider calls, GitHub update check, license activation). Record the list in the privacy page's content and in the ledger.
- [ ] **Step 2: Write the failing tests** (`site/pages.test.js`, a build into a temporary folder with `SITE_OFFLINE=1`): `/privacy/index.html` exists, says murmur collects nothing, names the provider, the update check, license activation, and the App Store, and carries a verified-on date; `/support/index.html` exists, shows the support address when `SUPPORT_EMAIL` is set, links the issues page and the docs; every page's footer links both; a deploy build (`SITE_DEPLOY=1`) without `SUPPORT_EMAIL` exits non-zero with a message naming it; both pages are in `sitemap.xml` and `llms.txt`.
- [ ] **Step 3: Run** `npx vitest run site/pages.test.js`. Expected: FAIL.
- [ ] **Step 4: Build the pages** with the existing `subpage()` and the docs page styles; headings phrased as questions ("Does murmur collect my data?", "Where do my words go?", "How do I get help?"), short answers first. Run the seo-geo-aeo checklist and the design skills over both.
- [ ] **Step 5: Run** the tests and `npm run site`. Expected: PASS and the build's link check clean. Look at both pages in `node site/serve.js` at phone width and desktop width.
- [ ] **Step 6: Commit** with the gates.

### Task 4: The App Review notes

**Files:**
- Create: `ios/store/review-notes.md`
- Modify: `scripts/lib/ios-store.js`, `scripts/lib/ios-store.test.js`

- [ ] **Step 1: Write the failing test:** the notes stay under App Store Connect's review notes limit (check the limit on Apple's page and record it with the date), name Full Access (the keyboard types only dictated words and makes no network requests), the background microphone (the orange dot, and a session the person starts and ends), and the review key (a key with a low spend limit LaBroi makes for review and revokes after), with no key in the file.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Write the notes**, each claim checked against the code (the keyboard target's network use: `git grep` the extension for URLSession and fetch; the session's limits from IOS-009's notes), and the steps a reviewer follows: paste the key in Provider and key, add the keyboard, dictate in Notes. Check with EXA how the review key's provider caps spend (Groq's console or OpenRouter's per-key limit), with the date, and write LaBroi's step for it in HANDOFF.md.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** with the gates.

### Task 5: Screenshots by script

**Files:**
- Create: `ios/App/StoreShots/StoreShots.swift` (Debug only), `ios/StoreShotsUITests/StoreShotsTests.swift`
- Modify: `ios/project.yml` (a UI test target in its own scheme, so `ios:test` does not run it), `ios/App/MurmurApp.swift`, `scripts/ios.js` (`store-shots` command, the release binary check), `scripts/lib/ios.js` and its tests (`storeShotProblems`), `package.json` (`ios:store-shots`), `ios/README.md`

- [ ] **Step 1: Write the failing Node tests:** `storeShotProblems({ width, height, hasAlpha, name })` names a wrong size and an alpha channel; `releaseBinaryProblems(strings)` names `--store-shots` found in the archived binary.
- [ ] **Step 2: Run** them. Expected: FAIL. **Then implement** them and see them pass.
- [ ] **Step 3: Write the seed:** with `--store-shots` (Debug only), the app writes, through the real stores, about 2 weeks of sample takes written fresh for this (ordinary messages, a list, a note), marks first run seen, records the keyboard report as added with Full Access, stores the placeholder `store-shots-not-a-key` for Groq, and shows a demo voice in the take pill so a take shows the live pill without recording. A Swift test proves the seed never runs without the flag.
- [ ] **Step 4: Write the UI test** that launches with `--store-shots` and saves an attachment per screen: Dictate with the live pill and the last take's words, Home, the Journey, the painting a day, Notes, and Cleanup. Try the murmur keyboard in a text field by adding it through the simulator's Settings; if that proves unreliable across 3 runs, leave it out and rule it in the ledger.
- [ ] **Step 5: Write `ios:store-shots`:** murmur's simulator (an iPhone 17), `simctl status_bar override` (9:41, full battery and bars), `simctl privacy grant microphone`, the UI test run, attachments exported from the xcresult, alpha stripped with `sips`, each checked by `storeShotProblems`, into `ios/build/store-shots`, then the status bar cleared.
- [ ] **Step 6: Run** `npm run ios:store-shots` and read every image. Expected: 5 or more shots at 1206 by 2622, no alpha, no placeholder text visible, the pill visibly moving. Run the release check on the last archive and see the binary check pass.
- [ ] **Step 7: Commit** with the gates.

### Task 6: The iPhone doc joins the site, README and CHANGELOG

**Files:**
- Move: `ios/docs/iphone.md` to `docs/iphone.md`
- Modify: `site/content.js` (`DOCS`), `docs/download.md`, `README.md`, `CHANGELOG.md`, `ios/README.md`, `ios/MurmurCore/Tests/MurmurCoreTests/AnalyticsVectorTests.swift` (reads the doc by path), any live link `git grep 'iphone.md'` finds outside `ios/plans/` and story notes

- [ ] **Step 1: Write the failing checks:** the site build lists `iphone` (it stops when a doc is missing from `DOCS`); `docs/download.md` answers "How do I get murmur on iPhone?" with the App Store link `https://apps.apple.com/app/id<the record's Apple ID>`; AnalyticsVectorTests reads `docs/iphone.md`.
- [ ] **Step 2: Move the doc** with `git mv`, add it to `DOCS` after download, fix its relative links for its new folder, and write the download answer. README's iPhone section and a CHANGELOG line say murmur is on iPhone (the CHANGELOG line goes under the version that ships the iPhone launch; read RELEASING.md for how an unreleased section is written).
- [ ] **Step 3: Run** `npm run site`, `npm run test`, `npm run ios:test`. Expected: PASS, with the site building the iPhone page from the working tree.
- [ ] **Step 4: Commit** with the gates.

### Task 7: HANDOFF, notes, review gate, push

- [ ] **Step 1:** HANDOFF.md gains the IOS-026 steps for LaBroi, in order: create the review key with a spend limit; approve and run the site deploy; in App Store Connect, file the privacy label (Data Not Collected), paste the listing and categories, upload the screenshots, fill the age rating and App Review contact, paste the review notes and the key; pick build 530 or later; submit; release when approved; revoke the key.
- [ ] **Step 2:** IOS-026's notes record what was built and how it was verified; `passes` stays false (criteria 2, 7, and the filing parts of 1, 3, and 4 are his).
- [ ] **Step 3:** The review gate: an independent opus reviewer over the whole diff; fix confirmed findings test first.
- [ ] **Step 4:** Gates, push to PR #11, wait for CI, update memory, and send LaBroi the HANDOFF steps as numbered plain steps.
