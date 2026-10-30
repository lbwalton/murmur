# Dictionary and Expansions (IOS-013) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach murmur your words and your shortcuts on the phone.
- **Dictionary:** a word with the spelling and casing you want. It is applied exactly as desktop applies it, and is also sent to transcription as a spelling hint.
- **Expansions:** a short trigger that becomes longer text, applied last.

Add, edit, search, and delete both. Deleting asks first, in red, and each empty list says what it is for with one example.

**Architecture:**
- The dictionary and expansions already live in `CleanupSettings`. IOS-007's `Cleanup.finish` already applies them in desktop's order:
  1. the dictionary on the raw text;
  2. formatting;
  3. polish, with the dictionary as a hint;
  4. the dictionary's casing;
  5. expansions last.
- This story adds the editing (`WordsModel` and `WordsScreen`, reached from Settings) and the transcription hint.
- MurmurCore's new `transcriptionHint` turns the dictionary's spellings into one short line. `Transcription` sends it as the form's `prompt` field. `TakeModel` passes it on every take.

**Tech Stack:** Swift 6, SwiftUI (List, searchable, sheet, swipeActions, confirmationDialog), MurmurCore, Swift Testing.

**Spec:** `ios/prd.json` IOS-013, with `conventions` (design, verify, docs), `CLAUDE.md`, and `DESIGN.md`. Desktop's `src/shared/dictionary.ts` and expansions are murmur's own; the iPhone applies them the same way (IOS-003 parity vectors). Groq's speech to text docs (checked 2026-10-12): `prompt` is optional, guides spelling, and is limited to 224 tokens. The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** every block below ran in a throwaway copy of `feature/ios` at 90e9900 before this plan was saved:
- `swift test` ran 108 MurmurCore tests: 104 existing and 4 new.
- `npm run ios:test` ran 211 app tests: 203 existing and 8 new.
- `npm run ios:smoke` printed fifteen true checks, `dictionary` among them.
- The screen was rendered in the simulator, empty and with a few words and expansions, and read.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **The lists stay in the cleanup settings every take already runs through,** and applying them is unchanged (desktop's order). This story only adds the editing and the hint.
2. **The transcription hint is the dictionary's spellings,** in order and each once, as one line. It stops before about 600 characters (about 150 tokens), under the providers' 224-token limit, and an empty dictionary sends no prompt. Desktop does not send a transcription prompt today; the iPhone does because IOS-013 asks for it. If wrong: desktop could follow in its own story, or the phone could drop the prompt.
3. **No word is listed twice.** Saving a word murmur already listens for (matched without case) replaces it, and editing replaces in place. Expansions match on their trigger the same way.
4. **One screen holds both lists,** Words then Expansions, with one search across both. Add sits in each list's header. A tap edits in a sheet, and a swipe or VoiceOver's Delete asks from the row, in red.
5. **The screen is reached from Settings,** just after Cleanup, as "Dictionary and expansions".
6. **Each empty list gets one sentence and one example:**
   - la broy becomes LaBroi;
   - my address becomes 1 Main Street, Springfield.
7. **The live check waits for TestFlight 1** (IOS-015).

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6): bind by key path, never `Binding(get:set:)` with closures, and write long math as small typed steps.
- `shared/format-spec.json` and the shared vectors stay the single source of the formatter's rules; nothing here changes how the dictionary or expansions apply.
- The keyboard is untouched: it never reads the dictionary.
- Design: night studio tokens. Gold is for Add, Save, and actions; red only in the delete questions. 44 point targets. VoiceOver reads each entry as one element, with an edit hint and a Delete action.
- Every `.swift` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-013:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **A word saved with stray spaces, or with an empty side.** It is trimmed, or refused. Pinned by `WordsModelTests.aWordIsSavedAndKept` (Task 3).
2. **A word or a trigger listed twice.** Never: saving the same one replaces it. Pinned by `WordsModelTests.editingReplacesAndNothingIsListedTwice` and `expansionsWorkTheSameWay` (Task 3).
3. **A hint that is too long, repeats itself, or goes out blank.** Pinned by `DictionaryHintTests` and `TranscriptionTests.theSpellingHintRidesAlongAsAPrompt` (Task 1), and `TakeModelTests.theDictionaryHintsTheSpellings` (Task 2).
4. **The lists not reaching real takes, or an expansion that is not last.** Pinned by `WordsModelTests.aTakesWordsRunThroughBoth` (Task 3) and the smoke's `dictionary` check (Task 5).
5. **Editing the wrong entry from a filtered list.** Search keeps each entry's place in the full list. Pinned by `WordsModelTests.searchFindsEitherSide` (Task 3).

---

### Task 1: The spelling hint

**Files:**
- Modify: `ios/MurmurCore/Sources/MurmurCore/Dictionary.swift`, `ios/MurmurCore/Sources/MurmurCore/Transcription.swift`, `ios/MurmurCore/Tests/MurmurCoreTests/TranscriptionTests.swift`.
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/DictionaryHintTests.swift`.

**Interfaces:**
- Produces `transcriptionHint(_ entries: [DictionaryEntry], limit: Int = 600) -> String?`.
- `Transcription.request`, `run`, `attempt`, and `form` gain `prompt: String? = nil`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import MurmurCore

@Suite struct DictionaryHintTests {
    /// The dictionary's spellings, in order and each once, as one line.
    @Test func theHintListsEachSpellingOnce() {
        let entries = [
            DictionaryEntry(from: "la broy", to: "LaBroi"),
            DictionaryEntry(from: "eze media", to: "Eze Media"),
            DictionaryEntry(from: "labroy", to: "LaBroi"),
            DictionaryEntry(from: "  ", to: "Nothing"),
            DictionaryEntry(from: "murmer", to: "murmur")
        ]
        #expect(transcriptionHint(entries) == "LaBroi, Eze Media, murmur.")
    }

    @Test func anEmptyDictionarySendsNoHint() {
        #expect(transcriptionHint([]) == nil)
        #expect(transcriptionHint([DictionaryEntry(from: "x", to: " ")]) == nil)
    }

    /// A long dictionary stops well under the providers' 224 token limit.
    @Test func aLongDictionaryStopsInTime() throws {
        let entries = (0..<400).map { DictionaryEntry(from: "word \($0)", to: "Spelling\($0)") }
        let hint = try #require(transcriptionHint(entries))
        #expect(hint.count <= 601)
        #expect(hint.hasPrefix("Spelling0, Spelling1"))
        #expect(hint.hasSuffix("."))
    }
}
```

In `TranscriptionTests.swift`, at the end of `itPostsOneWavWithTheModelAndKey`, add `#expect(!text.contains("name=\"prompt\""))`, and after that test add:

```swift
    /// The dictionary's spellings ride along as a prompt (IOS-013); an empty
    /// one sends none.
    @Test func theSpellingHintRidesAlongAsAPrompt() throws {
        let hinted = try #require(Transcription.request(wav: wav, baseUrl: groq, model: "m", key: key, prompt: "LaBroi, Eze Media.", boundary: "b"))
        let text = String(decoding: try #require(hinted.httpBody), as: UTF8.self)
        #expect(text.contains("name=\"prompt\"\r\n\r\nLaBroi, Eze Media.\r\n"))
        let blank = try #require(Transcription.request(wav: wav, baseUrl: groq, model: "m", key: key, prompt: "  ", boundary: "b"))
        #expect(!String(decoding: try #require(blank.httpBody), as: UTF8.self).contains("name=\"prompt\""))
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `swift test --package-path ios/MurmurCore`
Expected: the build fails with `cannot find 'transcriptionHint' in scope`.

- [ ] **Step 3: Write the hint and the prompt**

At the end of `ios/MurmurCore/Sources/MurmurCore/Dictionary.swift`, add:

```swift
/// The dictionary as a spelling hint for transcription (ios/prd.json
/// IOS-013): its spellings, in order and each once, as one line the speech
/// model reads as words it has already heard. It stops before about 150
/// tokens, well under the 224 the providers allow (Groq's speech to text
/// docs, checked 2026-10-12). Nil for an empty dictionary.
public func transcriptionHint(_ entries: [DictionaryEntry], limit: Int = 600) -> String? {
    var seen = Set<String>()
    var words: [String] = []
    var length = 0
    for entry in entries where isUsable(entry) {
        let word = entry.to.trimmingCharacters(in: .whitespacesAndNewlines)
        guard seen.insert(word.lowercased()).inserted else { continue }
        guard length + word.count + 2 <= limit else { break }
        words.append(word)
        length += word.count + 2
    }
    return words.isEmpty ? nil : words.joined(separator: ", ") + "."
}
```

`ios/MurmurCore/Sources/MurmurCore/Transcription.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The transcription request (ios/prd.json IOS-006), as desktop's
// src/main/transcribe/provider.ts makes it: one WAV posted as a form to
// {base}/audio/transcriptions with the chosen model and a 30 second
// timeout, one more try after a transient failure and never after a 4xx,
// and every failure sorted into desktop's kinds. On the phone it can also
// carry the dictionary's spellings as a prompt (IOS-013).
import Foundation

/// Why a transcription failed, in desktop's words for it.
public enum TranscriptionFailure: String, Codable, Sendable, CaseIterable {
    case auth, badrequest, server, network, timeout

    /// Worth one more try: the provider or the network may recover.
    var isTransient: Bool { self == .server || self == .network || self == .timeout }
}

public enum TranscriptionResult: Equatable, Sendable {
    case words(String)
    case failed(TranscriptionFailure, detail: String)
}

public enum Transcription {
    /// Desktop waits 30 seconds for an answer too.
    public static let timeout: TimeInterval = 30
    /// Tries after the first, for transient failures only.
    public static let retries = 1

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, boundary: String = "murmur-\(UUID().uuidString)") -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/audio/transcriptions")
        else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = form(wav: wav, model: model, prompt: prompt, boundary: boundary)
        return request
    }

    /// The form desktop sends: the file as audio.wav, the model, and a
    /// JSON answer, plus a spelling prompt when there is one.
    static func form(wav: Data, model: String, prompt: String? = nil, boundary: String) -> Data {
        var body = Data()
        func line(_ text: String) { body.append(Data((text + "\r\n").utf8)) }
        line("--\(boundary)")
        line(#"Content-Disposition: form-data; name="file"; filename="audio.wav""#)
        line("Content-Type: audio/wav")
        line("")
        body.append(wav)
        line("")
        var fields = [("model", model), ("response_format", "json")]
        if let prompt, !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { fields.append(("prompt", prompt)) }
        for (name, value) in fields {
            line("--\(boundary)")
            line(#"Content-Disposition: form-data; name="\#(name)""#)
            line("")
            line(value)
        }
        line("--\(boundary)--")
        return body
    }

    public static func run(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, send: ConnectionTest.Send) async -> TranscriptionResult {
        var result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt, send: send)
        var remaining = retries
        while case .failed(let kind, _) = result, kind.isTransient, remaining > 0 {
            remaining -= 1
            result = await attempt(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt, send: send)
        }
        return result
    }

    static func attempt(wav: Data, baseUrl: String, model: String, key: APIKey, prompt: String? = nil, send: ConnectionTest.Send) async -> TranscriptionResult {
        guard let request = request(wav: wav, baseUrl: baseUrl, model: model, key: key, prompt: prompt) else {
            return .failed(.network, detail: "not an address murmur can call")
        }
        do {
            let (body, response) = try await send(request)
            guard let http = response as? HTTPURLResponse else { return .failed(.network, detail: "no http answer") }
            return result(status: http.statusCode, body: body)
        } catch let error as URLError where error.code == .timedOut {
            return .failed(.timeout, detail: "no response in \(Int(timeout)) s")
        } catch let error as URLError {
            return .failed(.network, detail: "url error \(error.code.rawValue)")
        } catch {
            return .failed(.network, detail: "request failed")
        }
    }

    /// Desktop's sorting: 401 and 403 are the key, any other 4xx is the
    /// request, anything else that is not a success is the server, and a
    /// success without text is the server too.
    static func result(status: Int, body: Data) -> TranscriptionResult {
        switch status {
        case 401, 403:
            return .failed(.auth, detail: "http \(status)")
        case 400..<500:
            return .failed(.badrequest, detail: "http \(status)")
        case 200..<300:
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let text = object["text"] as? String
            else { return .failed(.server, detail: "response missing text") }
            return .words(text)
        default:
            return .failed(.server, detail: "http \(status)")
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `swift test --package-path ios/MurmurCore`
Expected: 108 tests pass (1 known issue on purpose). Run `npm run ios:test`: the app total stays 203.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/MurmurCore/Sources/MurmurCore/Dictionary.swift ios/MurmurCore/Sources/MurmurCore/Transcription.swift ios/MurmurCore/Tests/MurmurCoreTests/DictionaryHintTests.swift ios/MurmurCore/Tests/MurmurCoreTests/TranscriptionTests.swift
git commit -m "IOS-013: transcription can carry the dictionary's spellings as a prompt"
```

### Task 2: Every take sends the hint

**Files:** Modify `ios/App/Takes/TakeModel.swift`, `ios/AppTests/TakeModelTests.swift`.

**Interfaces:**
- Consumes `transcriptionHint` and `Transcription.run(...prompt:...)` (Task 1).

- [ ] **Step 1: Write the failing test**

In `ios/AppTests/TakeModelTests.swift`, after `aSpokenTakeComesBackAsWords`, add:

```swift
    /// The dictionary's spellings go to transcription as a hint (IOS-013);
    /// without a dictionary, no hint goes.
    @Test func theDictionaryHintsTheSpellings() async throws {
        let provider = FakeProvider.says("LaBroi called.")
        let model = model(provider)
        await take(model)
        #expect(!String(decoding: try #require(provider.requests.last?.httpBody), as: UTF8.self).contains("name=\"prompt\""))
        var settings = CleanupStore(defaults: defaults).load()
        settings.dictionary = [DictionaryEntry(from: "la broy", to: "LaBroi")]
        CleanupStore(defaults: defaults).save(settings)
        await take(model)
        #expect(String(decoding: try #require(provider.requests.last?.httpBody), as: UTF8.self).contains("name=\"prompt\"\r\n\r\nLaBroi.\r\n"))
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: `theDictionaryHintsTheSpellings` fails: the second request has no prompt.

- [ ] **Step 3: Send it**

In `TakeModel.words(for:)`, replace from `switch await Transcription.run(` through `let finished = await Cleanup.finish(` with:

```swift
        // The dictionary's spellings go to transcription as a hint, and to
        // polish (IOS-013).
        let cleanupSettings = cleanup.load()
        let hint = transcriptionHint(cleanupSettings.dictionary)
        switch await Transcription.run(wav: wav, baseUrl: baseUrl, model: settings.transcription.sttModel, key: key, prompt: hint, send: send) {
        case .words(let text):
            guard let heard = TakeAudio.heard(text, list: rules.hallucinations) else { return .success(nil) }
            let connection = settings.polishConnection { [ring] in (try? ring.key(for: $0)) ?? nil }
            let finished = await Cleanup.finish(heard, settings: cleanupSettings, rules: rules.cleanup, connection: connection, send: send)
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `TakeModelTests` passes, and the app total is 204.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Takes/TakeModel.swift ios/AppTests/TakeModelTests.swift
git commit -m "IOS-013: every take tells transcription how your words are spelled"
```

### Task 3: The words model

**Files:** Create `ios/App/Words/WordsModel.swift`. Test `ios/AppTests/WordsTests.swift`.

**Interfaces:**
- Produces `WordsModel`:
  - `init(store:)`;
  - `dictionary` and `expansions`;
  - `saveWord(_:at:) -> Bool` and `deleteWord(at:)`;
  - `saveExpansion(_:at:) -> Bool` and `deleteExpansion(at:)`;
  - `words(matching:)` and `expansions(matching:)`, which return `[(index, entry)]`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct WordsModelTests {
    let defaults: UserDefaults

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func model() -> WordsModel { WordsModel(store: CleanupStore(defaults: defaults)) }

    /// A word is saved trimmed, kept across launches, and refused when
    /// either side is empty.
    @Test func aWordIsSavedAndKept() {
        let words = model()
        #expect(words.saveWord(DictionaryEntry(from: "  la broy ", to: " LaBroi ")))
        #expect(!words.saveWord(DictionaryEntry(from: "eze", to: "  ")))
        #expect(!words.saveWord(DictionaryEntry(from: " ", to: "Eze")))
        #expect(words.dictionary == [DictionaryEntry(from: "la broy", to: "LaBroi")])
        #expect(model().dictionary == [DictionaryEntry(from: "la broy", to: "LaBroi")])
        #expect(CleanupStore(defaults: defaults).load().dictionary.count == 1)
    }

    /// Editing replaces the entry in place, and a new word murmur already
    /// listens for replaces that one: a word is never listed twice.
    @Test func editingReplacesAndNothingIsListedTwice() {
        let words = model()
        words.saveWord(DictionaryEntry(from: "la broy", to: "Labroi"))
        words.saveWord(DictionaryEntry(from: "eze media", to: "Eze Media"))
        words.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi"), at: 0)
        #expect(words.dictionary.map(\.to) == ["LaBroi", "Eze Media"])
        words.saveWord(DictionaryEntry(from: "LA BROY", to: "LaBroi W."))
        #expect(words.dictionary.map(\.to) == ["LaBroi W.", "Eze Media"])
        words.deleteWord(at: 0)
        #expect(words.dictionary.map(\.to) == ["Eze Media"])
        #expect(model().dictionary.map(\.to) == ["Eze Media"])
    }

    @Test func expansionsWorkTheSameWay() {
        let words = model()
        #expect(words.saveExpansion(ExpansionEntry(trigger: " my address ", text: " 1 Main Street, Springfield ")))
        #expect(!words.saveExpansion(ExpansionEntry(trigger: "sig", text: "")))
        words.saveExpansion(ExpansionEntry(trigger: "My Address", text: "2 Oak Lane"))
        #expect(words.expansions == [ExpansionEntry(trigger: "My Address", text: "2 Oak Lane")])
        words.deleteExpansion(at: 0)
        #expect(model().expansions.isEmpty)
    }

    /// Search finds either side, whatever the case, and keeps each entry's
    /// place in the full list.
    @Test func searchFindsEitherSide() {
        let words = model()
        words.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi"))
        words.saveWord(DictionaryEntry(from: "eze media", to: "Eze Media"))
        words.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street"))
        #expect(words.words(matching: "media").map(\.index) == [1])
        #expect(words.words(matching: "BROY").map(\.entry.to) == ["LaBroi"])
        #expect(words.words(matching: "").count == 2)
        #expect(words.expansions(matching: "main").map(\.index) == [0])
        #expect(words.expansions(matching: "nothing").isEmpty)
    }

    /// What the screen saves is what every take runs through: the word on
    /// the raw text with its casing kept, and the expansion last.
    @Test func aTakesWordsRunThroughBoth() async throws {
        let words = model()
        words.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi"))
        words.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street, Springfield"))
        var settings = CleanupStore(defaults: defaults).load()
        settings.polish = false
        let rules = try BundledRules.takeRules().cleanup
        let finished = await Cleanup.finish("la broy lives at my address", settings: settings, rules: rules, connection: nil, send: { _ in throw URLError(.notConnectedToInternet) })
        #expect(finished.contains("LaBroi lives at 1 Main Street, Springfield"))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'WordsModel' in scope`.

- [ ] **Step 3: Write the model**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The dictionary and expansions (ios/prd.json IOS-013), kept in the
// cleanup settings that every take already runs through (IOS-007): a word
// with the spelling and casing you want, and a short trigger that becomes
// longer text. Adding, editing, searching, and deleting happen here.
import Foundation
import MurmurCore
import Observation

@Observable @MainActor final class WordsModel {
    private(set) var dictionary: [DictionaryEntry]
    private(set) var expansions: [ExpansionEntry]
    @ObservationIgnored private let store: CleanupStore

    init(store: CleanupStore) {
        self.store = store
        let settings = store.load()
        dictionary = settings.dictionary
        expansions = settings.expansions
    }

    /// Saves a word: both sides trimmed and not empty. Editing replaces the
    /// entry at that place; a new word that murmur already listens for
    /// replaces that one, so a word is never in the list twice. False when
    /// a side is empty.
    @discardableResult
    func saveWord(_ entry: DictionaryEntry, at index: Int? = nil) -> Bool {
        guard let entry = Self.clean(entry) else { return false }
        var next = dictionary
        if let index, next.indices.contains(index) {
            next[index] = entry
        } else if let same = next.firstIndex(where: { $0.from.caseInsensitiveCompare(entry.from) == .orderedSame }) {
            next[same] = entry
        } else {
            next.append(entry)
        }
        dictionary = next
        persist()
        return true
    }

    func deleteWord(at index: Int) {
        guard dictionary.indices.contains(index) else { return }
        dictionary.remove(at: index)
        persist()
    }

    /// Saves an expansion the same way, matching on its trigger.
    @discardableResult
    func saveExpansion(_ entry: ExpansionEntry, at index: Int? = nil) -> Bool {
        let trigger = entry.trigger.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = entry.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trigger.isEmpty, !text.isEmpty else { return false }
        let clean = ExpansionEntry(trigger: trigger, text: text)
        var next = expansions
        if let index, next.indices.contains(index) {
            next[index] = clean
        } else if let same = next.firstIndex(where: { $0.trigger.caseInsensitiveCompare(trigger) == .orderedSame }) {
            next[same] = clean
        } else {
            next.append(clean)
        }
        expansions = next
        persist()
        return true
    }

    func deleteExpansion(at index: Int) {
        guard expansions.indices.contains(index) else { return }
        expansions.remove(at: index)
        persist()
    }

    /// The words whose either side holds the search, with their places.
    func words(matching query: String) -> [(index: Int, entry: DictionaryEntry)] {
        let query = query.trimmingCharacters(in: .whitespaces)
        return dictionary.enumerated()
            .filter { query.isEmpty || $0.element.from.localizedCaseInsensitiveContains(query) || $0.element.to.localizedCaseInsensitiveContains(query) }
            .map { ($0.offset, $0.element) }
    }

    func expansions(matching query: String) -> [(index: Int, entry: ExpansionEntry)] {
        let query = query.trimmingCharacters(in: .whitespaces)
        return expansions.enumerated()
            .filter { query.isEmpty || $0.element.trigger.localizedCaseInsensitiveContains(query) || $0.element.text.localizedCaseInsensitiveContains(query) }
            .map { ($0.offset, $0.element) }
    }

    private static func clean(_ entry: DictionaryEntry) -> DictionaryEntry? {
        let from = entry.from.trimmingCharacters(in: .whitespacesAndNewlines)
        let to = entry.to.trimmingCharacters(in: .whitespacesAndNewlines)
        return from.isEmpty || to.isEmpty ? nil : DictionaryEntry(from: from, to: to)
    }

    private func persist() {
        var settings = store.load()
        settings.dictionary = dictionary
        settings.expansions = expansions
        store.save(settings)
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `WordsModelTests` passes (5 tests), and the app total is 209.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Words/WordsModel.swift ios/AppTests/WordsTests.swift
git commit -m "IOS-013: your words and expansions are saved trimmed, once each, and every take runs through them"
```

### Task 4: The screen

**Files:**
- Create: `ios/App/Words/WordsScreen.swift`.
- Modify: `ios/App/Home/SettingsScreen.swift`, `ios/AppTests/WordsTests.swift`.

**Interfaces:**
- Consumes `WordsModel` (Task 3).
- Produces `WordsScreen(model:)`, `WordsRoute`, and `WordsCopy`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/WordsTests.swift`, add:

```swift
@Suite struct WordsCopyTests {
    /// Each empty list says what it is for, with one example.
    @Test func eachEmptyListGivesOneExample() {
        for line in [WordsCopy.wordsEmpty, WordsCopy.expansionsEmpty] {
            #expect(line.components(separatedBy: "For example").count == 2)
        }
        #expect(WordsCopy.deleteQuestion("LaBroi") == "Delete LaBroi?")
    }

    @Test func everyLineFollowsTheWritingRules() {
        let lines = [
            WordsCopy.wordsEmpty, WordsCopy.expansionsEmpty, WordsCopy.wordFooter, WordsCopy.expansionFooter, WordsCopy.noMatch,
            WordsCopy.search, WordsCopy.heard("x")
        ]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'WordsCopy' in scope`.

- [ ] **Step 3: Write the screen and its row in Settings**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Dictionary and expansions (ios/prd.json IOS-013): words murmur should
// spell your way, and short triggers that become longer text. Add, edit,
// search, and delete; deleting asks first, in red, and each empty list says
// what it is for with one example.
import MurmurCore
import SwiftUI

struct WordsScreen: View {
    @Bindable var model: WordsModel
    @State private var query = ""
    @State private var editing: Editing?

    /// What the editor sheet is open on.
    enum Editing: Identifiable {
        case word(index: Int?, DictionaryEntry)
        case expansion(index: Int?, ExpansionEntry)

        var id: String {
            switch self {
            case .word(let index, _): "word-\(index.map(String.init) ?? "new")"
            case .expansion(let index, _): "expansion-\(index.map(String.init) ?? "new")"
            }
        }
    }

    var body: some View {
        let words = model.words(matching: query)
        let expansions = model.expansions(matching: query)
        List {
            Section {
                if model.dictionary.isEmpty {
                    Text(WordsCopy.wordsEmpty).foregroundStyle(Tokens.textDim)
                } else if words.isEmpty {
                    Text(WordsCopy.noMatch).foregroundStyle(Tokens.textDim)
                }
                ForEach(words, id: \.index) { item in
                    EntryRow(title: item.entry.to, detail: WordsCopy.heard(item.entry.from), deleteTitle: WordsCopy.deleteWord) {
                        editing = .word(index: item.index, item.entry)
                    } delete: {
                        model.deleteWord(at: item.index)
                    }
                }
            } header: {
                SectionHeader(title: WordsCopy.words, add: WordsCopy.addWord) {
                    editing = .word(index: nil, DictionaryEntry(from: "", to: ""))
                }
            }
            .listRowBackground(Tokens.panel)

            Section {
                if model.expansions.isEmpty {
                    Text(WordsCopy.expansionsEmpty).foregroundStyle(Tokens.textDim)
                } else if expansions.isEmpty {
                    Text(WordsCopy.noMatch).foregroundStyle(Tokens.textDim)
                }
                ForEach(expansions, id: \.index) { item in
                    EntryRow(title: item.entry.trigger, detail: item.entry.text, deleteTitle: WordsCopy.deleteExpansion) {
                        editing = .expansion(index: item.index, item.entry)
                    } delete: {
                        model.deleteExpansion(at: item.index)
                    }
                }
            } header: {
                SectionHeader(title: WordsCopy.expansions, add: WordsCopy.addExpansion) {
                    editing = .expansion(index: nil, ExpansionEntry(trigger: "", text: ""))
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .searchable(text: $query, prompt: WordsCopy.search)
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(WordsCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $editing) { editing in
            NavigationStack {
                switch editing {
                case .word(let index, let entry):
                    EntryEditor(kind: .word, first: entry.from, second: entry.to) { first, second in
                        model.saveWord(DictionaryEntry(from: first, to: second), at: index)
                    }
                case .expansion(let index, let entry):
                    EntryEditor(kind: .expansion, first: entry.trigger, second: entry.text) { first, second in
                        model.saveExpansion(ExpansionEntry(trigger: first, text: second), at: index)
                    }
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}

/// A section title with its Add button.
private struct SectionHeader: View {
    let title: String
    let add: String
    let action: () -> Void

    var body: some View {
        HStack {
            SectionTitle(title)
            Spacer()
            Button(action: action) {
                Label(add, systemImage: "plus")
                    .labelStyle(.titleAndIcon)
            }
            .font(.subheadline)
            .foregroundStyle(Tokens.brand)
            .textCase(nil)
            .frame(minHeight: 44)
        }
    }
}

/// One entry: tap to edit, swipe or VoiceOver's Delete to delete after
/// asking, from the row, so the question points at it.
private struct EntryRow: View {
    let title: String
    let detail: String
    let deleteTitle: String
    let edit: () -> Void
    let delete: () -> Void
    @State private var asking = false

    var body: some View {
        Button(action: edit) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).foregroundStyle(Tokens.text)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(WordsCopy.editHint)
        .swipeActions(edge: .trailing) {
            Button(WordsCopy.delete, role: .destructive) { asking = true }
        }
        .accessibilityAction(named: WordsCopy.delete) { asking = true }
        .confirmationDialog(WordsCopy.deleteQuestion(title), isPresented: $asking, titleVisibility: .visible) {
            Button(deleteTitle, role: .destructive) { delete() }
        }
    }
}

/// Adds or edits one entry: two fields, Save while both hold words.
private struct EntryEditor: View {
    enum Kind { case word, expansion }

    let kind: Kind
    @State var first: String
    @State var second: String
    let save: (String, String) -> Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                TextField(kind == .word ? WordsCopy.heardPlaceholder : WordsCopy.triggerPlaceholder, text: $first)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                SectionTitle(kind == .word ? WordsCopy.whenHeard : WordsCopy.whenSaid)
            }
            .listRowBackground(Tokens.panel)
            Section {
                TextField(kind == .word ? WordsCopy.spellingPlaceholder : WordsCopy.textPlaceholder, text: $second, axis: .vertical)
                    .lineLimit(kind == .word ? 1...2 : 2...8)
                    .autocorrectionDisabled()
            } header: {
                SectionTitle(kind == .word ? WordsCopy.writeAs : WordsCopy.write)
            } footer: {
                Text(kind == .word ? WordsCopy.wordFooter : WordsCopy.expansionFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle(kind == .word ? WordsCopy.wordTitle : WordsCopy.expansionTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(WordsCopy.cancel) { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(WordsCopy.save) {
                    if save(first, second) { dismiss() }
                }
                .disabled(first.trimmingCharacters(in: .whitespaces).isEmpty || second.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}

/// Opens the screen on the app's cleanup settings.
struct WordsRoute: View {
    @State private var model = WordsModel(store: CleanupStore())

    var body: some View {
        WordsScreen(model: model)
    }
}

/// What the screen says.
enum WordsCopy {
    static let title = "Dictionary and expansions"
    static let words = "Words"
    static let expansions = "Expansions"
    static let addWord = "Add"
    static let addExpansion = "Add"
    static let search = "Search words and expansions"
    static let noMatch = "Nothing here matches your search."
    static let wordsEmpty = "Teach murmur a word it gets wrong. For example, when it hears la broy, write LaBroi."
    static let expansionsEmpty = "Say a short trigger and get longer text. For example, say my address to get 1 Main Street, Springfield."
    static let delete = "Delete"
    static let deleteWord = "Delete word"
    static let deleteExpansion = "Delete expansion"
    static let editHint = "Double tap to edit."
    static let whenHeard = "When murmur hears"
    static let writeAs = "Write it as"
    static let whenSaid = "When you say"
    static let write = "Write"
    static let heardPlaceholder = "la broy"
    static let spellingPlaceholder = "LaBroi"
    static let triggerPlaceholder = "my address"
    static let textPlaceholder = "1 Main Street, Springfield"
    static let wordFooter = "murmur writes it this way, with this casing, wherever you say it, and tells your provider how it is spelled."
    static let expansionFooter = "Say the trigger on its own or in a sentence; murmur writes the text in its place, last of all."
    static let wordTitle = "Word"
    static let expansionTitle = "Expansion"
    static let cancel = "Cancel"
    static let save = "Save"

    static func heard(_ from: String) -> String {
        "When murmur hears \(from)"
    }

    static func deleteQuestion(_ title: String) -> String {
        "Delete \(title)?"
    }
}

#if DEBUG
#Preview("Empty") {
    NavigationStack { WordsScreen(model: WordsModel(store: CleanupStore(defaults: UserDefaults(suiteName: "words-preview-empty")!))) }
        .preferredColorScheme(.dark)
}

#Preview("A few") {
    let defaults = UserDefaults(suiteName: "words-preview-few")!
    let model = WordsModel(store: CleanupStore(defaults: defaults))
    model.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi"))
    model.saveWord(DictionaryEntry(from: "eze media", to: "Eze Media"))
    model.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street, Springfield"))
    return NavigationStack { WordsScreen(model: model) }.preferredColorScheme(.dark)
}
#endif
```

In `ios/App/Home/SettingsScreen.swift`, make two changes:
- After `NavigationLink("Cleanup") { CleanupRoute() }`, add `NavigationLink("Dictionary and expansions") { WordsRoute() }`.
- Replace the file's opening comment with:

```swift
// Settings (ios/prd.json IOS-012): Provider and keys, Cleanup, Dictionary
// and expansions (IOS-013), the session's length, the keyboard and the
// pill's look, and About. Diagnostics (IOS-014) joins when it ships.
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `WordsCopyTests` passes (2 tests), and the app total is 211.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Words/WordsScreen.swift ios/App/Home/SettingsScreen.swift ios/AppTests/WordsTests.swift
git commit -m "IOS-013: Settings holds Dictionary and expansions: add, edit, search, and delete after asking"
```

### Task 5: The smoke runs a take through both lists

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here: Tasks 1 to 3 built and unit-tested what it exercises.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("history", checkHistory),`, add `("dictionary", checkDictionary),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// The dictionary and expansions (IOS-013): an entry added to each list
    /// is kept, a take's text runs through both, and the dictionary rides
    /// along to transcription as a spelling hint.
    static func checkDictionary() throws {
        if let failure = onMain({ await dictionaryFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func dictionaryFailure() async -> String? {
        guard let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"), let rules = try? BundledRules.takeRules() else { return "no scratch defaults or rules" }
        let words = WordsModel(store: CleanupStore(defaults: defaults))
        guard words.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi")),
              words.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street, Springfield"))
        else { return "an entry would not save" }
        var settings = CleanupStore(defaults: defaults).load()
        guard settings.dictionary.count == 1, settings.expansions.count == 1 else { return "the entries were not kept" }
        settings.polish = false
        let finished = await Cleanup.finish("la broy lives at my address", settings: settings, rules: rules.cleanup, connection: nil, send: { _ in throw URLError(.notConnectedToInternet) })
        guard finished.contains("LaBroi lives at 1 Main Street, Springfield") else { return "the take came out as \(finished)" }
        guard transcriptionHint(settings.dictionary) == "LaBroi." else { return "the spelling hint was \(String(describing: transcriptionHint(settings.dictionary)))" }
        return nil
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists fifteen checks, all true, `dictionary` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-013: the smoke adds a word and an expansion and runs a take's text through both"
```

### Task 6: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## How do I teach murmur a word on iPhone?

In murmur, tap the gear at the top right, then Dictionary and expansions. Under Words, tap Add. In When murmur hears, type what murmur writes wrong (la broy), and in Write it as, type it your way (LaBroi), then tap Save.

murmur writes the word your way wherever you say it, with your casing kept even at the start of a sentence. It also tells your provider how the word is spelled, so the speech model gets it right more often to begin with. Tap a word to change it; swipe left on it to delete it, and murmur asks first.

## How do expansions work on iPhone?

An expansion turns a short thing you say into longer text. In murmur, tap the gear, then Dictionary and expansions. Under Expansions, tap Add, type the trigger (my address) and the text (1 Main Street, Springfield), and tap Save. Say the trigger on its own or in a sentence, and murmur writes the text in its place. Expansions run last, after cleanup, so the text comes out exactly as you typed it.
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-012 live check, add:

```markdown
- [ ] IOS-013 live check, once TestFlight 1 is on your iPhone (IOS-015; added 2026-10-13). (1) In murmur, tap the gear at the top right, then Dictionary and expansions. Both lists should be empty, each with one example sentence. (2) Under Words, tap Add. In When murmur hears, type a word murmur gets wrong for you (try your last name the way it misspells it), and in Write it as, type it your way. Tap Save: it should be listed. (3) Under Expansions, tap Add. Type my address as the trigger and your street address as the text, and tap Save. (4) Dictate a sentence in any app that says the word and then my address. The word should come out spelled your way, and my address should become your street address. (5) Back in Dictionary and expansions, type part of the word in the search box at the bottom: only that entry should show. (6) Swipe left on the expansion and tap Delete. A box asks Delete my address? with a red Delete expansion; tap it, and it should disappear. (7) Tell Claude what each step did.
```

In the IOS-012 live check's step (6), change `Provider and key, Cleanup, Session, Keyboard, and About` to `Provider and key, Cleanup, Dictionary and expansions, Session, Keyboard, and About`, since Settings now lists it.

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-013's `notes` to say what was built and verified, every ruling above, that the live check waits for LaBroi (`passes` stays false), and the final gate counts. Write only the notes field.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-013: the iPhone docs answer how to teach murmur a word and how expansions work"
```
