# Provider and Key Setup (IOS-005) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring your own key on the iPhone: a Provider screen that picks who transcribes and who cleans up, keeps one key per provider in the Keychain where only the app can read it, and answers Test connection inline in plain words.

**Architecture:** The rules go in MurmurCore, which has no UI and tests on the Mac: a key type that only ever prints its mask, the presets each role offers, the connection settings (the same two blocks as desktop's provider and polish), the wrong-prefix note, and the connection test (desktop's one GET of the model list). The app adds a Keychain key ring filed by base URL as desktop's is, a store for the choices in the app's own defaults, an `@Observable` model, and the SwiftUI screen. The smoke gains two checks: a dummy key through the real Keychain, and Test connection against an in-app stand-in provider for each of its four answers.

**Tech Stack:** Swift 6 with strict concurrency, SwiftUI with Observation, Swift Testing, Security (Keychain), Foundation's URLSession and URLProtocol, Synchronization's `Mutex`.

**Spec:** `ios/prd.json` IOS-005, with `conventions` (design, privacy, verify, docs, parity) and `stack`, approved by LaBroi on 2026-10-10. Also `CLAUDE.md` and `DESIGN.md`. Desktop code this follows: `src/main/settings/keyring.ts` (one key per base URL, `normalizeUrl`), `src/main/settings/index.ts` `probeConnection` (the test request), `src/shared/catalog.ts` `providerForBaseUrl`, `src/shared/settings.ts` (the provider and polish blocks and `maskKey`), and `src/renderer/settings/ConnectionRows.tsx` (Same or Separate cleanup, presets, model picker).

**Proven before writing:** every Swift block below ran in a throwaway copy of `feature/ios` at 57a3485 before this plan was saved:
- `swift test` ran 58 MurmurCore tests: 31 existing and 27 new. `npm run ios:test` ran 34 app tests in the result bundle: 9 existing and 25 new.
- `npm run ios:smoke` printed `{"appGroup":true,"connectionTest":true,"keychain":true,"keyRing":true,"sharedJson":true}`.
- The design and header lints were clean, and the build had no warnings.
- A simulator spike settled the Keychain question. With no access group named, a saved item lands in the app's application identifier (`4B55ZVBVKN.com.lbwalton.murmur.ios`), even in CI's unsigned simulator build. Saving into `group.com.lbwalton.murmur` is also allowed, so the app group really is a second Keychain access group, and the test in Task 5 is what keeps keys out of it.
- The screen was captured in the simulator and reviewed against DESIGN.md, then corrected:
  - Action rows are now in brand gold.
  - Only the confirming Remove button is red.
  - Footers are text-dim.
  - Model rows show just the id, so the value fits one line.
- One RED has not been seen yet, and Task 6 makes the executor watch it: `aLateAnswerNeverLandsOnAnotherProvider` failing before the guard it pins exists.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The iPhone does not offer desktop's Local preset.** Its addresses are localhost, which on a phone is the phone, and murmur runs no server there. Custom still reaches any OpenAI-compatible https address. If wrong: one filter line in `presets(for:)`.
2. **Custom addresses must be https.** iOS blocks plain http unless the app declares an App Transport Security exception, which App Review asks to justify. The field says so in red under the address. If wrong: an Info.plist exception and one rule in `BaseURL.problem`.
3. **Test connection is desktop's probe, plus two additions:**
   - It sends the same request: GET of the model list with the key, 10 seconds.
   - The fourth answer is the provider's own message, as the criterion asks.
   - Any copy of the key inside that message is replaced by its mask. A 403 says to check the account too, since desktop notes 403 can mean an account that is not set up yet.
4. **Remove key asks first, and only the confirming button is red.** That follows LaBroi's 2026-10-08 rule (red is for the button that confirms a delete) and desktop's deleting-asks-first. If wrong: two lines.
5. **Model rows show the id only, as desktop's ModelPicker does.** The catalog's labels (fastest, thorough) made the row wrap to three lines on a phone.
6. **The smoke's stand-in provider runs inside the app, as a URLProtocol on its own URLSession.** No port to claim, no server to start, no network, and it exercises the same URLSession path as the real test. If wrong: a node stub in `scripts/ios.js` plus a port in the registry.
7. **The choices live in the app's own `UserDefaults`, not the app group.** The keyboard makes no requests (`conventions.privacy`), and history follows the same rule.
8. **The screen is reached from a one-row placeholder home until Home (IOS-012) and First run (IOS-011) take over.**
9. **The live check waits for TestFlight 1 (IOS-015)**, since `conventions.stories` says live checks run on LaBroi's iPhone from a TestFlight build. IOS-005 is built and smoke-verified, its live step goes to HANDOFF.md, and work continues.

## Global Constraints

- Swift 6 with strict concurrency; SwiftUI for screens; iOS 26 minimum (`stack`). No third-party Swift packages without LaBroi's OK.
- MurmurCore stays UI-free and tests with `swift test --package-path ios/MurmurCore` on the Mac, no simulator. It must build with Xcode 26.6 (CI's `macos-26`) and Xcode 27 (local).
- "Keys are saved in the Keychain, readable only by the app, after first unlock, on this device only (never synced or restored to another device). Key items live in the app's own Keychain access group (its application identifier), never in the shared app group" (IOS-005).
- "A key never appears in logs, diagnostics, crash reports, or the pasteboard" (IOS-005). "Logs never hold your words or any key" (`conventions.privacy`).
- Design (`conventions.design`): night studio tokens only from the generated `Tokens.swift`; the design lint fails raw hex or hand-built colors anywhere else in `ios/`.
  - Use the system font with Dynamic Type, a VoiceOver label on every control, and tap targets of at least 44 by 44 points. Text contrast is WCAG AA or better.
  - Interface motion settles without bounce.
  - Copy is plain, sentence case, with active verbs and lowercase murmur. Errors say what happened and how to fix it, in clean red.
  - SwiftUI views stay small, own their state with `@State` and `@Observable`, load with `.task`, and ship a preview for each state.
- Before building any screen, consult the `frontend-design`, `elite-saas-designer`, and `ui-skills-root` skills (CLAUDE.md). They were consulted for this plan, along with ui-skills' `dimillian/swiftui-ui-patterns`.
- Behavior lives in `shared/` (`conventions.parity`); this story reads `shared/provider-catalog.json` and adds no new rule files.
- Every `.swift` file starts with `// SPDX-License-Identifier: GPL-3.0-only`.
- The product name is always lowercase murmur. No em dashes or spaced hyphens as clause separators anywhere.
- Commits start with `IOS-005:`. Commit, then `git pull --rebase`, which pulls `origin/feature/ios`, published as draft PR #11. Never rebase onto main.
- Before every commit run `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke` (`conventions.verify`). `swift test --package-path ios/MurmurCore` is the fast loop while working. This story changes nothing desktop runs, so `npm run smoke` is not required.
- To read the app test count, open the newest result bundle:
  `xcrun xcresulttool get test-results summary --path "$(ls -td ios/build/DerivedData/Logs/Test/*.xcresult | head -1)"`
  `npm run ios:test` prints only MurmurCore's summary.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- Never push without LaBroi's OK, and run the review gate (an independent reviewer agent over the full diff) before any push.

## Review Focus

1. **A key pasted with spaces or a line break**, from a password manager or Notes. It saves as the bare key, and the field empties. Pinned by `APIKeyTests.aPasteLosesItsSpacesAndLineBreaks` (Task 1) and `ProviderModelTests.savingTrimsThePasteAndClearsTheField` (Task 6).
2. **A provider error that repeats the key back.** The key never reaches the screen, because the message shows the mask in its place. Pinned by `ConnectionTestTests.aMessageNeverRepeatsTheKey` (Task 4).
3. **A Keychain that refuses**, as a phone not yet unlocked since restart can. The screen says so plainly and keeps the pasted key in the field, so nothing typed is lost. Pinned by `ProviderModelTests.aKeychainFailureIsSaidPlainly` (Task 6).
4. **A test answer that arrives after the person switched providers.** It is dropped, so a verdict earned by Groq never shows under OpenAI. Pinned by `ProviderModelTests.aLateAnswerNeverLandsOnAnotherProvider` (Task 6).
5. **Saved choices that no longer read**, from an older build or damaged. The screen falls back to Groq's defaults instead of failing. Pinned by `ProviderModelTests.unreadableSavedChoicesFallBackToDefaults` (Task 6).

## Files

MurmurCore (`ios/MurmurCore/Sources/MurmurCore/`, tests in `ios/MurmurCore/Tests/MurmurCoreTests/`):
- `APIKey.swift`: the key, trimmed, printing only its mask.
- `ProviderChoices.swift`: `ProviderRole`, the presets per role, `preset(forBaseUrl:)`, and `BaseURL`'s rules.
- `ConnectionSettings.swift`: what the iPhone connects to (desktop's provider and polish blocks).
- `KeyNote.swift`: the gentle wrong-prefix note.
- `ConnectionTest.swift`: the request, the four verdicts, the provider's own words.

The app (`ios/App/`, tests in `ios/AppTests/`):
- `KeychainStore.swift` (modify): reads an item's access group.
- `Keys/KeyRing.swift`: the `KeyRing` protocol, the Keychain ring, and an in-memory ring for previews and tests.
- `Settings/ConnectionStore.swift`: the choices in the app's own defaults, and the bundled catalog.
- `Provider/ProviderModel.swift`: the screen's `@Observable` state and the per-provider `KeySlot`.
- `Provider/ProviderCopy.swift`: every sentence the screen says.
- `Provider/KeySlotView.swift`: the key rows, the verdict, and notes, with previews for each state.
- `Provider/ProviderScreen.swift`: the screen, its fields, the live wiring, and its previews.
- `ContentView.swift` (modify): the placeholder home links to the screen.
- `Smoke/StubProtocol.swift` and `Smoke/SmokeRunner.swift` (modify): the two new smoke checks.

Docs and records: `ios/docs/iphone.md` (new), `HANDOFF.md`, `ios/prd.json`, `ios/ROADMAP.md`.

---

### Task 1: A key that only ever prints its mask

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/APIKey.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/APIKeyTests.swift`

**Interfaces:**
- Produces: `public struct APIKey: Sendable, Equatable` with `init?(_ pasted: String)` (trims whitespace and newlines; nil when empty), `let secret: String`, and `var masked: String` ("••••" plus the last four for keys longer than 8, else "••••"). `description`, `debugDescription`, and `customMirror` all show only the mask. Tasks 4 to 8 use it.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct APIKeyTests {
    @Test func aPasteLosesItsSpacesAndLineBreaks() throws {
        let key = try #require(APIKey("  gsk_abcdefgh1234\n"))
        #expect(key.secret == "gsk_abcdefgh1234")
    }

    @Test(arguments: ["", "   ", "\n\t"])
    func anEmptyPasteIsNoKey(_ pasted: String) {
        #expect(APIKey(pasted) == nil)
    }

    @Test func theMaskShowsOnlyTheLastFour() throws {
        #expect(try #require(APIKey("gsk_abcdefgh1234")).masked == "••••1234")
    }

    /// Desktop's maskKey hides a key of 8 or fewer characters whole.
    @Test(arguments: ["12345678", "abc"])
    func aShortKeyIsHiddenWhole(_ secret: String) throws {
        #expect(try #require(APIKey(secret)).masked == "••••")
    }

    /// Every way Swift turns a value into text shows the mask, so a key
    /// that strays into a log line, an error, or a crash message still
    /// stays secret.
    @Test func printingAKeyNeverShowsIt() throws {
        let key = try #require(APIKey("gsk_abcdefgh1234"))
        let optional: APIKey? = key
        var dumped = ""
        dump(key, to: &dumped)
        let texts = ["\(key)", String(describing: key), String(reflecting: key), String(describing: optional), dumped, "\([key])"]
        for text in texts {
            #expect(!text.contains("gsk_abcdefgh"), "\(text)")
            #expect(text.contains("••••1234"), "\(text)")
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore --filter APIKeyTests`
Expected: the build fails with `cannot find 'APIKey' in scope`.

- [ ] **Step 3: Write the key**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A provider key that cannot leak by accident (ios/prd.json IOS-005):
// printing it, interpolating it, or dumping it shows only the mask. The
// one place that reads `secret` is the request that sends it.
import Foundation

public struct APIKey: Sendable, Equatable {
    public let secret: String

    /// Trims the spaces and line breaks a paste brings along; nil when
    /// nothing is left.
    public init?(_ pasted: String) {
        let trimmed = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        secret = trimmed
    }

    /// The last four characters, and only for a key long enough that four
    /// give little away; desktop's maskKey hides keys of 8 or fewer whole.
    public var masked: String {
        secret.count > 8 ? "••••" + String(secret.suffix(4)) : "••••"
    }
}

extension APIKey: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    public var description: String { masked }
    public var debugDescription: String { "APIKey(\(masked))" }
    public var customMirror: Mirror { Mirror(self, children: ["masked": masked]) }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore --filter APIKeyTests`
Expected: 5 tests pass (8 cases).

- [ ] **Step 5: Commit**

Run the gates in Global Constraints, then:

```bash
git add ios/MurmurCore/Sources/MurmurCore/APIKey.swift ios/MurmurCore/Tests/MurmurCoreTests/APIKeyTests.swift
git commit -m "IOS-005: a provider key prints only its last four characters"
git pull --rebase
```

---

### Task 2: The presets each role offers, and the connection settings

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/ProviderChoices.swift`
- Create: `ios/MurmurCore/Sources/MurmurCore/ConnectionSettings.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/ProviderChoicesTests.swift`

**Interfaces:**
- Consumes: `ProviderCatalog` (IOS-003).
- Produces:
  - `public enum ProviderRole { case transcription, cleanup }`.
  - `ProviderCatalog.presets(for: ProviderRole) -> [Provider]` and `ProviderCatalog.preset(forBaseUrl: String) -> Provider?`.
  - `Provider.url(for: ProviderRole) -> String`.
  - `public enum BaseURL` with `normalized(_:)`, `problem(_:) -> String?`, and `isThisDevice(_:)`.
  - `public struct ConnectionSettings: Codable, Equatable, Sendable` with `transcription` (`baseUrl`, `sttModel`, `llmModel`), `cleanup` (`separate`, `baseUrl`, `llmModel`), `init(defaultsFrom:)`, `cleanupBaseUrl`, and `cleanupModel`.
  - The test file also defines `let bundledCatalog: ProviderCatalog?`, which Task 3 uses.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

let bundledCatalog: ProviderCatalog? = try? SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")

@Suite struct ProviderChoicesTests {
    /// Desktop's speech presets, less Local, whose localhost would be the phone.
    @Test func transcriptionOffersTheSpeechPresetsWithGroqFirst() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.presets(for: .transcription).map(\.id) == ["groq", "openai", "mistral"])
    }

    /// Desktop's chat presets, less Local; TypeSafe is a decision model,
    /// which desktop's cleanup does not offer either.
    @Test func cleanupOffersTheChatPresets() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.presets(for: .cleanup).map(\.id) == ["groq", "openai", "mistral", "deepseek", "cerebras", "openrouter"])
    }

    @Test(arguments: [
        ("https://api.groq.com/openai/v1", "groq"), ("https://api.groq.com/openai/v1/", "groq"),
        ("http://localhost:11434/v1", "local"), ("https://api.example.com/v1", nil)
    ] as [(String, String?)])
    func aBaseUrlFindsItsPreset(_ url: String, _ id: String?) throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.preset(forBaseUrl: url)?.id == id)
    }

    @Test func aTrailingSlashFilesUnderTheSameKey() {
        #expect(BaseURL.normalized("https://api.openai.com/v1/") == "https://api.openai.com/v1")
        #expect(BaseURL.normalized("https://api.openai.com/v1") == "https://api.openai.com/v1")
    }

    @Test(arguments: [
        ("https://api.example.com/v1", nil),
        ("", "Enter the provider's base URL."),
        ("api.example.com/v1", "Start the address with https://."),
        ("http://192.168.1.5:8000/v1", "Use an https address. iPhone apps can only call https."),
        ("https://", "Add the provider's host after https://.")
    ] as [(String, String?)])
    func anAddressSaysWhatToFix(_ url: String, _ problem: String?) {
        #expect(BaseURL.problem(url) == problem)
    }

    @Test func defaultsAreGroqWithDesktopsModels() throws {
        let settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        #expect(settings.transcription.baseUrl == "https://api.groq.com/openai/v1")
        #expect(settings.transcription.sttModel == "whisper-large-v3-turbo")
        #expect(settings.transcription.llmModel == "openai/gpt-oss-120b")
        #expect(!settings.cleanup.separate)
    }

    @Test func cleanupRidesTranscriptionUntilItIsSeparate() throws {
        var settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        #expect(settings.cleanupBaseUrl == settings.transcription.baseUrl)
        #expect(settings.cleanupModel == "openai/gpt-oss-120b")
        settings.cleanup = .init(separate: true, baseUrl: "https://api.deepseek.com", llmModel: "deepseek-flash")
        #expect(settings.cleanupBaseUrl == "https://api.deepseek.com")
        #expect(settings.cleanupModel == "deepseek-flash")
    }

    @Test func settingsRoundTripThroughJSON() throws {
        let settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        let back = try JSONDecoder().decode(ConnectionSettings.self, from: JSONEncoder().encode(settings))
        #expect(back == settings)
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore --filter ProviderChoicesTests`
Expected: the build fails with `value of type 'ProviderCatalog' has no member 'presets'` and `cannot find 'BaseURL' in scope`.

- [ ] **Step 3: Write the choices and the settings**

`ios/MurmurCore/Sources/MurmurCore/ProviderChoices.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Which presets the iPhone offers for transcription and for cleanup, and
// the base URL rules the key ring and the connection test share
// (ios/prd.json IOS-005; desktop's providerForBaseUrl and the key ring's
// normalizeUrl).
import Foundation

public enum ProviderRole: Sendable {
    case transcription
    case cleanup
}

extension ProviderCatalog {
    /// The presets for a role, in catalog order, so Groq comes first.
    /// Transcription takes speech providers and cleanup takes chat ones,
    /// as on desktop. A preset whose address is this device (desktop's
    /// Local) is left out: on a phone, localhost is the phone.
    public func presets(for role: ProviderRole) -> [Provider] {
        providers.filter { provider in
            let kind: Kind = role == .transcription ? .stt : .llm
            return provider.kinds.contains(kind) && !BaseURL.isThisDevice(provider.url(for: role))
        }
    }

    /// The preset a base URL belongs to, by its base or its cleanup URL,
    /// as desktop's providerForBaseUrl matches; nil means Custom.
    public func preset(forBaseUrl baseUrl: String) -> Provider? {
        let wanted = BaseURL.normalized(baseUrl)
        return providers.first { provider in
            BaseURL.normalized(provider.baseUrl) == wanted
                || provider.llmBaseUrl.map { BaseURL.normalized($0) == wanted } == true
        }
    }
}

extension ProviderCatalog.Provider {
    /// Cleanup goes to llmBaseUrl when a preset has one.
    public func url(for role: ProviderRole) -> String {
        role == .cleanup ? (llmBaseUrl ?? baseUrl) : baseUrl
    }
}

public enum BaseURL {
    /// The form the key ring files a key under: one trailing slash off,
    /// as desktop's normalizeUrl does, so "…/v1/" and "…/v1" share a key.
    public static func normalized(_ url: String) -> String {
        url.hasSuffix("/") ? String(url.dropLast()) : url
    }

    /// Nil when the iPhone can call this address; otherwise what to fix,
    /// in plain words. iPhone apps call https only.
    public static func problem(_ url: String) -> String? {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "Enter the provider's base URL." }
        guard let parts = URLComponents(string: trimmed), let scheme = parts.scheme?.lowercased() else {
            return "Start the address with https://."
        }
        if scheme != "https" { return "Use an https address. iPhone apps can only call https." }
        if (parts.host ?? "").isEmpty { return "Add the provider's host after https://." }
        return nil
    }

    /// Whether an address points back at the device it runs on.
    public static func isThisDevice(_ url: String) -> Bool {
        let host = URLComponents(string: url)?.host?.lowercased() ?? ""
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
}
```

`ios/MurmurCore/Sources/MurmurCore/ConnectionSettings.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// What the iPhone connects to: the same two blocks as desktop's settings
// (provider and polish in src/shared/settings.ts). Base URLs and model
// ids only; keys live in the key ring, never here.
import Foundation

public struct ConnectionSettings: Codable, Equatable, Sendable {
    public struct Transcription: Codable, Equatable, Sendable {
        public var baseUrl: String
        public var sttModel: String
        /// The cleanup model while cleanup rides this provider.
        public var llmModel: String
    }

    public struct Cleanup: Codable, Equatable, Sendable {
        /// Off is desktop's Same: cleanup rides the transcription provider.
        public var separate: Bool
        public var baseUrl: String
        public var llmModel: String
    }

    public var transcription: Transcription
    public var cleanup: Cleanup

    /// The catalog's first transcription preset (Groq) with its first
    /// models, which are desktop's defaults too.
    public init(defaultsFrom catalog: ProviderCatalog) {
        let first = catalog.presets(for: .transcription).first
        transcription = Transcription(
            baseUrl: first?.baseUrl ?? "",
            sttModel: first?.sttModels.first?.id ?? "",
            llmModel: first?.llmModels.first?.id ?? ""
        )
        cleanup = Cleanup(separate: false, baseUrl: "", llmModel: "")
    }

    /// Where cleanup goes, and with which model. Riding transcription
    /// uses its base URL, as desktop's cleanup does on Same.
    public var cleanupBaseUrl: String { cleanup.separate ? cleanup.baseUrl : transcription.baseUrl }
    public var cleanupModel: String { cleanup.separate ? cleanup.llmModel : transcription.llmModel }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore --filter ProviderChoicesTests`
Expected: 8 tests pass (15 cases).

- [ ] **Step 5: Commit**

Run the gates, then:

```bash
git add ios/MurmurCore/Sources/MurmurCore/ProviderChoices.swift ios/MurmurCore/Sources/MurmurCore/ConnectionSettings.swift ios/MurmurCore/Tests/MurmurCoreTests/ProviderChoicesTests.swift
git commit -m "IOS-005: MurmurCore knows the presets each role offers and what the iPhone connects to"
git pull --rebase
```

---

### Task 3: The gentle wrong-prefix note

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/KeyNote.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/KeyNoteTests.swift`

**Interfaces:**
- Consumes: `ProviderCatalog.preset(forBaseUrl:)` and `bundledCatalog` (Task 2).
- Produces: `public enum KeyNote: Equatable, Sendable { case looksLike(provider: String); case expected(prefixes: [String], provider: String) }` and `ProviderCatalog.keyNote(for pasted: String, baseUrl: String) -> KeyNote?`. Task 6 shows it under the field; Task 7 words it.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct KeyNoteTests {
    let groq = "https://api.groq.com/openai/v1"
    let openai = "https://api.openai.com/v1"

    @Test func aGroqKeyUnderGroqGetsNoNote() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "gsk_abcdefgh1234", baseUrl: groq) == nil)
    }

    @Test func aKeyMissingGroqsPrefixSaysWhatGroqKeysLookLike() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "sk-abcdefgh1234", baseUrl: groq) == .expected(prefixes: ["gsk_"], provider: "Groq"))
    }

    @Test func aGroqKeyUnderOpenAISaysWhoseItLooksLike() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "gsk_abcdefgh1234", baseUrl: openai) == .looksLike(provider: "Groq"))
    }

    /// OpenAI lists no prefix (its sk- is shared), so nothing can be said.
    @Test func aProviderWithoutPrefixesStaysQuiet() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "anything-at-all-1234", baseUrl: openai) == nil)
    }

    @Test func aCustomAddressAndAnEmptyFieldStayQuiet() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.keyNote(for: "gsk_abcdefgh1234", baseUrl: "https://api.example.com/v1") == nil)
        #expect(catalog.keyNote(for: "  ", baseUrl: groq) == nil)
    }

    /// A paste with a leading space still reads as the key it is.
    @Test func spacesAroundAPasteDoNotMatter() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "  gsk_abcdefgh1234\n", baseUrl: groq) == nil)
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore --filter KeyNoteTests`
Expected: the build fails with `value of type 'ProviderCatalog' has no member 'keyNote'`.

- [ ] **Step 3: Write the note**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The gentle note under a pasted key whose start does not fit its
// provider (ios/prd.json IOS-005). Only the catalog's keyPrefixes count,
// which list a format only when one provider alone uses it, so the note
// never guesses. It never blocks saving.
import Foundation

public enum KeyNote: Equatable, Sendable {
    /// The key carries another provider's prefix.
    case looksLike(provider: String)
    /// This provider's keys start with one of these, and this one does not.
    case expected(prefixes: [String], provider: String)
}

extension ProviderCatalog {
    /// The note for a key pasted under a base URL, or nil when it fits
    /// or nothing can be said. A custom address gets no note.
    public func keyNote(for pasted: String, baseUrl: String) -> KeyNote? {
        let key = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, let owner = preset(forBaseUrl: baseUrl) else { return nil }
        let ownPrefixes = owner.keyPrefixes ?? []
        if ownPrefixes.contains(where: { key.hasPrefix($0) }) { return nil }
        let others = providers.filter { other in
            other.id != owner.id && (other.keyPrefixes ?? []).contains { key.hasPrefix($0) }
        }
        if others.count == 1 { return .looksLike(provider: others[0].name) }
        if !ownPrefixes.isEmpty { return .expected(prefixes: ownPrefixes, provider: owner.name) }
        return nil
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `swift test --package-path ios/MurmurCore --filter KeyNoteTests`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

Run the gates, then:

```bash
git add ios/MurmurCore/Sources/MurmurCore/KeyNote.swift ios/MurmurCore/Tests/MurmurCoreTests/KeyNoteTests.swift
git commit -m "IOS-005: a key with another provider's prefix gets a gentle note"
git pull --rebase
```

---

### Task 4: Test connection, and its four answers

**Files:**
- Create: `ios/MurmurCore/Sources/MurmurCore/ConnectionTest.swift`
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/ConnectionTestTests.swift`

**Interfaces:**
- Consumes: `APIKey` (Task 1), `BaseURL` (Task 2).
- Produces:
  - `public enum ConnectionVerdict: Equatable, Sendable { case works, keyRejected(status: Int), noConnection, providerMessage(String) }`.
  - `public enum ConnectionTest` with `typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)`, `timeout`, `request(baseUrl:key:) -> URLRequest?`, `run(baseUrl:key:send:) async -> ConnectionVerdict`, and `verdict(status:body:key:)`.
  - Tasks 6 and 8 call `run`.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct ConnectionTestTests {
    let key = APIKey("gsk_abcdefgh1234")!

    func answer(_ status: Int, _ body: String = "{}") -> ConnectionTest.Send {
        { request in
            (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    @Test func itAsksForTheModelListWithTheKey() throws {
        let request = try #require(ConnectionTest.request(baseUrl: "https://api.groq.com/openai/v1/", key: key))
        #expect(request.url?.absoluteString == "https://api.groq.com/openai/v1/models")
        #expect(request.httpMethod == "GET")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer gsk_abcdefgh1234")
        #expect(request.timeoutInterval == 10)
    }

    @Test func anAddressTheIPhoneCannotCallMakesNoRequest() {
        #expect(ConnectionTest.request(baseUrl: "http://192.168.1.5:8000/v1", key: key) == nil)
        #expect(ConnectionTest.request(baseUrl: "", key: key) == nil)
    }

    @Test(arguments: [200, 204])
    func aSuccessWorks(_ status: Int) async {
        #expect(await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(status)) == .works)
    }

    @Test(arguments: [401, 403])
    func aRefusalRejectsTheKey(_ status: Int) async {
        let verdict = await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(status, #"{"error":{"message":"Invalid API Key"}}"#))
        #expect(verdict == .keyRejected(status: status))
    }

    @Test func noAnswerIsNoConnection() async {
        let offline: ConnectionTest.Send = { _ in throw URLError(.notConnectedToInternet) }
        #expect(await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: offline) == .noConnection)
    }

    @Test(arguments: [
        (#"{"error":{"message":"Model overloaded"}}"#, "Model overloaded"),
        (#"{"error":"Rate limit reached"}"#, "Rate limit reached"),
        (#"{"message":"Service unavailable"}"#, "Service unavailable"),
        (#"{"detail":"Not Found"}"#, "Not Found"),
        ("<html>Bad gateway</html>", "The provider answered with code 500."),
        (#"{"error":{"message":"  "}}"#, "The provider answered with code 500.")
    ])
    func anyOtherAnswerSpeaksInTheProvidersWords(_ body: String, _ words: String) async {
        let verdict = await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(500, body))
        #expect(verdict == .providerMessage(words))
    }

    @Test func aLongMessageIsCut() {
        let long = String(repeating: "a", count: 300)
        #expect(ConnectionTest.verdict(status: 500, body: Data(#"{"message":"\#(long)"}"#.utf8), key: key) == .providerMessage(String(repeating: "a", count: 200) + "…"))
    }

    @Test func aMessageNeverRepeatsTheKey() {
        let verdict = ConnectionTest.verdict(status: 429, body: Data(#"{"error":{"message":"Too many requests for gsk_abcdefgh1234"}}"#.utf8), key: key)
        #expect(verdict == .providerMessage("Too many requests for ••••1234"))
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `swift test --package-path ios/MurmurCore --filter ConnectionTestTests`
Expected: the build fails with `cannot find 'ConnectionTest' in scope`.

- [ ] **Step 3: Write the test request and its verdicts**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Test connection (ios/prd.json IOS-005): one cheap authorized GET of
// the provider's model list, as desktop's probeConnection does
// (src/main/settings/index.ts), which proves the address and the key
// together without spending audio. The answer is one of four verdicts.
import Foundation

public enum ConnectionVerdict: Equatable, Sendable {
    case works
    /// 401 or 403. A 403 can also mean an account that is not set up yet.
    case keyRejected(status: Int)
    case noConnection
    /// Any other answer, in the provider's own words when it gave some.
    case providerMessage(String)
}

public enum ConnectionTest {
    public typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    /// Desktop gives up after 10 seconds too.
    public static let timeout: TimeInterval = 10

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(baseUrl: String, key: APIKey) -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/models")
        else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        return request
    }

    public static func run(baseUrl: String, key: APIKey, send: Send) async -> ConnectionVerdict {
        guard let request = request(baseUrl: baseUrl, key: key) else { return .noConnection }
        do {
            let (body, response) = try await send(request)
            guard let http = response as? HTTPURLResponse else { return .noConnection }
            return verdict(status: http.statusCode, body: body, key: key)
        } catch {
            return .noConnection
        }
    }

    public static func verdict(status: Int, body: Data, key: APIKey) -> ConnectionVerdict {
        switch status {
        case 200..<300:
            return .works
        case 401, 403:
            return .keyRejected(status: status)
        default:
            let words = message(in: body) ?? "The provider answered with code \(status)."
            // A provider that echoes the key back never gets it shown.
            return .providerMessage(words.replacingOccurrences(of: key.secret, with: key.masked))
        }
    }

    /// The error text OpenAI-compatible servers send, in the shapes they
    /// use: {"error": {"message"}}, {"error": "…"}, {"message"}, or
    /// {"detail"}. Long text is cut to 200 characters.
    static func message(in body: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        let candidates: [Any?] = [
            (object["error"] as? [String: Any])?["message"], object["error"], object["message"], object["detail"]
        ]
        for case let text as String in candidates {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            return trimmed.count > 200 ? String(trimmed.prefix(200)) + "…" : trimmed
        }
        return nil
    }
}
```

- [ ] **Step 4: Run it to see it pass, then the whole package**

Run: `swift test --package-path ios/MurmurCore --filter ConnectionTestTests`
Expected: 8 tests pass (15 cases).

Run: `swift test --package-path ios/MurmurCore`
Expected: 58 tests pass, with the one known issue `parityChecksCompareCodeUnits` records on purpose.

- [ ] **Step 5: Commit**

Run the gates, then:

```bash
git add ios/MurmurCore/Sources/MurmurCore/ConnectionTest.swift ios/MurmurCore/Tests/MurmurCoreTests/ConnectionTestTests.swift
git commit -m "IOS-005: Test connection asks for the model list and answers in four plain verdicts"
git pull --rebase
```

---

### Task 5: The key ring, in the app's own Keychain group

**Files:**
- Modify: `ios/App/KeychainStore.swift` (add `accessGroup(account:)`)
- Create: `ios/App/Keys/KeyRing.swift`
- Test: `ios/AppTests/KeyRingTests.swift`

**Interfaces:**
- Consumes: `KeychainStore` (IOS-001), `APIKey` (Task 1), `BaseURL.normalized` (Task 2), `AppGroup.identifier` (IOS-001).
- Produces:
  - `protocol KeyRing: Sendable` with `key(for:) throws -> APIKey?`, `save(_:for:) throws`, and `remove(for:) throws`.
  - `struct KeychainKeyRing: KeyRing`, which has `let store: KeychainStore` and defaults to service `murmur.keys`.
  - `final class MemoryKeyRing: KeyRing` with `init(_ keys: [String: APIKey] = [:])`.
  - `KeychainStore.accessGroup(account:) throws -> String?`.
  - Tasks 6 to 8 use them.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Security
import Testing
@testable import murmur

@Suite(.serialized) struct KeyRingTests {
    let ring = KeychainKeyRing(store: KeychainStore(service: "murmur.keys.tests"))
    let groq = "https://api.groq.com/openai/v1"
    let openai = "https://api.openai.com/v1"

    @Test func keepsOneKeyPerProvider() throws {
        defer { try? ring.remove(for: groq); try? ring.remove(for: openai) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        try ring.save(try #require(APIKey("sk-openaiopenai2222")), for: openai)
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
        #expect(try ring.key(for: openai)?.secret == "sk-openaiopenai2222")
        try ring.remove(for: groq)
        #expect(try ring.key(for: groq) == nil)
        #expect(try ring.key(for: openai) != nil)
    }

    @Test func aTrailingSlashFindsTheSameKey() throws {
        defer { try? ring.remove(for: groq) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq + "/")
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
    }

    /// The app group is a Keychain access group too, shared with the
    /// keyboard; keys must land in the app's own application identifier
    /// (team id, a dot, the bundle id) so the keyboard can never read one.
    @Test func keysLiveInTheAppsOwnAccessGroup() throws {
        defer { try? ring.remove(for: groq) }
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        let group = try #require(try ring.store.accessGroup(account: BaseURL.normalized(groq)))
        #expect(group != AppGroup.identifier)
        #expect(group.hasSuffix("." + (try #require(Bundle.main.bundleIdentifier))))
        #expect(group.split(separator: ".").first?.count == 10)
    }

    /// The check above can tell the two apart: an item put in the app
    /// group on purpose reads back as the app group.
    @Test func theAccessGroupCheckSeesTheAppGroup() throws {
        let store = KeychainStore(service: "murmur.keys.tests.appgroup")
        let base: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: store.service, kSecAttrAccount: "probe"]
        SecItemDelete(base as CFDictionary)
        defer { SecItemDelete(base as CFDictionary) }
        var add = base
        add[kSecValueData] = Data("probe".utf8)
        add[kSecAttrAccessGroup] = AppGroup.identifier
        #expect(SecItemAdd(add as CFDictionary, nil) == errSecSuccess)
        #expect(try store.accessGroup(account: "probe") == AppGroup.identifier)
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: MurmurCore passes, then the app build fails with `cannot find 'KeychainKeyRing' in scope` and `value of type 'KeychainStore' has no member 'accessGroup'`.

- [ ] **Step 3: Teach KeychainStore to say where an item landed**

Replace `ios/App/KeychainStore.swift` with:

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

    /// The Keychain access group an item landed in, or nil when there is
    /// no item. Tests and the smoke use it to prove keys never sit in the
    /// app group, which the keyboard can read.
    func accessGroup(account: String) throws -> String? {
        var query = baseQuery(account)
        query[kSecReturnAttributes] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        try check(status)
        return (item as? [String: Any])?[kSecAttrAccessGroup as String] as? String
    }

    private func baseQuery(_ account: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }

    private func check(_ status: OSStatus) throws {
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }
}
```

- [ ] **Step 4: Write the key ring**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The key ring: one saved key per provider, filed under its base URL as
// on desktop (src/main/settings/keyring.ts), so switching providers
// never asks for a key twice (ios/prd.json IOS-005). Keys live in the
// Keychain through KeychainStore: the app's own access group, readable
// after first unlock, on this device only.
import Foundation
import MurmurCore
import Synchronization

protocol KeyRing: Sendable {
    func key(for baseUrl: String) throws -> APIKey?
    func save(_ key: APIKey, for baseUrl: String) throws
    func remove(for baseUrl: String) throws
}

struct KeychainKeyRing: KeyRing {
    let store: KeychainStore

    init(store: KeychainStore = KeychainStore(service: "murmur.keys")) {
        self.store = store
    }

    func key(for baseUrl: String) throws -> APIKey? {
        try store.read(account: BaseURL.normalized(baseUrl)).flatMap(APIKey.init)
    }

    func save(_ key: APIKey, for baseUrl: String) throws {
        try store.save(key.secret, account: BaseURL.normalized(baseUrl))
    }

    func remove(for baseUrl: String) throws {
        try store.delete(account: BaseURL.normalized(baseUrl))
    }
}

/// For previews and tests: nothing reaches the Keychain.
final class MemoryKeyRing: KeyRing {
    private let keys: Mutex<[String: APIKey]>

    init(_ keys: [String: APIKey] = [:]) {
        self.keys = Mutex(keys)
    }

    func key(for baseUrl: String) throws -> APIKey? {
        keys.withLock { $0[BaseURL.normalized(baseUrl)] }
    }

    func save(_ key: APIKey, for baseUrl: String) throws {
        keys.withLock { $0[BaseURL.normalized(baseUrl)] = key }
    }

    func remove(for baseUrl: String) throws {
        _ = keys.withLock { $0.removeValue(forKey: BaseURL.normalized(baseUrl)) }
    }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npm run ios:test`
Expected: `** TEST SUCCEEDED **`. The result bundle shows KeyRingTests passing, with its four tests among the total.

- [ ] **Step 6: Commit**

Run the gates, then:

```bash
git add ios/App/KeychainStore.swift ios/App/Keys/KeyRing.swift ios/AppTests/KeyRingTests.swift
git commit -m "IOS-005: the key ring keeps one key per provider in the app's own Keychain group"
git pull --rebase
```

---

### Task 6: The screen's state, saved choices, and one key slot per provider

**Files:**
- Create: `ios/App/Settings/ConnectionStore.swift`
- Create: `ios/App/Provider/ProviderModel.swift`
- Test: `ios/AppTests/ProviderModelTests.swift`

**Interfaces:**
- Consumes: Tasks 1 to 5.
- Produces:
  - `struct ConnectionStore` with `defaultsKey`, `init(defaults:)`, `load(catalog:)`, and `save(_:)`.
  - `enum BundledRules { static func catalog() throws -> ProviderCatalog }`.
  - `@Observable @MainActor final class ProviderModel` with:
    - `init(catalog:store:ring:send:)`, `settings`, `transcriptionKey`, `cleanupKey`, `transcriptionPreset`, `cleanupPreset`, and `cleanupSharesKey`;
    - `chooseTranscription(_:)`, `chooseCleanup(_:)`, `setSeparateCleanup(_:)`, `setTranscriptionBaseUrl(_:)`, `setSttModel(_:)`, `setCleanupBaseUrl(_:)`, and `setCleanupModel(_:)`.
  - `enum TestState: Equatable { case idle, testing, done(ConnectionVerdict) }`.
  - `@Observable @MainActor final class KeySlot` with:
    - `baseUrl`, `draft`, `masked`, `test`, `failure`, `note`, `addressProblem`, `canSave`, and `canTest`;
    - `point(at:)`, `save()`, `remove()`, `runTest() async`, and `static preview(baseUrl:catalog:saved:draft:test:)`.
  - Task 7 draws these.

- [ ] **Step 1: Write the failing test**

`ios/AppTests/ProviderModelTests.swift`. `aLateAnswerNeverLandsOnAnotherProvider` is left out for now; Step 5 adds it.

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct ProviderModelTests {
    let catalog: ProviderCatalog
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let groq = "https://api.groq.com/openai/v1"

    init() throws {
        catalog = try BundledRules.catalog()
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func model(status: Int = 200) -> ProviderModel {
        ProviderModel(catalog: catalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        })
    }

    func preset(_ id: String) throws -> ProviderCatalog.Provider {
        try #require(catalog.providers.first { $0.id == id })
    }

    @Test func startsOnGroqWithCleanupRidingIt() {
        let model = model()
        #expect(model.transcriptionPreset?.id == "groq")
        #expect(model.settings.transcription.sttModel == "whisper-large-v3-turbo")
        #expect(model.transcriptionKey.baseUrl == groq)
        #expect(model.cleanupSharesKey)
    }

    @Test func aPresetFillsItsAddressAndFirstModels() throws {
        let model = model()
        model.chooseTranscription(try preset("openai"))
        #expect(model.settings.transcription.baseUrl == "https://api.openai.com/v1")
        #expect(model.settings.transcription.sttModel == "gpt-transcribe")
        #expect(model.settings.transcription.llmModel == "gpt-5.6-luna")
    }

    @Test func customClearsTheAddressForTyping() {
        let model = model()
        model.chooseTranscription(nil)
        #expect(model.transcriptionPreset == nil)
        #expect(model.settings.transcription.baseUrl == "")
        #expect(model.transcriptionKey.addressProblem == "Enter the provider's base URL.")
    }

    @Test func switchingProvidersNeverAsksForAKeyTwice() throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.masked == nil)
        model.transcriptionKey.draft = "sk-openaiopenai2222"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("groq"))
        #expect(model.transcriptionKey.masked == "••••1111")
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.masked == "••••2222")
    }

    @Test func savingTrimsThePasteAndClearsTheField() throws {
        let model = model()
        model.transcriptionKey.draft = "  gsk_groqgroq1111\n"
        model.transcriptionKey.save()
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
        #expect(model.transcriptionKey.draft == "")
        #expect(model.transcriptionKey.masked == "••••1111")
    }

    /// The note is gentle: a key with the wrong prefix still saves.
    @Test func aWrongPrefixGetsANoteAndStillSaves() throws {
        let model = model()
        model.transcriptionKey.draft = "sk-notgroq1111"
        #expect(model.transcriptionKey.note == .expected(prefixes: ["gsk_"], provider: "Groq"))
        #expect(model.transcriptionKey.canSave)
        model.transcriptionKey.save()
        #expect(model.transcriptionKey.masked == "••••1111")
    }

    @Test(arguments: [(200, ConnectionVerdict.works), (401, .keyRejected(status: 401))])
    func testAnswersInline(_ status: Int, _ verdict: ConnectionVerdict) async throws {
        let model = model(status: status)
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        await model.transcriptionKey.runTest()
        #expect(model.transcriptionKey.test == .done(verdict))
    }

    @Test func noKeyMeansNoTest() async {
        let model = model()
        #expect(!model.transcriptionKey.canTest)
        await model.transcriptionKey.runTest()
        #expect(model.transcriptionKey.test == .idle)
    }

    /// A verdict earned at one address never vouches for another.
    @Test func switchingProvidersClearsTheVerdict() async throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        await model.transcriptionKey.runTest()
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.test == .idle)
    }

    @Test func separateCleanupGetsItsOwnKeyUnlessItSharesTheAddress() throws {
        let model = model()
        model.setSeparateCleanup(true)
        model.chooseCleanup(try preset("groq"))
        #expect(model.cleanupSharesKey)
        model.chooseCleanup(try preset("deepseek"))
        #expect(!model.cleanupSharesKey)
        #expect(model.cleanupKey.baseUrl == "https://api.deepseek.com")
        #expect(model.settings.cleanupModel == "deepseek-flash")
    }

    @Test func theCleanupModelFollowsWhereCleanupRuns() throws {
        let model = model()
        model.setCleanupModel("openai/gpt-oss-20b")
        #expect(model.settings.transcription.llmModel == "openai/gpt-oss-20b")
        model.setSeparateCleanup(true)
        model.chooseCleanup(try preset("deepseek"))
        model.setCleanupModel("deepseek-other")
        #expect(model.settings.cleanup.llmModel == "deepseek-other")
        #expect(model.settings.transcription.llmModel == "openai/gpt-oss-20b")
    }

    @Test func unreadableSavedChoicesFallBackToDefaults() {
        defaults.set(Data("not json".utf8), forKey: ConnectionStore.defaultsKey)
        #expect(model().transcriptionPreset?.id == "groq")
    }

    @Test func choicesSurviveARelaunch() throws {
        model().chooseTranscription(try preset("mistral"))
        #expect(model().transcriptionPreset?.id == "mistral")
    }

    @Test func aKeyNeverReachesTheDefaults() throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("openai"))
        #expect(!"\(defaults.dictionaryRepresentation())".contains("gsk_groqgroq1111"))
    }

    @Test func aKeychainFailureIsSaidPlainly() {
        let slot = KeySlot(baseUrl: groq, catalog: catalog, ring: FailingRing(), send: { _ in throw URLError(.cancelled) })
        #expect(slot.failure == "murmur could not reach the Keychain (code -25308). Try again.")
        slot.draft = "gsk_groqgroq1111"
        slot.save()
        #expect(slot.draft == "gsk_groqgroq1111")
    }
}

/// A Keychain that refuses everything, as a locked phone can.
private struct FailingRing: KeyRing {
    func key(for baseUrl: String) throws -> APIKey? { throw KeychainError.status(-25308) }
    func save(_ key: APIKey, for baseUrl: String) throws { throw KeychainError.status(-25308) }
    func remove(for baseUrl: String) throws { throw KeychainError.status(-25308) }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app build fails with `cannot find 'ProviderModel' in scope` and `cannot find 'ConnectionStore' in scope`.

- [ ] **Step 3: Write the store and the model**

`ios/App/Settings/ConnectionStore.swift`:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Where the provider choices live between launches: the app's own
// defaults, never the app group, since the keyboard makes no requests
// (ios/prd.json conventions.privacy). Base URLs and model ids only; the
// key stays in the key ring.
import Foundation
import MurmurCore

struct ConnectionStore {
    static let defaultsKey = "connection"
    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The saved choices, or the catalog's defaults when there are none
    /// or they no longer read.
    func load(catalog: ProviderCatalog) -> ConnectionSettings {
        guard let data = defaults.data(forKey: Self.defaultsKey),
              let saved = try? JSONDecoder().decode(ConnectionSettings.self, from: data)
        else { return ConnectionSettings(defaultsFrom: catalog) }
        return saved
    }

    func save(_ settings: ConnectionSettings) {
        defaults.set(try? JSONEncoder().encode(settings), forKey: Self.defaultsKey)
    }
}

enum BundledRules {
    /// The provider catalog the build copied into the app (shared/).
    static func catalog() throws -> ProviderCatalog {
        guard let directory = Bundle.main.url(forResource: "shared", withExtension: nil) else {
            throw SharedDataError.missing("shared")
        }
        return try SharedData(directory: directory).decode(ProviderCatalog.self, from: "provider-catalog.json")
    }
}
```

`ios/App/Provider/ProviderModel.swift`. This first version keeps every verdict; Step 7 adds the guard Step 5's test asks for.

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen's state (ios/prd.json IOS-005): which presets are
// picked for transcription and cleanup, and one key slot for each. The
// choices save to ConnectionStore as they change; keys go to the key ring.
import Foundation
import MurmurCore
import Observation

@Observable @MainActor
final class ProviderModel {
    let catalog: ProviderCatalog
    private(set) var settings: ConnectionSettings
    let transcriptionKey: KeySlot
    let cleanupKey: KeySlot
    @ObservationIgnored private let store: ConnectionStore

    init(catalog: ProviderCatalog, store: ConnectionStore, ring: any KeyRing, send: @escaping ConnectionTest.Send) {
        self.catalog = catalog
        self.store = store
        let settings = store.load(catalog: catalog)
        self.settings = settings
        transcriptionKey = KeySlot(baseUrl: settings.transcription.baseUrl, catalog: catalog, ring: ring, send: send)
        cleanupKey = KeySlot(baseUrl: settings.cleanupBaseUrl, catalog: catalog, ring: ring, send: send)
    }

    var transcriptionPreset: ProviderCatalog.Provider? { catalog.preset(forBaseUrl: settings.transcription.baseUrl) }
    var cleanupPreset: ProviderCatalog.Provider? { catalog.preset(forBaseUrl: settings.cleanupBaseUrl) }

    /// Separate cleanup at transcription's address uses transcription's key.
    var cleanupSharesKey: Bool {
        !settings.cleanup.separate
            || BaseURL.normalized(settings.cleanup.baseUrl) == BaseURL.normalized(settings.transcription.baseUrl)
    }

    /// A preset fills the address and its first models; nil keeps the
    /// address for editing as Custom.
    func chooseTranscription(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if transcriptionPreset != nil { update { $0.transcription.baseUrl = "" } }
            return
        }
        update {
            $0.transcription.baseUrl = preset.url(for: .transcription)
            $0.transcription.sttModel = preset.sttModels.first?.id ?? $0.transcription.sttModel
            $0.transcription.llmModel = preset.llmModels.first?.id ?? $0.transcription.llmModel
        }
    }

    func chooseCleanup(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if cleanupPreset != nil { update { $0.cleanup.baseUrl = "" } }
            return
        }
        update {
            $0.cleanup.baseUrl = preset.url(for: .cleanup)
            $0.cleanup.llmModel = preset.llmModels.first?.id ?? $0.cleanup.llmModel
        }
    }

    func setSeparateCleanup(_ separate: Bool) { update { $0.cleanup.separate = separate } }
    func setTranscriptionBaseUrl(_ url: String) { update { $0.transcription.baseUrl = url } }
    func setSttModel(_ model: String) { update { $0.transcription.sttModel = model } }
    func setCleanupBaseUrl(_ url: String) { update { $0.cleanup.baseUrl = url } }

    /// The cleanup model, wherever cleanup runs.
    func setCleanupModel(_ model: String) {
        update {
            if $0.cleanup.separate { $0.cleanup.llmModel = model } else { $0.transcription.llmModel = model }
        }
    }

    private func update(_ change: (inout ConnectionSettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        settings = next
        store.save(next)
        transcriptionKey.point(at: next.transcription.baseUrl)
        cleanupKey.point(at: next.cleanupBaseUrl)
    }
}

enum TestState: Equatable {
    case idle
    case testing
    case done(ConnectionVerdict)
}

/// One provider's key: the field, the saved mask, and the test.
@Observable @MainActor
final class KeySlot {
    private(set) var baseUrl: String
    var draft = ""
    /// The saved key's mask; the key itself is read only to send it.
    private(set) var masked: String?
    private(set) var test: TestState = .idle
    /// A Keychain failure, said plainly.
    private(set) var failure: String?
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send

    init(baseUrl: String, catalog: ProviderCatalog, ring: any KeyRing, send: @escaping ConnectionTest.Send) {
        self.baseUrl = baseUrl
        self.catalog = catalog
        self.ring = ring
        self.send = send
        reload()
    }

    var note: KeyNote? { catalog.keyNote(for: draft, baseUrl: baseUrl) }
    var addressProblem: String? { BaseURL.problem(baseUrl) }
    var canSave: Bool { addressProblem == nil && APIKey(draft) != nil }
    var canTest: Bool { addressProblem == nil && masked != nil && test != .testing }

    /// Follows a new address: that provider's saved key, and no verdict,
    /// since one earned against another address never vouches for this one.
    func point(at baseUrl: String) {
        guard BaseURL.normalized(baseUrl) != BaseURL.normalized(self.baseUrl) else { return }
        self.baseUrl = baseUrl
        draft = ""
        test = .idle
        reload()
    }

    func save() {
        guard canSave, let key = APIKey(draft) else { return }
        attempt { try ring.save(key, for: baseUrl) }
        if failure == nil {
            draft = ""
            test = .idle
            reload()
        }
    }

    func remove() {
        attempt { try ring.remove(for: baseUrl) }
        test = .idle
        reload()
    }

    func runTest() async {
        guard canTest else { return }
        let key: APIKey?
        do {
            key = try ring.key(for: baseUrl)
        } catch {
            failure = Self.words(for: error)
            return
        }
        guard let key else { return }
        test = .testing
        let tested = baseUrl
        let verdict = await ConnectionTest.run(baseUrl: tested, key: key, send: send)
        test = .done(verdict)
    }

    private func reload() {
        do {
            masked = try ring.key(for: baseUrl)?.masked
            failure = nil
        } catch {
            masked = nil
            failure = Self.words(for: error)
        }
    }

    private func attempt(_ work: () throws -> Void) {
        do {
            try work()
            failure = nil
        } catch {
            failure = Self.words(for: error)
        }
    }

    private static func words(for error: Error) -> String {
        if case KeychainError.status(let status) = error {
            return "murmur could not reach the Keychain (code \(status)). Try again."
        }
        return "murmur could not reach the Keychain. Try again."
    }
}

extension KeySlot {
    /// A slot in a fixed state, for previews.
    static func preview(baseUrl: String, catalog: ProviderCatalog, saved: String? = nil, draft: String = "", test: TestState = .idle) -> KeySlot {
        let ring = MemoryKeyRing()
        if let saved, let key = APIKey(saved) { try? ring.save(key, for: baseUrl) }
        let slot = KeySlot(baseUrl: baseUrl, catalog: catalog, ring: ring, send: { _ in throw URLError(.notConnectedToInternet) })
        slot.draft = draft
        slot.test = test
        return slot
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`
Expected: `** TEST SUCCEEDED **`, with every ProviderModelTests test passing.

- [ ] **Step 5: Add the late-answer test**

Add to `ProviderModelTests`, just above `unreadableSavedChoicesFallBackToDefaults`:

```swift
    /// An answer that lands after the person moved to another provider
    /// is dropped, so it never vouches for the new one.
    @Test func aLateAnswerNeverLandsOnAnotherProvider() async throws {
        let gate = AsyncStream<Void>.makeStream()
        let model = ProviderModel(catalog: catalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { request in
            for await _ in gate.stream { break }
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        let running = Task { await model.transcriptionKey.runTest() }
        for _ in 0..<100 where model.transcriptionKey.test != .testing { await Task.yield() }
        #expect(model.transcriptionKey.test == .testing)
        model.chooseTranscription(try preset("openai"))
        gate.continuation.yield()
        gate.continuation.finish()
        await running.value
        #expect(model.transcriptionKey.test == .idle)
    }
```

- [ ] **Step 6: Run it to see it fail**

Run: `npm run ios:test`
Expected: `aLateAnswerNeverLandsOnAnotherProvider` fails. Its last expectation sees `.done(.works)` where `.idle` was expected, because the first version stores every verdict, even one for an address the person already left.

- [ ] **Step 7: Drop an answer for an address the person left**

In `KeySlot.runTest()`, replace the last line, `test = .done(verdict)`, with:

```swift
        if BaseURL.normalized(tested) == BaseURL.normalized(baseUrl) { test = .done(verdict) }
```

The file now matches this final version:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen's state (ios/prd.json IOS-005): which presets are
// picked for transcription and cleanup, and one key slot for each. The
// choices save to ConnectionStore as they change; keys go to the key ring.
import Foundation
import MurmurCore
import Observation

@Observable @MainActor
final class ProviderModel {
    let catalog: ProviderCatalog
    private(set) var settings: ConnectionSettings
    let transcriptionKey: KeySlot
    let cleanupKey: KeySlot
    @ObservationIgnored private let store: ConnectionStore

    init(catalog: ProviderCatalog, store: ConnectionStore, ring: any KeyRing, send: @escaping ConnectionTest.Send) {
        self.catalog = catalog
        self.store = store
        let settings = store.load(catalog: catalog)
        self.settings = settings
        transcriptionKey = KeySlot(baseUrl: settings.transcription.baseUrl, catalog: catalog, ring: ring, send: send)
        cleanupKey = KeySlot(baseUrl: settings.cleanupBaseUrl, catalog: catalog, ring: ring, send: send)
    }

    var transcriptionPreset: ProviderCatalog.Provider? { catalog.preset(forBaseUrl: settings.transcription.baseUrl) }
    var cleanupPreset: ProviderCatalog.Provider? { catalog.preset(forBaseUrl: settings.cleanupBaseUrl) }

    /// Separate cleanup at transcription's address uses transcription's key.
    var cleanupSharesKey: Bool {
        !settings.cleanup.separate
            || BaseURL.normalized(settings.cleanup.baseUrl) == BaseURL.normalized(settings.transcription.baseUrl)
    }

    /// A preset fills the address and its first models; nil keeps the
    /// address for editing as Custom.
    func chooseTranscription(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if transcriptionPreset != nil { update { $0.transcription.baseUrl = "" } }
            return
        }
        update {
            $0.transcription.baseUrl = preset.url(for: .transcription)
            $0.transcription.sttModel = preset.sttModels.first?.id ?? $0.transcription.sttModel
            $0.transcription.llmModel = preset.llmModels.first?.id ?? $0.transcription.llmModel
        }
    }

    func chooseCleanup(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if cleanupPreset != nil { update { $0.cleanup.baseUrl = "" } }
            return
        }
        update {
            $0.cleanup.baseUrl = preset.url(for: .cleanup)
            $0.cleanup.llmModel = preset.llmModels.first?.id ?? $0.cleanup.llmModel
        }
    }

    func setSeparateCleanup(_ separate: Bool) { update { $0.cleanup.separate = separate } }
    func setTranscriptionBaseUrl(_ url: String) { update { $0.transcription.baseUrl = url } }
    func setSttModel(_ model: String) { update { $0.transcription.sttModel = model } }
    func setCleanupBaseUrl(_ url: String) { update { $0.cleanup.baseUrl = url } }

    /// The cleanup model, wherever cleanup runs.
    func setCleanupModel(_ model: String) {
        update {
            if $0.cleanup.separate { $0.cleanup.llmModel = model } else { $0.transcription.llmModel = model }
        }
    }

    private func update(_ change: (inout ConnectionSettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        settings = next
        store.save(next)
        transcriptionKey.point(at: next.transcription.baseUrl)
        cleanupKey.point(at: next.cleanupBaseUrl)
    }
}

enum TestState: Equatable {
    case idle
    case testing
    case done(ConnectionVerdict)
}

/// One provider's key: the field, the saved mask, and the test.
@Observable @MainActor
final class KeySlot {
    private(set) var baseUrl: String
    var draft = ""
    /// The saved key's mask; the key itself is read only to send it.
    private(set) var masked: String?
    private(set) var test: TestState = .idle
    /// A Keychain failure, said plainly.
    private(set) var failure: String?
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send

    init(baseUrl: String, catalog: ProviderCatalog, ring: any KeyRing, send: @escaping ConnectionTest.Send) {
        self.baseUrl = baseUrl
        self.catalog = catalog
        self.ring = ring
        self.send = send
        reload()
    }

    var note: KeyNote? { catalog.keyNote(for: draft, baseUrl: baseUrl) }
    var addressProblem: String? { BaseURL.problem(baseUrl) }
    var canSave: Bool { addressProblem == nil && APIKey(draft) != nil }
    var canTest: Bool { addressProblem == nil && masked != nil && test != .testing }

    /// Follows a new address: that provider's saved key, and no verdict,
    /// since one earned against another address never vouches for this one.
    func point(at baseUrl: String) {
        guard BaseURL.normalized(baseUrl) != BaseURL.normalized(self.baseUrl) else { return }
        self.baseUrl = baseUrl
        draft = ""
        test = .idle
        reload()
    }

    func save() {
        guard canSave, let key = APIKey(draft) else { return }
        attempt { try ring.save(key, for: baseUrl) }
        if failure == nil {
            draft = ""
            test = .idle
            reload()
        }
    }

    func remove() {
        attempt { try ring.remove(for: baseUrl) }
        test = .idle
        reload()
    }

    func runTest() async {
        guard canTest else { return }
        let key: APIKey?
        do {
            key = try ring.key(for: baseUrl)
        } catch {
            failure = Self.words(for: error)
            return
        }
        guard let key else { return }
        test = .testing
        let tested = baseUrl
        let verdict = await ConnectionTest.run(baseUrl: tested, key: key, send: send)
        if BaseURL.normalized(tested) == BaseURL.normalized(baseUrl) { test = .done(verdict) }
    }

    private func reload() {
        do {
            masked = try ring.key(for: baseUrl)?.masked
            failure = nil
        } catch {
            masked = nil
            failure = Self.words(for: error)
        }
    }

    private func attempt(_ work: () throws -> Void) {
        do {
            try work()
            failure = nil
        } catch {
            failure = Self.words(for: error)
        }
    }

    private static func words(for error: Error) -> String {
        if case KeychainError.status(let status) = error {
            return "murmur could not reach the Keychain (code \(status)). Try again."
        }
        return "murmur could not reach the Keychain. Try again."
    }
}

extension KeySlot {
    /// A slot in a fixed state, for previews.
    static func preview(baseUrl: String, catalog: ProviderCatalog, saved: String? = nil, draft: String = "", test: TestState = .idle) -> KeySlot {
        let ring = MemoryKeyRing()
        if let saved, let key = APIKey(saved) { try? ring.save(key, for: baseUrl) }
        let slot = KeySlot(baseUrl: baseUrl, catalog: catalog, ring: ring, send: { _ in throw URLError(.notConnectedToInternet) })
        slot.draft = draft
        slot.test = test
        return slot
    }
}
```

- [ ] **Step 8: Run it to see it pass**

Run: `npm run ios:test`
Expected: `** TEST SUCCEEDED **`, ProviderModelTests all passing.

- [ ] **Step 9: Commit**

Run the gates, then:

```bash
git add ios/App/Settings/ConnectionStore.swift ios/App/Provider/ProviderModel.swift ios/AppTests/ProviderModelTests.swift
git commit -m "IOS-005: the Provider screen's state saves choices and keeps one key slot per provider"
git pull --rebase
```

---

### Task 7: The Provider screen

**Files:**
- Create: `ios/App/Provider/ProviderCopy.swift`
- Create: `ios/App/Provider/KeySlotView.swift`
- Create: `ios/App/Provider/ProviderScreen.swift`
- Modify: `ios/App/ContentView.swift`
- Test: `ios/AppTests/ProviderCopyTests.swift`

**Interfaces:**
- Consumes: Task 6's model and slots, `Tokens` (generated).
- Produces:
  - `ConnectionVerdict.words(provider:) -> (title: String, detail: String)`, `ConnectionVerdict.isSuccess`, `KeyNote.words`, and `ProviderName.of(_:baseUrl:)`.
  - The views `KeySlotView`, `Verdict`, `Note`, `RowAction`, `ProviderScreen`, `SectionTitle`, `AddressField`, `ModelField`, and `ProviderRoute`.
  - `ProviderModel.live()` and the DEBUG-only `previewCatalog`.

Design notes this task carries out, from the skills consulted and DESIGN.md:
- The night studio ground (`ink`) with `panel` rows.
- Section titles in brand gold, sentence case (`.textCase(nil)`).
- Action rows in brand gold, dimmed while they cannot run.
- Works in `ok` green and failures in clean `red`; the wrong-prefix note is gentle `textDim` with an info symbol.
- Every answer appears inline, right under Test connection, and VoiceOver announces it.
- The key field is a `SecureField`, so the key can never be copied out. It also takes `.privacySensitive()`.
- Remove asks first, and only its confirming button is red.
- No animation beyond the system's.
- Previews cover no key, the wrong prefix, a saved key, testing, works, key rejected, no connection, and a provider message, plus the whole screen with and without a key.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct ProviderCopyTests {
    @Test func everyVerdictHasATitleAndWhatToDo() {
        #expect(ConnectionVerdict.works.words(provider: "Groq") == ("Works", "murmur reached Groq with this key."))
        #expect(ConnectionVerdict.keyRejected(status: 401).words(provider: "Groq").detail == "Groq did not accept this key. Copy a fresh one from Groq, paste it here, and save it.")
        #expect(ConnectionVerdict.noConnection.words(provider: "Groq").title == "No connection")
        #expect(ConnectionVerdict.providerMessage("Model overloaded").words(provider: "Groq") == ("Groq says", "Model overloaded"))
    }

    /// A 403 can be an account that is not set up yet, so it says so.
    @Test func a403MentionsTheAccount() {
        let words = ConnectionVerdict.keyRejected(status: 403).words(provider: "Groq")
        #expect(words.title == "Key rejected")
        #expect(words.detail.contains("account is active"))
    }

    @Test func notesSayWhatToCheck() {
        #expect(KeyNote.looksLike(provider: "Groq").words == "This looks like a Groq key. It works only with Groq.")
        #expect(KeyNote.expected(prefixes: ["gsk_"], provider: "Groq").words == "Groq keys start with gsk_. Check that you copied the whole key.")
    }

    @Test func aCustomProviderGoesByItsHost() {
        #expect(ProviderName.of(nil, baseUrl: "https://api.example.com/v1") == "api.example.com")
        #expect(ProviderName.of(nil, baseUrl: "") == "your provider")
    }

    /// The product name stays lowercase even where a sentence starts.
    @Test func murmurStaysLowercase() {
        for verdict in [ConnectionVerdict.works, .keyRejected(status: 401), .keyRejected(status: 403), .noConnection] {
            #expect(!verdict.words(provider: "Groq").detail.contains("Murmur"))
        }
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app build fails with `value of type 'ConnectionVerdict' has no member 'words'` and `cannot find 'ProviderName' in scope`.

- [ ] **Step 3: Write the words**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen's words, in one place: plain, sentence case, and
// for every failure what happened and how to fix it (ios/prd.json
// conventions.design).
import Foundation
import MurmurCore

extension ConnectionVerdict {
    /// A short title and the sentence under it.
    func words(provider: String) -> (title: String, detail: String) {
        switch self {
        case .works:
            return ("Works", "murmur reached \(provider) with this key.")
        case .keyRejected(let status) where status == 403:
            return ("Key rejected", "\(provider) turned this key away (code 403). Check the key, and that your \(provider) account is active.")
        case .keyRejected:
            return ("Key rejected", "\(provider) did not accept this key. Copy a fresh one from \(provider), paste it here, and save it.")
        case .noConnection:
            return ("No connection", "murmur could not reach \(provider). Check that this iPhone is online, then test again.")
        case .providerMessage(let message):
            return ("\(provider) says", message)
        }
    }

    var isSuccess: Bool { self == .works }
}

extension KeyNote {
    var words: String {
        switch self {
        case .looksLike(let provider):
            return "This looks like a \(provider) key. It works only with \(provider)."
        case .expected(let prefixes, let provider):
            return "\(provider) keys start with \(prefixes.joined(separator: " or ")). Check that you copied the whole key."
        }
    }
}

enum ProviderName {
    /// A preset's name, else the custom address's host, else a plain stand-in.
    static func of(_ preset: ProviderCatalog.Provider?, baseUrl: String) -> String {
        if let preset { return preset.name }
        if let host = URLComponents(string: baseUrl)?.host, !host.isEmpty { return host }
        return "your provider"
    }
}
```

- [ ] **Step 4: Write the key rows**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// One provider's key rows: paste and save, or the saved mask and Remove;
// Get a key; Test connection; and the answer, inline (ios/prd.json
// IOS-005). The key field is secure, so the key can never be copied out.
import MurmurCore
import SwiftUI

struct KeySlotView: View {
    @Bindable var slot: KeySlot
    let provider: String
    let keyPage: URL?
    @State private var confirmingRemove = false

    var body: some View {
        if let masked = slot.masked {
            LabeledContent("\(provider) key") {
                Text(masked).monospaced().foregroundStyle(Tokens.textDim)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(provider) key saved, ending in \(masked.suffix(4))")
            Button("Remove key") { confirmingRemove = true }
                .buttonStyle(RowAction())
                .confirmationDialog("Remove your \(provider) key from this iPhone?", isPresented: $confirmingRemove, titleVisibility: .visible) {
                    Button("Remove key", role: .destructive) { slot.remove() }
                }
        } else {
            SecureField("Paste your \(provider) key", text: $slot.draft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .privacySensitive()
                .submitLabel(.done)
                .onSubmit { slot.save() }
                .accessibilityLabel("\(provider) key")
            if let note = slot.note {
                Note(text: note.words, color: Tokens.textDim, symbol: "info.circle")
            }
            Button("Save key") { slot.save() }
                .buttonStyle(RowAction())
                .disabled(!slot.canSave)
        }
        if let keyPage {
            Link("Get a \(provider) key", destination: keyPage)
                .buttonStyle(RowAction())
        }
        Button {
            Task { await slot.runTest() }
        } label: {
            if slot.test == .testing {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Testing…")
                }
            } else {
                Text("Test connection")
            }
        }
        .buttonStyle(RowAction())
        .disabled(!slot.canTest)
        if case .done(let verdict) = slot.test {
            Verdict(verdict: verdict, provider: provider)
        }
        if let failure = slot.failure {
            Note(text: failure, color: Tokens.red, symbol: "exclamationmark.triangle")
        }
    }
}

/// The test's answer: a title and what to do, green for works and clean
/// red for every failure. VoiceOver hears it as soon as it lands.
struct Verdict: View {
    let verdict: ConnectionVerdict
    let provider: String

    var body: some View {
        let words = verdict.words(provider: provider)
        let color = verdict.isSuccess ? Tokens.ok : Tokens.red
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: verdict.isSuccess ? "checkmark.circle" : "xmark.circle")
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 4) {
                Text(words.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(color)
                Text(words.detail)
                    .font(.subheadline)
                    .foregroundStyle(Tokens.text)
            }
        }
        .accessibilityElement(children: .combine)
        .onAppear {
            AccessibilityNotification.Announcement("\(words.title). \(words.detail)").post()
        }
    }
}

/// An action row in brand gold, dimmed while it cannot run. The whole
/// row is the tap target.
struct RowAction: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isEnabled ? Tokens.brand : Tokens.textDim)
            .opacity(configuration.isPressed ? 0.6 : 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
    }
}

/// A one-line note under a field.
struct Note: View {
    let text: String
    let color: Color
    let symbol: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.footnote)
            .foregroundStyle(color)
    }
}

#if DEBUG
#Preview("No key") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog)) }
#Preview("Wrong prefix") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, draft: "sk-abcdefgh1234")) }
#Preview("Saved key") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234")) }
#Preview("Testing") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .testing)) }
#Preview("Works") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.works))) }
#Preview("Key rejected") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.keyRejected(status: 401)))) }
#Preview("No connection") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.noConnection))) }
#Preview("Provider message") { SlotPreview(slot: .preview(baseUrl: groqURL, catalog: previewCatalog, saved: "gsk_abcdefgh1234", test: .done(.providerMessage("Rate limit reached for model whisper-large-v3-turbo. Try again in 20s.")))) }

private let groqURL = "https://api.groq.com/openai/v1"

private struct SlotPreview: View {
    let slot: KeySlot

    var body: some View {
        Form {
            Section {
                KeySlotView(slot: slot, provider: "Groq", keyPage: URL(string: "https://console.groq.com/keys"))
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
    }
}
#endif
```

- [ ] **Step 5: Write the screen**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen (ios/prd.json IOS-005): pick who turns your voice
// into text and who cleans it up, paste each key once, and test it. The
// presets come from shared/provider-catalog.json, Groq first; Custom
// takes any OpenAI-compatible https address.
import MurmurCore
import SwiftUI

struct ProviderScreen: View {
    @State var model: ProviderModel

    var body: some View {
        Form {
            Section {
                presetPicker(role: .transcription)
                if model.transcriptionPreset == nil {
                    AddressField(url: model.settings.transcription.baseUrl, set: model.setTranscriptionBaseUrl)
                }
                ModelField(
                    label: "Transcription model",
                    value: model.settings.transcription.sttModel,
                    options: model.transcriptionPreset?.sttModels.map(\.id) ?? [],
                    set: model.setSttModel
                )
                KeySlotView(
                    slot: model.transcriptionKey,
                    provider: ProviderName.of(model.transcriptionPreset, baseUrl: model.settings.transcription.baseUrl),
                    keyPage: model.transcriptionPreset?.keyUrl.flatMap(URL.init(string:))
                )
            } header: {
                SectionTitle("Transcription")
            } footer: {
                Text("Turns what you say into text.").foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Picker("Cleanup runs on", selection: Binding(get: { model.settings.cleanup.separate }, set: model.setSeparateCleanup)) {
                    Text("Same as transcription").tag(false)
                    Text("Separate").tag(true)
                }
                .pickerStyle(.segmented)
                if model.settings.cleanup.separate {
                    presetPicker(role: .cleanup)
                    if model.cleanupPreset == nil {
                        AddressField(url: model.settings.cleanup.baseUrl, set: model.setCleanupBaseUrl)
                    }
                }
                ModelField(
                    label: "Cleanup model",
                    value: model.settings.cleanupModel,
                    options: model.cleanupPreset?.llmModels.map(\.id) ?? [],
                    set: model.setCleanupModel
                )
                if model.cleanupSharesKey {
                    Text("Uses your transcription key.")
                        .foregroundStyle(Tokens.textDim)
                } else {
                    KeySlotView(
                        slot: model.cleanupKey,
                        provider: ProviderName.of(model.cleanupPreset, baseUrl: model.settings.cleanup.baseUrl),
                        keyPage: model.cleanupPreset?.keyUrl.flatMap(URL.init(string:))
                    )
                }
            } header: {
                SectionTitle("Cleanup")
            } footer: {
                Text("Fixes punctuation and filler words after each take.").foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Text("Your keys stay on this iPhone, in its Keychain. Only the murmur app can read them; the keyboard never can, and they never sync to another device.")
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Provider and key")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func presetPicker(role: ProviderRole) -> some View {
        let presets = model.catalog.presets(for: role)
        let current = role == .transcription ? model.transcriptionPreset : model.cleanupPreset
        return Picker("Provider", selection: Binding<String>(
            get: { current?.id ?? "custom" },
            set: { id in
                let preset = presets.first { $0.id == id }
                if role == .transcription { model.chooseTranscription(preset) } else { model.chooseCleanup(preset) }
            }
        )) {
            ForEach(presets, id: \.id) { Text($0.name).tag($0.id) }
            Text("Custom").tag("custom")
        }
    }
}

/// A section title in brand gold, sentence case.
struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Tokens.brand)
            .textCase(nil)
    }
}

/// A custom provider's base URL, with what to fix said under it.
struct AddressField: View {
    let url: String
    let set: @MainActor (String) -> Void

    var body: some View {
        TextField("Base URL", text: Binding(get: { url }, set: set), prompt: Text("https://api.example.com/v1"))
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        if let problem = BaseURL.problem(url) {
            Note(text: problem, color: Tokens.red, symbol: "exclamationmark.triangle")
        }
    }
}

/// A model: the preset's suggestions as a picker, or a field for any id,
/// as desktop's ModelPicker offers. The section title says which model,
/// so the row says Model and VoiceOver hears the full name.
struct ModelField: View {
    let label: String
    let value: String
    let options: [String]
    let set: @MainActor (String) -> Void

    var body: some View {
        if options.isEmpty {
            TextField("Model", text: Binding(get: { value }, set: set), prompt: Text("Model id"))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel(label)
        } else {
            Picker("Model", selection: Binding(get: { value }, set: set)) {
                ForEach(options, id: \.self) { id in
                    Text(id).tag(id)
                }
                if !options.contains(value) {
                    Text(value).tag(value)
                }
            }
            .pickerStyle(.navigationLink)
            .accessibilityLabel(label)
        }
    }
}

extension ProviderModel {
    /// The real screen: the bundled catalog, saved choices, the Keychain,
    /// and a session that keeps no cookies or cache.
    static func live() -> ProviderModel? {
        guard let catalog = try? BundledRules.catalog() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        return ProviderModel(catalog: catalog, store: ConnectionStore(), ring: KeychainKeyRing(), send: { try await session.data(for: $0) })
    }
}

/// Opens the Provider screen, built once the catalog is read.
struct ProviderRoute: View {
    @State private var model: ProviderModel?
    @State private var failed = false

    var body: some View {
        Group {
            if let model {
                ProviderScreen(model: model)
            } else if failed {
                Note(text: "murmur could not read its provider list. Reinstall murmur to fix it.", color: Tokens.red, symbol: "exclamationmark.triangle")
                    .padding()
            }
        }
        .task {
            guard model == nil else { return }
            model = ProviderModel.live()
            failed = model == nil
        }
    }
}

#if DEBUG
let previewCatalog: ProviderCatalog = {
    do {
        return try BundledRules.catalog()
    } catch {
        preconditionFailure("the bundled catalog does not load: \(error)")
    }
}()

@MainActor private func previewModel(_ keys: [String: String] = [:]) -> ProviderModel {
    let ring = MemoryKeyRing(Dictionary(uniqueKeysWithValues: keys.compactMap { url, key in APIKey(key).map { (url, $0) } }))
    let defaults = UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)") ?? .standard
    return ProviderModel(catalog: previewCatalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { _ in throw URLError(.notConnectedToInternet) })
}

#Preview("No key") {
    NavigationStack { ProviderScreen(model: previewModel()) }.preferredColorScheme(.dark)
}

#Preview("Saved key") {
    NavigationStack { ProviderScreen(model: previewModel(["https://api.groq.com/openai/v1": "gsk_abcdefgh1234"])) }.preferredColorScheme(.dark)
}
#endif
```

- [ ] **Step 6: Link it from the placeholder home**

Replace `ios/App/ContentView.swift` with:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it: the way to the
/// Provider screen, and nothing else.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            List {
                NavigationLink("Provider and key") { ProviderRoute() }
                    .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle("murmur")
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 7: Run it to see it pass, and lint**

Run: `npm run ios:test`
Expected: `** TEST SUCCEEDED **` with no compiler warnings. ProviderCopyTests passes, and the result bundle's total is the 9 tests from before plus this story's 25.

Run: `npm run test`
Expected: `design lint: clean` and `headers: every source file declares GPL-3.0-only`, then vitest green.

- [ ] **Step 8: Commit**

Run the gates, then:

```bash
git add ios/App/Provider/ProviderCopy.swift ios/App/Provider/KeySlotView.swift ios/App/Provider/ProviderScreen.swift ios/App/ContentView.swift ios/AppTests/ProviderCopyTests.swift
git commit -m "IOS-005: the Provider screen picks providers, saves keys, and answers Test connection inline"
git pull --rebase
```

---

### Task 8: Two smoke checks: the key ring and Test connection

**Files:**
- Create: `ios/App/Smoke/StubProtocol.swift`
- Modify: `ios/App/Smoke/SmokeRunner.swift`

**Interfaces:**
- Consumes: `KeychainKeyRing` and `KeychainStore.accessGroup` (Task 5), `ConnectionTest.run` (Task 4), `AppGroup.identifier`.
- Produces: the smoke checks `keyRing` and `connectionTest` in `SMOKE_RESULT`.

- [ ] **Step 1: Add the checks to the smoke**

Replace `ios/App/Smoke/SmokeRunner.swift` with the version below. It lists `keyRing` and `connectionTest`, and adds `checkKeyRing`, `checkConnectionTest`, and `waitFor`.

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The headless smoke (npm run ios:smoke): launched with --smoke, the app
// runs every subsystem check, prints one SMOKE_RESULT line, and exits.
// The same contract as desktop's smoke: {"ok": Bool, "checks": {name: Bool}},
// and a failed check explains itself on a line starting "smoke <name>:".
import Foundation
import MurmurCore
import Synchronization

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
            ("keyRing", checkKeyRing),
            ("connectionTest", checkConnectionTest),
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

    /// A dummy key through the key ring: saved, read back, filed in the
    /// app's own Keychain access group (never the app group, which the
    /// keyboard can read), kept out of the app's defaults, and deleted.
    static func checkKeyRing() throws {
        let ring = KeychainKeyRing()
        let url = "https://smoke.invalid/v1/"
        defer { try? ring.remove(for: url) }
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        try ring.save(key, for: url)
        guard try ring.key(for: "https://smoke.invalid/v1") == key else {
            throw SmokeFailure("read back a different key")
        }
        let group = try ring.store.accessGroup(account: BaseURL.normalized(url)) ?? ""
        guard group != AppGroup.identifier, group.hasSuffix("." + (Bundle.main.bundleIdentifier ?? "?")) else {
            throw SmokeFailure("the key sits in access group \(group)")
        }
        guard !"\(UserDefaults.standard.dictionaryRepresentation())".contains(key.secret) else {
            throw SmokeFailure("the key reached the app's defaults")
        }
        try ring.remove(for: url)
        guard try ring.key(for: url) == nil else { throw SmokeFailure("remove left the key behind") }
    }

    /// Test connection against the local stand-in, once for each answer.
    static func checkConnectionTest() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let session = StubProtocol.session()
        for answer in StubProtocol.Answer.allCases {
            let verdict = waitFor { await ConnectionTest.run(baseUrl: answer.baseUrl, key: key, send: { try await session.data(for: $0) }) }
            guard verdict == answer.expected else {
                throw SmokeFailure("\(answer.rawValue) gave \(verdict), expected \(answer.expected)")
            }
        }
    }

    /// Runs async work to the end from the smoke's synchronous start.
    private static func waitFor<T: Sendable>(_ work: @escaping @Sendable () async -> T) -> T {
        let result = Mutex<T?>(nil)
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            let value = await work()
            result.withLock { $0 = value }
            done.signal()
        }
        done.wait()
        guard let value = result.withLock({ $0 }) else { preconditionFailure("the work signaled without a value") }
        return value
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

- [ ] **Step 2: Run the smoke to see it fail**

Run: `npm run ios:smoke`
Expected: the build fails with `cannot find 'StubProtocol' in scope`.

- [ ] **Step 3: Write the stand-in provider**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// A local stand-in provider for the smoke (ios/prd.json IOS-005): it
// answers Test connection inside the app, through the real URLSession,
// once for each verdict, without a network or a server.
import Foundation
import MurmurCore

final class StubProtocol: URLProtocol {
    /// One stand-in host for each answer Test connection can give.
    enum Answer: String, CaseIterable {
        case works, rejected, offline, message

        var baseUrl: String { "https://\(rawValue).stub.invalid/v1" }

        var expected: ConnectionVerdict {
            switch self {
            case .works: .works
            case .rejected: .keyRejected(status: 401)
            case .offline: .noConnection
            case .message: .providerMessage("Model overloaded")
            }
        }
    }

    /// The only key the works host accepts, so a missing header fails.
    static let key = "smoke-not-a-real-key-1234"

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host?.hasSuffix(".stub.invalid") == true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url,
              let answer = url.host?.split(separator: ".").first.flatMap({ Answer(rawValue: String($0)) })
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let authorized = request.value(forHTTPHeaderField: "Authorization") == "Bearer \(Self.key)"
        let (status, body): (Int, String)
        switch answer {
        case .offline:
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        case .works:
            (status, body) = authorized ? (200, #"{"data":[]}"#) : (401, "{}")
        case .rejected:
            (status, body) = (401, #"{"error":{"message":"Invalid API Key"}}"#)
        case .message:
            (status, body) = (503, #"{"error":{"message":"Model overloaded"}}"#)
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        if let response { client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed) }
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
```

- [ ] **Step 4: Run the smoke to see it pass**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT {"checks":{"appGroup":true,"connectionTest":true,"keychain":true,"keyRing":true,"sharedJson":true},"ok":true}`.

- [ ] **Step 5: Commit**

Run the gates, then:

```bash
git add ios/App/Smoke/StubProtocol.swift ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-005: the smoke saves a dummy key and runs Test connection against a local stand-in"
git pull --rebase
```

---

### Task 9: The docs, the live step, and the record

**Files:**
- Create: `ios/docs/iphone.md`
- Modify: `HANDOFF.md` (the live step), `ios/prd.json` (IOS-005 `notes`), then regenerate the roadmaps

- [ ] **Step 1: Write the iPhone docs**

Create `ios/docs/iphone.md`:

```markdown
# murmur on iPhone

murmur for iPhone is being built on the feature/ios branch and is not on the App Store yet. These answers describe the app as built. They move into docs/ and onto murmurapp.app when the App Store page goes live (IOS-026).

## How do I add my API key on iPhone?

Open murmur, tap Provider and key, paste your key under Transcription, and tap Save key. Then tap Test connection; it should say Works.

1. Under Transcription, pick a provider. Groq is first and is the default. Custom takes any OpenAI-compatible address that starts with https://.
2. Tap Get a Groq key (the link names your provider) to open its key page. Make a key there and copy it.
3. Back in murmur, tap Paste your Groq key, paste, and tap Save key. If the key does not look like one from that provider, a note under the field says so, and you can still save it.
4. Tap Test connection. murmur asks the provider for its list of models, using your key, and answers right there:
   - Works: the key and the address are good.
   - Key rejected: the provider turned the key down. Copy a fresh key and save it again. A code 403 can also mean your account with the provider needs setting up first.
   - No connection: murmur could not reach the provider. Check that the iPhone is online.
   - Anything else is shown in the provider's own words.

Cleanup runs on the same provider unless you choose otherwise. Pick Separate under Cleanup to use another provider for it, with its own key.

Each provider keeps its own key, so switching providers and back never asks for a key twice. For what each provider offers and costs, see [Providers](../../docs/providers.md).

## Where does murmur keep my key?

In the iPhone's Keychain, and only there.

- Only the murmur app can read it. The murmur keyboard cannot: the key sits in the app's own part of the Keychain, not in the space the app and the keyboard share.
- It stays on this iPhone. It never syncs through iCloud and never moves to a new iPhone, even from a backup.
- It becomes readable once you unlock the iPhone after it starts, so dictation still works later while the phone is locked.
- murmur never writes the key to its settings, logs, or the clipboard, and the screen only ever shows its last four characters.
- Tap Remove key on the Provider screen to delete it. murmur asks first.

What you say goes only to the provider you picked, straight from your iPhone.
```

- [ ] **Step 2: Add the live step to HANDOFF.md**

Under `## Now`, after the IOS-004 line, add the line below, with the real date:

```markdown
- [ ] IOS-005 live check, once TestFlight 1 is on your iPhone (IOS-015; added YYYY-MM-DD). (1) Open murmur and tap Provider and key. (2) Leave Provider on Groq, tap Get a Groq key, make a key on Groq's page, and copy it. (3) Back in murmur, tap Paste your Groq key, paste it, and tap Save key. You should see Groq key with four dots and the key's last four characters. (4) Tap Test connection. It should say Works in green. (5) Tell Claude what it said.
```

Spell the same steps out in the chat reply (CLAUDE.md).

- [ ] **Step 3: Record IOS-005 in the PRD**

IOS-005 stays `passes: false` and `needs_human: true` until the live check. Write its `notes` with a targeted string edit; `ios/prd.json` is not in `JSON.stringify` layout. Validate the result with `JSON.parse`. The notes say how each automated criterion was verified:
- the presets per role and the Local and https rulings;
- the key ring and the access group test;
- the wrong-prefix note;
- the four verdicts and the mask in provider messages;
- the logging, pasteboard, and defaults guarantees;
- the previews;
- the two smoke checks;
- the docs;
- that the live check waits for TestFlight 1.

Then run `npm run roadmap`.

- [ ] **Step 4: Run every gate one last time**

```bash
npm run typecheck
npm run test
swift test --package-path ios/MurmurCore
npm run ios:test
npm run ios:smoke
```

Expected:
- typecheck clean, with vitest and both lints green;
- 58 MurmurCore tests;
- `** TEST SUCCEEDED **`, with 34 tests in the result bundle;
- the smoke line from Task 8.

- [ ] **Step 5: Commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json ios/ROADMAP.md ROADMAP.md
git commit -m "IOS-005: the iPhone docs answer where your key lives, and the live check waits on TestFlight 1"
git pull --rebase
```

- [ ] **Step 6: Review gate, then ask LaBroi before pushing**

1. Dispatch an independent reviewer agent on the most capable model over the story's full diff (`git diff 57a3485..HEAD`), against CLAUDE.md, DESIGN.md, and `ios/prd.json` conventions. Point it at this plan's Rulings and Review Focus.
2. Fix confirmed findings, each with a test that failed first, and rerun the gates.
3. Take disputed findings to LaBroi.
4. Push only with his OK.
