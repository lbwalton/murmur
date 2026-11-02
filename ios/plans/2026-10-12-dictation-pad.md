# The Dictation Pad (IOS-008) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The murmur keyboard, built as a dictation pad. One pill to talk, plus globe, space, delete, and return. Your words land at the cursor once, or wait as Insert last.

**Architecture:** The keyboard never touches the microphone or the network. It signals the app with Darwin notifications (start, stop, cancel). The app runs the take on its one take model, from IOS-006 and IOS-007. The app answers through a mailbox: one small file in the app group, holding the newest take's phase and, once ready, its words, plus a changed signal.
- The keyboard claims the words once, which clears them.
- Only takes the keyboard started reach the mailbox.

The pad's decisions live in `ios/Shared`, which the app compiles too, so the app's tests hold them:
- where words go;
- what the pad says;
- the space before the words;
- the return key's name.

The keys are UIKit, as Apple's input-mode list needs. A desktop vitest scans everything the keyboard compiles and fails on any networking API.

**Tech Stack:** Swift 6, UIKit (UIInputViewController, UIButton.Configuration), SwiftUI for the app's screen, Darwin notifications (CFNotificationCenter), NSFileCoordinator, Swift Testing, vitest.

**Spec:** `ios/prd.json` IOS-008, with `decisions.keyboard` ("A dictation pad: the pill, globe, space, delete, and return. Typing letters stays with the other keyboards.") and `conventions` (privacy, design, verify, docs). Also `CLAUDE.md` and `DESIGN.md`. Earlier stories it builds on: IOS-006's `TakeModel` (one for the app's life) and IOS-007's cleanup.

**Proven before writing:** every block below ran in a throwaway copy of `feature/ios` at 9648d44 before this plan was saved:
- `swift test` ran 104 MurmurCore tests, unchanged.
- `npm run ios:test` ran 108 app tests: 85 existing and 23 new. That build also builds the keyboard extension.
- `npm run ios:smoke` printed ten true checks, `mailbox` among them.
- `npm run test` passed 893 (889 and 4 new). The build had no warnings.
- The pad was rendered in the simulator through the app, in each state, at the default and the largest text size:
  - idle;
  - listening;
  - Insert last;
  - without Full Access;
  - a long Emergency call return key.

  The Keyboard screen was rendered too. Two things were corrected:
  - the pill no longer stretches to fill the space above the keys;
  - the return key grows for long names while the space bar gives way, so no label clips.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **Only a take the keyboard started reaches the mailbox.** A take made on the Dictate screen never turns up in another app. If wrong: drop the origin check in the bridge.
2. **Claimed words are cleared from the mailbox**, so the shared drawer never holds words longer than it must (`conventions.privacy`). Insert last offers only an unclaimed take. If wrong: keep the words until the next take, as desktop's paste-last does.
3. **For now a take runs while murmur is open.** The live check uses the Keyboard screen's own box. Opening murmur from another app and the warm session are IOS-009. If the app does not answer within 2 seconds, the pad says "Open murmur, then tap the pill again."
4. **History arrives with IOS-012.** Until then a keyboard take's words also show on the Dictate screen, the app's one place for the newest take. Criterion 4's "also in history in the app" is met by IOS-012.
5. **The pill is a plain capsule here: gold to start, live amber while listening.** The waveform pill arrives with IOS-010.
6. **The pad's text grows only as far as the fixed keyboard height holds it.** The pad stops at accessibility medium, and the key labels at extra-extra-large. The system keyboard's keys do not grow at all. The return key grows for long names, so no label ever clips.
7. **A keyboard closed while listening cancels the take.** One closed while the take is being transcribed still gets its words, as Insert last.
8. **The pad's view lives in `ios/Shared`, so the app can preview and capture it.** The network test scans `Shared` too.
9. **MurmurCore stays linked into the keyboard**, as IOS-001 criterion 3 requires. The network test checks that it never sends anything: it only builds requests, and the app sends them.
10. **Password and phone number fields need no code:** iOS swaps in its own keyboard there. It is documented and part of the live check.
11. **The memory check (criterion 8) needs Instruments on LaBroi's iPhone**, so it goes to HANDOFF.md with the live check, which waits for TestFlight 1 (IOS-015).
12. **The mailbox file uses the after-first-unlock protection class**, like the waiting takes.

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6): no closure-to-`Binding` conversions. Closures handed to C callbacks capture nothing.
- The keyboard makes no network requests (`conventions.privacy`, criterion 7), and the keyboard extension's memory stays small: no MurmurCore work runs in it.
- Privacy: history and the waiting takes stay in the app's own container. The keyboard sees only the newest take, through the app group mailbox.
- Design: night studio tokens; red only for record, errors, and confirming a delete; gold for actions; amber only for live. VoiceOver labels on every key; 44 point targets; nothing clips.
- Every `.swift` and `.js` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-008:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`. Nothing desktop runs changes, so `npm run smoke` is not required.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **Words arriving after you moved to another field or app.** They are never typed there. Insert last offers them instead. Pinned by `PadTests.wordsAfterYouLeftTheFieldWaitAsInsertLast` (Task 3).
2. **A take that could insert twice:** two refreshes, or the keyboard reopened. The first claim gets the words and clears them; every later read gets nothing. Pinned by `MailboxTests.wordsAreClaimedOnce` (Task 1), the smoke's `mailbox` check (Task 8), and the claim by take id in `aClaimForAnotherTakeGetsNothing`.
3. **The model still holding the last take's words when the keyboard starts a new one.** Those words are never handed over again. Pinned by `KeyboardBridgeTests.aNewTakeNeverCarriesTheLastTakesWords` (Task 4).
4. **A take made on the Dictate screen.** It never reaches the mailbox. Pinned by `KeyboardBridgeTests.aDictateScreenTakeStaysInTheApp` (Task 4).
5. **Networking creeping into the keyboard:** a new file, a new source folder in project.yml, or a URL. The vitest fails. Pinned by `scripts/lib/keyboard-network.test.js` (Task 7).

---

### Task 1: The mailbox

**Files:** Create `ios/Shared/Mailbox.swift`. Test `ios/AppTests/MailboxTests.swift`.

**Interfaces:** Produces `MailboxEntry` (`take: UUID`, `phase: Phase` of `listening`, `working`, `ready`, `nothing`, `failed`, `words: String?`, `at: Date`) and `Mailbox` (`file`, `.shared`, `read()`, `write(_:)`, `claim(_ take: UUID? = nil) -> String?`). Consumes `AppGroup`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@Suite struct MailboxTests {
    let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "mailbox-\(UUID().uuidString).json"))
    let take = UUID()
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    @Test func anEmptyMailboxHoldsNothing() {
        #expect(mailbox.read() == nil)
        #expect(mailbox.claim() == nil)
    }

    @Test func whatTheAppWritesTheKeyboardReads() {
        let entry = MailboxEntry(take: take, phase: .working, words: nil, at: at)
        mailbox.write(entry)
        #expect(mailbox.read() == entry)
    }

    /// The first claim gets the words and clears them; a second gets
    /// nothing, so a take never inserts twice.
    @Test func wordsAreClaimedOnce() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        #expect(mailbox.claim(take) == "Send the invoice.")
        #expect(mailbox.claim(take) == nil)
        #expect(mailbox.claim() == nil)
        #expect(mailbox.read()?.words == nil)
        #expect(mailbox.read()?.phase == .ready)
    }

    @Test func aClaimForAnotherTakeGetsNothing() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        #expect(mailbox.claim(UUID()) == nil)
        #expect(mailbox.claim(take) == "Send the invoice.")
    }

    @Test func onlyReadyWordsAreClaimed() {
        mailbox.write(MailboxEntry(take: take, phase: .working, words: "not yet", at: at))
        #expect(mailbox.claim(take) == nil)
    }

    /// The real mailbox sits in the app group, where the keyboard can read it.
    @Test func theRealMailboxIsInTheAppGroup() throws {
        let shared = try #require(Mailbox.shared)
        #expect(shared.file.deletingLastPathComponent().standardizedFileURL == AppGroup.containerURL?.standardizedFileURL)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'Mailbox' in scope`.

- [ ] **Step 3: Write the mailbox**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The mailbox (ios/prd.json IOS-008): one small file in the app group
// where the app tells the keyboard how the newest take is going and,
// once it is done, its words. The keyboard claims the words once, which
// clears them, so a take never inserts twice and the shared drawer never
// keeps words longer than it must. Reads and writes are coordinated, since
// the app and the keyboard are two processes.
import Foundation

struct MailboxEntry: Codable, Equatable, Sendable {
    enum Phase: String, Codable, Sendable {
        case listening, working, ready, nothing, failed
    }

    /// Which take this is, so a late answer never lands on a newer take.
    let take: UUID
    var phase: Phase
    /// The words, only while ready and not yet claimed.
    var words: String?
    let at: Date
}

struct Mailbox: Sendable {
    let file: URL

    /// mailbox.json in the app group, or nil without the entitlement.
    static var shared: Mailbox? {
        AppGroup.containerURL.map { Mailbox(file: $0.appending(path: "mailbox.json")) }
    }

    func read() -> MailboxEntry? {
        var entry: MailboxEntry?
        coordinate(writing: false) { url in
            entry = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(MailboxEntry.self, from: $0) }
        }
        return entry
    }

    func write(_ entry: MailboxEntry) {
        coordinate(writing: true) { url in
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The take's words, once: the first claim gets them and clears them,
    /// and every later claim gets nil.
    func claim(_ take: UUID? = nil) -> String? {
        var words: String?
        coordinate(writing: true) { url in
            guard let data = try? Data(contentsOf: url),
                  var entry = try? JSONDecoder().decode(MailboxEntry.self, from: data),
                  take == nil || entry.take == take,
                  entry.phase == .ready, let ready = entry.words
            else { return }
            words = ready
            entry.words = nil
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        return words
    }

    private func coordinate(writing: Bool, _ body: (URL) -> Void) {
        let coordinator = NSFileCoordinator()
        var error: NSError?
        if writing {
            coordinator.coordinate(writingItemAt: file, options: .forMerging, error: &error, byAccessor: body)
        } else {
            coordinator.coordinate(readingItemAt: file, options: [], error: &error, byAccessor: body)
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `MailboxTests` passes (6 tests), and every earlier test passes.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/Mailbox.swift ios/AppTests/MailboxTests.swift
git commit -m "IOS-008: the mailbox hands the keyboard the newest take's words, once"
```

### Task 2: The signals

**Files:** Create `ios/Shared/Signals.swift`. Test `ios/AppTests/SignalTests.swift`.

**Interfaces:** Produces `Signal` (`start`, `stop`, `cancel`, `changed`; `name`; `post()`) and `SignalListener(_ signals:handler:)`, whose handler runs on the main actor.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import murmur

@MainActor @Suite struct SignalTests {
    /// A posted signal reaches a listener, across processes in real use and
    /// within this one here.
    @Test func aPostedSignalIsHeard() async throws {
        let heard = Heard()
        let listener = SignalListener([.changed, .stop]) { signal in heard.signals.append(signal) }
        Signal.changed.post()
        for _ in 0..<50 where heard.signals.isEmpty {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(heard.signals == [.changed])
        _ = listener
    }

    @Test func signalsAreNamedUnderTheAppGroup() {
        #expect(Signal.allCases.allSatisfy { $0.name.hasPrefix(AppGroup.identifier + ".") })
        #expect(Set(Signal.allCases.map(\.name)).count == 4)
    }

    @MainActor final class Heard {
        var signals: [Signal] = []
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'SignalListener' in scope`.

- [ ] **Step 3: Write the signals**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The signals between the keyboard and the app (ios/prd.json IOS-008):
// Darwin notifications, which cross processes and carry nothing. The
// keyboard says start, stop, and cancel; the app says changed, and the
// mailbox holds what changed.
import Foundation

enum Signal: String, CaseIterable, Sendable {
    case start, stop, cancel, changed

    /// Named under the app group, so a self-built copy never hears ours.
    var name: String { "\(AppGroup.identifier).\(rawValue)" }

    func post() {
        CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString), nil, nil, true)
    }
}

/// Hears signals until it goes away; the handler runs on the main actor.
final class SignalListener: Sendable {
    private let signals: [Signal]
    private let handler: @MainActor @Sendable (Signal) -> Void

    init(_ signals: [Signal], handler: @escaping @MainActor @Sendable (Signal) -> Void) {
        self.signals = signals
        self.handler = handler
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        for signal in signals {
            CFNotificationCenterAddObserver(center, observer, { _, observer, name, _, _ in
                guard let observer, let name = name?.rawValue as String? else { return }
                Unmanaged<SignalListener>.fromOpaque(observer).takeUnretainedValue().hear(name)
            }, signal.name as CFString, nil, .deliverImmediately)
        }
    }

    deinit {
        CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
    }

    private func hear(_ name: String) {
        guard let signal = signals.first(where: { $0.name == name }) else { return }
        let handler = handler
        Task { @MainActor in handler(signal) }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `SignalTests` passes (2 tests).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/Signals.swift ios/AppTests/SignalTests.swift
git commit -m "IOS-008: the keyboard and the app signal each other across processes"
```

### Task 3: The pad's decisions

**Files:** Create `ios/Shared/Pad.swift`. Test `ios/AppTests/PadTests.swift`.

**Interfaces:** Consumes `MailboxEntry`. Produces `Pad.Reaction` (`none`, `status(String)`, `insert(UUID)`, `offerInsertLast`), `Pad.react(to:startedAt:sameField:)`, `Pad.spaced(_:after:)`, and `Pad.returnTitle(_:)`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
import UIKit
@testable import murmur

@Suite struct PadTests {
    let take = UUID()
    let started = Date(timeIntervalSince1970: 1_790_000_000)

    func entry(_ phase: MailboxEntry.Phase, words: String? = nil, at: Date? = nil) -> MailboxEntry {
        MailboxEntry(take: take, phase: phase, words: words, at: at ?? started.addingTimeInterval(0.2))
    }

    @Test func wordsForThisTakeInTheSameFieldAreInserted() {
        #expect(Pad.react(to: entry(.ready, words: "hi"), startedAt: started, sameField: true) == .insert(take))
    }

    /// You left the field before the words landed: Insert last.
    @Test func wordsAfterYouLeftTheFieldWaitAsInsertLast() {
        #expect(Pad.react(to: entry(.ready, words: "hi"), startedAt: started, sameField: false) == .offerInsertLast)
        // The keyboard came back later, not waiting on anything.
        #expect(Pad.react(to: entry(.ready, words: "hi"), startedAt: nil, sameField: true) == .offerInsertLast)
    }

    @Test func claimedWordsOfferNothing() {
        #expect(Pad.react(to: entry(.ready), startedAt: started, sameField: true) == .none)
        #expect(Pad.react(to: nil, startedAt: started, sameField: true) == .none)
    }

    @Test func thisTakesProgressIsShown() {
        #expect(Pad.react(to: entry(.listening), startedAt: started, sameField: true) == .status("Listening"))
        #expect(Pad.react(to: entry(.working), startedAt: started, sameField: true) == .status("Working"))
        #expect(Pad.react(to: entry(.nothing), startedAt: started, sameField: true) == .status("Heard nothing"))
        #expect(Pad.react(to: entry(.failed), startedAt: started, sameField: true) == .status("That take did not work. Open murmur to see why."))
    }

    /// An older take's progress never shows as this one's.
    @Test func anOlderTakeIsNotThisOne() {
        let old = entry(.listening, at: started.addingTimeInterval(-60))
        #expect(Pad.react(to: old, startedAt: started, sameField: true) == .none)
        #expect(Pad.react(to: entry(.listening), startedAt: nil, sameField: true) == .none)
    }

    @Test(arguments: [
        (nil as String?, "hello", "hello"),
        ("", "hello", "hello"),
        ("Hi", "there", " there"),
        ("Done.", "Next", " Next"),
        ("Hi ", "there", "there"),
        ("line\n", "next", "next"),
        ("(", "aside", "aside"),
        ("\u{201C}", "quote", "quote"),
        ("word", ", and", ", and"),
        ("word", ".", ".")
    ])
    func aSpaceGoesFirstOnlyWhenNeeded(_ before: String?, _ words: String, _ inserted: String) {
        #expect(Pad.spaced(words, after: before) == inserted)
    }

    @Test func returnFollowsTheField() {
        #expect(Pad.returnTitle(.default) == "Return")
        #expect(Pad.returnTitle(.send) == "Send")
        #expect(Pad.returnTitle(.search) == "Search")
        #expect(Pad.returnTitle(.go) == "Go")
        #expect(Pad.returnTitle(.done) == "Done")
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'Pad' in scope`.

- [ ] **Step 3: Write the decisions**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The dictation pad's decisions (ios/prd.json IOS-008), kept apart from
// its keys so the app's tests can hold them: where a take's words go, what
// the pad says, the space before the words, and the return key's name.
import Foundation
import UIKit

enum Pad {
    /// What the pad does with the newest mailbox entry.
    enum Reaction: Equatable {
        case none
        /// Show this line under the pill.
        case status(String)
        /// Insert this take's words at the cursor now.
        case insert(UUID)
        /// Offer Insert last: the words landed after you left the field.
        case offerInsertLast
    }

    /// startedAt is when this keyboard asked for a take, nil when it is not
    /// waiting on one; sameField is whether the cursor is still in the field
    /// the take began in.
    static func react(to entry: MailboxEntry?, startedAt: Date?, sameField: Bool) -> Reaction {
        guard let entry else { return .none }
        let ours = startedAt.map { entry.at >= $0.addingTimeInterval(-1) } ?? false
        switch entry.phase {
        case .ready where entry.words != nil:
            return ours && sameField ? .insert(entry.take) : .offerInsertLast
        case .ready:
            return .none
        case .listening where ours:
            return .status("Listening")
        case .working where ours:
            return .status("Working")
        case .nothing where ours:
            return .status("Heard nothing")
        case .failed where ours:
            return .status("That take did not work. Open murmur to see why.")
        default:
            return .none
        }
    }

    /// The words, with a space first when the text before the cursor needs
    /// one: after a word or a sentence's end, never after a space, a line
    /// break, or an opening bracket or quote, and never before punctuation.
    static func spaced(_ words: String, after before: String?) -> String {
        guard let last = before?.last, !last.isWhitespace, !"([{\"'\u{201C}\u{2018}/".contains(last),
              let first = words.first, !",.;:!?)]}".contains(first)
        else { return words }
        return " " + words
    }

    /// The return key's name, following the field's return key type.
    static func returnTitle(_ type: UIReturnKeyType) -> String {
        switch type {
        case .go: "Go"
        case .google, .yahoo, .search: "Search"
        case .join: "Join"
        case .next: "Next"
        case .route: "Route"
        case .send: "Send"
        case .done: "Done"
        case .emergencyCall: "Emergency call"
        case .continue: "Continue"
        default: "Return"
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `PadTests` passes (7 tests, 16 cases).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/Pad.swift ios/AppTests/PadTests.swift
git commit -m "IOS-008: the pad decides where a take's words go and the space before them"
```

### Task 4: The app's bridge to the keyboard

**Files:** Create `ios/App/Keyboard/KeyboardBridge.swift`. Test `ios/AppTests/KeyboardBridgeTests.swift`.

**Interfaces:** Consumes `TakeModel` (`state`, `start()`, `stop()`, `cancel()`, `isRecording`, `isBusy`, `live()`), `Mailbox`, `Signal`, `SignalListener`, and the tests' `FakeProvider` and `ScriptedMicrophone`. Produces `KeyboardBridge(model:mailbox:announce:)`, `listen()`, `hear(_:)`, and `KeyboardBridge.startOnce()`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct KeyboardBridgeTests {
    let groq = "https://api.groq.com/openai/v1"
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "bridge-\(UUID().uuidString).json"))
    let announced = Announced()

    @MainActor final class Announced {
        var count = 0
    }

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    }

    func model(_ provider: FakeProvider) throws -> TakeModel {
        TakeModel(
            microphone: microphone,
            store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "bridge-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
            rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: provider.send, copy: { _ in }
        )
    }

    func bridge(_ model: TakeModel) -> KeyboardBridge {
        let bridge = KeyboardBridge(model: model, mailbox: mailbox) { [announced] in announced.count += 1 }
        bridge.listen()
        return bridge
    }

    /// Waits for the mailbox to reach a phase, as the keyboard would.
    func waitFor(_ phase: MailboxEntry.Phase) async throws -> MailboxEntry? {
        for _ in 0..<100 {
            if let entry = mailbox.read(), entry.phase == phase { return entry }
            try await Task.sleep(for: .milliseconds(20))
        }
        return mailbox.read()
    }

    @Test func aKeyboardTakeComesBackThroughTheMailbox() async throws {
        let model = try model(.says("Send the invoice tomorrow."))
        let bridge = bridge(model)
        bridge.hear(.start)
        #expect(try await waitFor(.listening) != nil)
        for _ in 0..<100 where !model.isRecording {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(model.isRecording)
        bridge.hear(.stop)
        let ready = try #require(try await waitFor(.ready))
        #expect(ready.words == "Send the invoice tomorrow.")
        #expect(mailbox.claim(ready.take) == "Send the invoice tomorrow.")
        #expect(announced.count >= 2)
    }

    /// A take started on the Dictate screen never goes to the mailbox.
    @Test func aDictateScreenTakeStaysInTheApp() async throws {
        let model = try model(.says("Private words."))
        _ = bridge(model)
        await model.start()
        await model.stop()
        try await Task.sleep(for: .milliseconds(100))
        #expect(mailbox.read() == nil)
    }

    /// The model may still hold the last take's words when the keyboard
    /// starts a new one; those words are never handed over again.
    @Test func aNewTakeNeverCarriesTheLastTakesWords() async throws {
        let model = try model(.says("Old words."))
        await model.start()
        await model.stop()
        let bridge = bridge(model)
        bridge.hear(.start)
        let first = try #require(mailbox.read())
        #expect(first.phase == .listening && first.words == nil)
    }

    @Test func aCancelledTakeEndsAsNothing() async throws {
        let model = try model(.says("never sent"))
        let bridge = bridge(model)
        bridge.hear(.start)
        _ = try await waitFor(.listening)
        try await Task.sleep(for: .milliseconds(50))
        bridge.hear(.cancel)
        #expect(try await waitFor(.nothing) != nil)
        #expect(!model.isRecording)
    }

    @Test func silenceEndsAsNothing() async throws {
        microphone.samples = ScriptedMicrophone.silence
        let model = try model(.says("Thank you."))
        let bridge = bridge(model)
        bridge.hear(.start)
        _ = try await waitFor(.listening)
        try await Task.sleep(for: .milliseconds(50))
        bridge.hear(.stop)
        #expect(try await waitFor(.nothing) != nil)
    }

    @Test func noMicrophoneEndsAsFailed() async throws {
        microphone.allowed = false
        let bridge = bridge(try model(.says("hi")))
        bridge.hear(.start)
        #expect(try await waitFor(.failed) != nil)
    }

    /// A stop with no keyboard take running does nothing.
    @Test func aStrayStopIsIgnored() async throws {
        let model = try model(.says("hi"))
        let bridge = bridge(model)
        bridge.hear(.stop)
        try await Task.sleep(for: .milliseconds(50))
        #expect(mailbox.read() == nil)
        #expect(model.state == .idle)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'KeyboardBridge' in scope`.

- [ ] **Step 3: Write the bridge**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the keyboard (ios/prd.json IOS-008): it hears the
// keyboard's start, stop, and cancel, runs the take on the app's one take
// model, and tells the keyboard how it goes through the mailbox. Only a
// take the keyboard started goes to the mailbox, so a take made on the
// Dictate screen never turns up in another app.
import Foundation
import Observation

@MainActor final class KeyboardBridge {
    private let model: TakeModel
    private let mailbox: Mailbox
    private let announce: @MainActor () -> Void
    private var listener: SignalListener?
    /// The take the keyboard asked for, until it ends.
    private var take: UUID?
    private var startedAt = Date.distantPast

    init(model: TakeModel, mailbox: Mailbox, announce: @escaping @MainActor () -> Void = { Signal.changed.post() }) {
        self.model = model
        self.mailbox = mailbox
        self.announce = announce
    }

    /// Hears the keyboard from now on and follows the take model.
    func listen() {
        listener = SignalListener([.start, .stop, .cancel]) { [weak self] signal in
            self?.hear(signal)
        }
        follow()
    }

    func hear(_ signal: Signal) {
        switch signal {
        case .start:
            guard take == nil, !model.isRecording, !model.isBusy else { return }
            take = UUID()
            startedAt = .now
            // Written here, not read from the model, whose state may still
            // be the last take's words.
            write(.listening)
            Task { await model.start() }
        case .stop:
            guard take != nil else { return }
            Task { await model.stop() }
        case .cancel:
            guard take != nil else { return }
            model.cancel()
        case .changed:
            break
        }
    }

    /// Publishes each change of the take model's state, for as long as the
    /// bridge lives.
    private func follow() {
        withObservationTracking {
            _ = model.state
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.publish()
                self?.follow()
            }
        }
    }

    private func publish() {
        guard take != nil else { return }
        switch model.state {
        case .recording: write(.listening)
        case .transcribing: write(.working)
        case .words(let text): write(.ready, words: text, ends: true)
        case .heardNothing: write(.nothing, ends: true)
        case .failed, .micOff, .micFailed: write(.failed, ends: true)
        // Idle again after the take began: it was cancelled.
        case .idle: write(.nothing, ends: true)
        }
    }

    private func write(_ phase: MailboxEntry.Phase, words: String? = nil, ends: Bool = false) {
        guard let take else { return }
        mailbox.write(MailboxEntry(take: take, phase: phase, words: words, at: startedAt))
        announce()
        if ends { self.take = nil }
    }
}

extension KeyboardBridge {
    private static var shared: KeyboardBridge?

    /// Starts the one bridge for the app's life, on the app's take model.
    static func startOnce() {
        guard shared == nil, let model = TakeModel.live(), let mailbox = Mailbox.shared else { return }
        let bridge = KeyboardBridge(model: model, mailbox: mailbox)
        bridge.listen()
        shared = bridge
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `KeyboardBridgeTests` passes (7 tests).

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Keyboard/KeyboardBridge.swift ios/AppTests/KeyboardBridgeTests.swift
git commit -m "IOS-008: the app runs a keyboard's take and reports it through the mailbox"
```

### Task 5: The Keyboard screen

**Files:** Create `ios/App/Keyboard/KeyboardScreen.swift`. Modify `ios/App/ContentView.swift` (the Keyboard row, and the bridge started at launch). Test `ios/AppTests/KeyboardCopyTests.swift`.

- [ ] **Step 1: Write the failing test**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import murmur

@Suite struct KeyboardCopyTests {
    /// The steps are a real sequence, and murmur stays lowercase where a
    /// sentence starts.
    @Test func theStepsReadPlainly() {
        #expect(KeyboardCopy.steps.count == 4)
        for line in KeyboardCopy.steps + [KeyboardCopy.fullAccess, KeyboardCopy.tryPrompt, KeyboardCopy.tryFooter] {
            #expect(!line.contains("Murmur"))
        }
        #expect(KeyboardCopy.fullAccess.contains("never connects to the internet"))
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'KeyboardCopy' in scope`.

- [ ] **Step 3: Write the screen, and start the bridge from home**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The Keyboard screen (ios/prd.json IOS-008): how to add the murmur
// keyboard and turn on Full Access, why it needs it, and a box to try it
// in. A stand-in until first run (IOS-011) walks you through it.
import SwiftUI
import UIKit

struct KeyboardScreen: View {
    @State private var tryIt = ""

    var body: some View {
        Form {
            Section {
                ForEach(Array(KeyboardCopy.steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Tokens.brand)
                            .accessibilityHidden(true)
                        Text(step)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Step \(index + 1). \(step)")
                }
                if let settings = URL(string: UIApplication.openSettingsURLString) {
                    Link("Open Settings", destination: settings)
                        .buttonStyle(RowAction())
                }
            } header: {
                SectionTitle("Add the keyboard")
            } footer: {
                Text(KeyboardCopy.fullAccess).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                TextField(KeyboardCopy.tryPrompt, text: $tryIt, axis: .vertical)
                    .lineLimit(3...8)
            } header: {
                SectionTitle("Try it here")
            } footer: {
                Text(KeyboardCopy.tryFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Keyboard")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The Keyboard screen's words.
enum KeyboardCopy {
    static let steps = [
        "Open Settings, then General, then Keyboard, then Keyboards.",
        "Tap Add New Keyboard, and pick murmur.",
        "Tap murmur in the list, and turn on Allow Full Access.",
        "Come back here, tap the box below, and hold the globe key to pick murmur."
    ]

    static let fullAccess = "Full Access lets the keyboard hand your take to the murmur app and read the words back. The keyboard itself never connects to the internet; only the app talks to your provider."

    static let tryPrompt = "Tap here, then the pill"

    static let tryFooter = "Tap the pill, speak, and tap it again. Your words land where the cursor is. Keep murmur open for now; starting from other apps comes next."
}

#if DEBUG
#Preview {
    NavigationStack { KeyboardScreen() }.preferredColorScheme(.dark)
}
#endif
```

`ios/App/ContentView.swift` in full:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// A quiet placeholder until Home (IOS-012) replaces it: the way to a
/// take, the keyboard, Cleanup, and the Provider screen, and nothing else.
/// It starts the keyboard's bridge to the app's take model.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            List {
                Group {
                    NavigationLink("Dictate") { TakeRoute() }
                    NavigationLink("Keyboard") { KeyboardScreen() }
                    NavigationLink("Cleanup") { CleanupRoute() }
                    NavigationLink("Provider and key") { ProviderRoute() }
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle("murmur")
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task { KeyboardBridge.startOnce() }
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: 108 app tests pass.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Keyboard/KeyboardScreen.swift ios/App/ContentView.swift ios/AppTests/KeyboardCopyTests.swift
git commit -m "IOS-008: the Keyboard screen shows how to add the keyboard and a box to try it in"
```

### Task 6: The keyboard

**Files:** Create `ios/Shared/PadView.swift`. Replace `ios/Keyboard/KeyboardViewController.swift`.

The keys are UIKit and are checked by building, not by unit tests. Their decisions were pinned in Task 3. The views were captured in the simulator before this plan was written (see Proven before writing), and the live check exercises them on the device.

- [ ] **Step 1: Write the pad's view**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The dictation pad's keys (ios/prd.json IOS-008): the pill in the middle,
// with globe, space, delete, and return around it, and Insert last when a
// take landed after you left its field. Kept in Shared so the app can
// preview it; only the keyboard wires it to a text field.
import UIKit

final class PadView: UIView {
    let pill = UIButton(type: .system)
    let status = UILabel()
    let insertLast = UIButton(type: .system)
    let globe = UIButton(type: .system)
    let space = UIButton(type: .system)
    let delete = UIButton(type: .system)
    let returnKey = UIButton(type: .system)
    let fullAccess = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(Tokens.ink)
        // The keyboard's height is fixed, so text grows only as far as it fits.
        maximumContentSizeCategory = .accessibilityMedium

        var pillLook = UIButton.Configuration.filled()
        pillLook.cornerStyle = .capsule
        pillLook.imagePadding = 8
        pillLook.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 28, bottom: 14, trailing: 28)
        pill.configuration = pillLook
        setListening(false)

        for label in [status, fullAccess] {
            label.font = .preferredFont(forTextStyle: .footnote)
            label.adjustsFontForContentSizeCategory = true
            label.textColor = UIColor(Tokens.textDim)
            label.textAlignment = .center
            label.numberOfLines = 2
            label.adjustsFontSizeToFitWidth = true
            label.minimumScaleFactor = 0.7
        }
        fullAccess.numberOfLines = 4
        fullAccess.text = "murmur needs Full Access to hear you. Open Settings, then General, Keyboard, Keyboards, murmur, and turn on Allow Full Access."
        fullAccess.isHidden = true

        var insertLook = UIButton.Configuration.plain()
        insertLook.title = "Insert last"
        insertLook.baseForegroundColor = UIColor(Tokens.brand)
        insertLast.configuration = insertLook
        insertLast.isHidden = true

        key(globe, image: "globe", label: "Next keyboard")
        key(space, title: "space", label: "Space")
        key(delete, image: "delete.left", label: "Delete")
        key(returnKey, title: "Return", label: "Return")

        let top = UIStackView(arrangedSubviews: [insertLast, pill, status, fullAccess])
        top.axis = .vertical
        top.alignment = .center
        top.spacing = 6
        top.translatesAutoresizingMaskIntoConstraints = false
        // The pill keeps its size and sits in the middle of the space
        // above the keys, however tall that space is.
        let middle = UIView()
        middle.addSubview(top)
        let bottom = UIStackView(arrangedSubviews: [globe, space, delete, returnKey])
        bottom.spacing = 6
        let column = UIStackView(arrangedSubviews: [middle, bottom])
        column.axis = .vertical
        column.spacing = 8
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            column.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -6),
            column.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            column.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
            top.centerXAnchor.constraint(equalTo: middle.centerXAnchor),
            top.centerYAnchor.constraint(equalTo: middle.centerYAnchor),
            top.topAnchor.constraint(greaterThanOrEqualTo: middle.topAnchor),
            top.bottomAnchor.constraint(lessThanOrEqualTo: middle.bottomAnchor),
            top.leadingAnchor.constraint(greaterThanOrEqualTo: middle.leadingAnchor),
            top.trailingAnchor.constraint(lessThanOrEqualTo: middle.trailingAnchor),
            pill.heightAnchor.constraint(equalToConstant: 56),
            pill.widthAnchor.constraint(greaterThanOrEqualToConstant: 176),
            globe.widthAnchor.constraint(equalToConstant: 48),
            delete.widthAnchor.constraint(equalToConstant: 56),
            returnKey.widthAnchor.constraint(greaterThanOrEqualToConstant: 88),
            bottom.heightAnchor.constraint(equalToConstant: 48)
        ])
        // The return key grows to fit its name (Emergency call is long) and
        // the space bar gives way; key labels stop growing where the row
        // still holds them, as the system keyboard's do.
        returnKey.setContentCompressionResistancePriority(.required, for: .horizontal)
        returnKey.setContentHuggingPriority(.required, for: .horizontal)
        space.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        space.setContentHuggingPriority(.defaultLow, for: .horizontal)
        bottom.maximumContentSizeCategory = .extraExtraLarge
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("PadView is built in code") }

    /// The pill: gold to start, live amber while listening.
    func setListening(_ listening: Bool) {
        var look = pill.configuration ?? .filled()
        look.title = listening ? "Stop" : "Tap to talk"
        look.image = UIImage(systemName: listening ? "stop.fill" : "mic.fill")
        look.baseBackgroundColor = UIColor(listening ? Tokens.amber : Tokens.panelLift)
        look.baseForegroundColor = UIColor(listening ? Tokens.ink : Tokens.brand)
        pill.configuration = look
        pill.accessibilityLabel = listening ? "Stop dictation" : "Start dictation"
    }

    /// Without Full Access the pill cannot work, so it gives way to the
    /// one line that says how to turn it on.
    func setFullAccess(_ granted: Bool) {
        pill.isHidden = !granted
        status.isHidden = !granted
        fullAccess.isHidden = granted
    }

    private func key(_ button: UIButton, image: String? = nil, title: String? = nil, label: String) {
        var look = UIButton.Configuration.filled()
        look.baseBackgroundColor = UIColor(Tokens.panelLift)
        look.baseForegroundColor = UIColor(Tokens.text)
        look.cornerStyle = .medium
        look.image = image.map { UIImage(systemName: $0) } ?? nil
        look.title = title
        look.titleLineBreakMode = .byTruncatingTail
        button.configuration = look
        button.accessibilityLabel = label
        button.titleLabel?.adjustsFontForContentSizeCategory = true
    }
}
```

- [ ] **Step 2: Write the keyboard**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The murmur keyboard, a dictation pad (ios/prd.json IOS-008): tap the
// pill to start a take and again to stop it. The keyboard only signals the
// app (start, stop, cancel) and reads the mailbox; it never touches the
// microphone or the network. Words land at the cursor once, or wait as
// Insert last when you left the field before they arrived.
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let pad = PadView()
    private var listener: SignalListener?
    /// When this keyboard asked for a take, until it ends.
    private var startedAt: Date?
    /// The field the take began in.
    private var field: UUID?
    private var listening = false
    private var deleteRepeat: Timer?
    private var noAnswer: Timer?

    override func viewDidLoad() {
        super.viewDidLoad()
        pad.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pad)
        let height = view.heightAnchor.constraint(equalToConstant: 236)
        height.priority = .defaultHigh
        NSLayoutConstraint.activate([
            height,
            pad.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pad.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            pad.topAnchor.constraint(equalTo: view.topAnchor),
            pad.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        pad.globe.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        pad.pill.addTarget(self, action: #selector(tapPill), for: .touchUpInside)
        pad.space.addTarget(self, action: #selector(tapSpace), for: .touchUpInside)
        pad.returnKey.addTarget(self, action: #selector(tapReturn), for: .touchUpInside)
        pad.insertLast.addTarget(self, action: #selector(tapInsertLast), for: .touchUpInside)
        pad.delete.addTarget(self, action: #selector(deleteDown), for: .touchDown)
        pad.delete.addTarget(self, action: #selector(deleteUp), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        listener = SignalListener([.changed]) { [weak self] _ in self?.refresh() }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        pad.setFullAccess(hasFullAccess)
        refresh()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // A take still listening when the keyboard goes away is dropped.
        if listening { Signal.cancel.post() }
        deleteUp()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        pad.globe.isHidden = !needsInputModeSwitchKey
        setReturnTitle()
    }

    override func textDidChange(_ textInput: (any UITextInput)?) {
        super.textDidChange(textInput)
        setReturnTitle()
    }

    @objc private func tapPill() {
        if listening {
            Signal.stop.post()
            return
        }
        startedAt = .now
        field = textDocumentProxy.documentIdentifier
        pad.insertLast.isHidden = true
        pad.status.text = "Starting"
        Signal.start.post()
        // The app answers within a moment when it is open; when it is not,
        // say how to start.
        noAnswer?.invalidate()
        noAnswer = Timer.scheduledTimer(withTimeInterval: 2, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.answerMissing() }
        }
    }

    private func answerMissing() {
        guard startedAt != nil, !listening else { return }
        startedAt = nil
        pad.status.text = "Open murmur, then tap the pill again."
    }

    @objc private func tapInsertLast() {
        guard let words = Mailbox.shared?.claim() else { return }
        insert(words)
        pad.insertLast.isHidden = true
    }

    @objc private func tapSpace() { textDocumentProxy.insertText(" ") }
    @objc private func tapReturn() { textDocumentProxy.insertText("\n") }

    /// Delete repeats while held, after a short pause.
    @objc private func deleteDown() {
        textDocumentProxy.deleteBackward()
        deleteRepeat?.invalidate()
        deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.deleteRepeat = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
                    MainActor.assumeIsolated { self?.textDocumentProxy.deleteBackward() }
                }
            }
        }
    }

    @objc private func deleteUp() {
        deleteRepeat?.invalidate()
        deleteRepeat = nil
    }

    private func setReturnTitle() {
        let title = Pad.returnTitle(textDocumentProxy.returnKeyType ?? .default)
        var look = pad.returnKey.configuration
        look?.title = title
        pad.returnKey.configuration = look
        pad.returnKey.accessibilityLabel = title
    }

    /// Reads the mailbox and does what the newest entry asks.
    private func refresh() {
        guard hasFullAccess, let mailbox = Mailbox.shared else { return }
        let entry = mailbox.read()
        let ours = startedAt.map { start in entry.map { $0.at >= start.addingTimeInterval(-1) } ?? false } ?? false
        listening = ours && entry?.phase == .listening
        pad.setListening(listening)
        if ours { noAnswer?.invalidate() }
        switch Pad.react(to: entry, startedAt: startedAt, sameField: textDocumentProxy.documentIdentifier == field) {
        case .insert(let take):
            if let words = mailbox.claim(take) { insert(words) }
            finish(nil)
        case .offerInsertLast:
            pad.insertLast.isHidden = false
            finish(nil)
        case .status(let line):
            pad.status.text = line
            if entry?.phase == .nothing || entry?.phase == .failed { finish(line) }
        case .none:
            break
        }
    }

    private func insert(_ words: String) {
        textDocumentProxy.insertText(Pad.spaced(words, after: textDocumentProxy.documentContextBeforeInput))
    }

    private func finish(_ line: String?) {
        startedAt = nil
        listening = false
        pad.setListening(false)
        pad.status.text = line
    }
}
```

- [ ] **Step 3: Build everything and run the tests**

Run: `npm run ios:test`, which builds the app and the keyboard extension.
Expected: the build has no `warning:` from `ios/Keyboard` or `ios/Shared`, and 108 app tests pass.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/Shared/PadView.swift ios/Keyboard/KeyboardViewController.swift
git commit -m "IOS-008: the keyboard is a dictation pad: the pill, globe, space, delete, and return"
```

### Task 7: The keyboard makes no network requests

**Files:** Create `scripts/lib/keyboard-network.js`. Test `scripts/lib/keyboard-network.test.js`.

- [ ] **Step 1: Write the failing test**

```js
// SPDX-License-Identifier: GPL-3.0-only
// The keyboard makes no network requests (ios/prd.json IOS-008): this
// fails if anything the keyboard compiles names a networking API.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { networkUses } from './keyboard-network'

const ios = join(__dirname, '..', '..', 'ios')

function swiftFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return swiftFiles(path)
    return entry.name.endsWith('.swift') ? [path] : []
  })
}

describe('the keyboard makes no network requests', () => {
  it('finds networking in code, not in comments', () => {
    expect(networkUses('let session = URLSession.shared')).toEqual(['URLSession'])
    expect(networkUses('import Network\nlet c = NWConnection(host: "a", port: 1, using: .tcp)')).toEqual(['NWConnection', 'import Network'])
    expect(networkUses('let site = "https://murmurapp.app"')).toEqual(['https://'])
    expect(networkUses('// URLSession is the app\'s job\n/* https://example.com */\nlet x = 1')).toEqual([])
  })

  it('compiles only Keyboard, Shared, and the colors into the keyboard', () => {
    const yml = readFileSync(join(ios, 'project.yml'), 'utf8')
    const keyboard = yml.slice(yml.indexOf('  murmurKeyboard:'), yml.indexOf('  murmurTests:'))
    const sources = [...keyboard.slice(0, keyboard.indexOf('dependencies:')).matchAll(/- path: (\S+)/g)].map((m) => m[1])
    expect(sources).toEqual(['Keyboard', 'Shared', 'Generated/Tokens.swift'])
  })

  it('names no networking API anywhere the keyboard compiles', () => {
    const files = [...swiftFiles(join(ios, 'Keyboard')), ...swiftFiles(join(ios, 'Shared'))]
    expect(files.length).toBeGreaterThan(4)
    const uses = files.map((file) => [file.slice(ios.length + 1), networkUses(readFileSync(file, 'utf8'))]).filter(([, found]) => found.length > 0)
    expect(uses).toEqual([])
  })

  it('links MurmurCore, which builds requests but never sends one', () => {
    const core = swiftFiles(join(ios, 'MurmurCore', 'Sources'))
    const sends = core.filter((file) => /\bURLSession\w*\b|\bNW(?:Connection|Listener)\b|^\s*import\s+Network\b/m.test(readFileSync(file, 'utf8')))
    expect(sends).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/lib/keyboard-network.test.js`
Expected: FAIL, because `./keyboard-network` does not exist.

- [ ] **Step 3: Write the scanner**

```js
// SPDX-License-Identifier: GPL-3.0-only
// The keyboard makes no network requests (ios/prd.json IOS-008): finds any
// networking API named in Swift source, comments left out. The test runs
// it over everything the keyboard compiles.

/** Networking APIs and web addresses a keyboard must never name. */
const NETWORK = [
  /\bURLSession\w*\b/,
  /\bURLRequest\b/,
  /\bNSURLConnection\b/,
  /\bNW(?:Connection|Listener|PathMonitor|Browser|Endpoint|Parameters)\b/,
  /^\s*import\s+(?:Network|WebKit|SafariServices)\b/m,
  /\bCFNetwork\b/,
  /\bCFStream\w*\b/,
  /\bWKWebView\b/,
  /\bSFSafariViewController\b/,
  /https?:\/\//
]

/** Swift source with its line and block comments blanked out. A // right
 *  after a colon is a web address, not a comment, so it stays. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, '')
}

/** The networking names a piece of Swift source uses, if any. */
function networkUses(source) {
  const code = withoutComments(source)
  return NETWORK.filter((pattern) => pattern.test(code)).map((pattern) => code.match(pattern)[0].trim())
}

module.exports = { networkUses }
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run scripts/lib/keyboard-network.test.js`
Expected: 4 pass.

- [ ] **Step 5: Run the gates and commit**

```bash
git add scripts/lib/keyboard-network.js scripts/lib/keyboard-network.test.js
git commit -m "IOS-008: a test fails if anything the keyboard compiles names a networking API"
```

### Task 8: The smoke

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift` (the `mailbox` check).

- [ ] **Step 1: Add the check.** `ios/App/Smoke/SmokeRunner.swift` in full:

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
            ("speechGate", checkSpeechGate),
            ("transcription", checkTranscription),
            ("waitingTakes", checkWaitingTakes),
            ("polish", checkPolish),
            ("mailbox", checkMailbox),
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

    /// A generated tone passes the speech gate and a generated silence
    /// does not; a phrase models invent on silence is heard as nothing.
    static func checkSpeechGate() throws {
        let rules = try BundledRules.takeRules()
        guard TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) != nil else {
            throw SmokeFailure("the tone did not pass the gate")
        }
        guard TakeAudio.upload(ScriptedMicrophone.silence, gate: rules.gate) == nil else {
            throw SmokeFailure("silence passed the gate")
        }
        guard TakeAudio.heard("Thank you.", list: rules.hallucinations) == nil,
              TakeAudio.heard("Send the invoice tomorrow.", list: rules.hallucinations) != nil
        else { throw SmokeFailure("the hallucination filter misjudged a transcript") }
    }

    /// A take, gated and encoded, goes to the local stand-in through the
    /// real URLSession, and its words come back.
    static func checkTranscription() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let result = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .words(let text) = result, TakeAudio.heard(text, list: rules.hallucinations) == StubProtocol.words else {
            throw SmokeFailure("the stand-in gave \(result)")
        }
    }

    /// A take that fails waits in a scratch folder with protection that
    /// allows writing after first unlock, then a retry delivers it and its
    /// audio goes.
    static func checkWaitingTakes() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "smoke-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let down = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.downBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .failed(let kind, let detail) = down, kind == .server else { throw SmokeFailure("the down host gave \(down)") }
        let id = try store.save(wav, startedAt: .now, failure: TakeFailure(kind: kind.rawValue, detail: detail))
        guard store.list().map(\.id) == [id], store.take(id)?.failure?.kind == "server" else { throw SmokeFailure("the failed take did not list") }
        let protection = try store.directory.appending(path: "\(id).wav").resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        guard protection == .completeUntilFirstUserAuthentication else { throw SmokeFailure("the audio has protection \(String(describing: protection))") }
        let audio = try store.audio(id)
        let retried = waitFor { await Transcription.run(wav: audio, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard retried == .words(StubProtocol.words) else { throw SmokeFailure("the retry gave \(retried)") }
        try store.remove(id)
        guard store.list().isEmpty else { throw SmokeFailure("the delivered take is still waiting") }
    }

    /// Polish pointed at a stand-in that errors, then at one that chats:
    /// both give back the formatted text unchanged, and say why.
    static func checkPolish() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        let heard = "um send the report tomorrow and copy the whole team on it please"
        let formatted = formatTranscript(heard, options: FormatOptions(), spec: rules.format)
        let session = StubProtocol.session()
        for baseUrl in [StubProtocol.chatErrorBaseUrl, StubProtocol.chattyBaseUrl] {
            let connection = PolishConnection(baseUrl: baseUrl, model: "smoke-model", key: key)
            let reasons = Reasons()
            let text = waitFor {
                await Cleanup.finish(heard, settings: CleanupSettings(), rules: rules.cleanup, connection: connection, send: { try await session.data(for: $0) }) { reason in
                    reasons.list.withLock { $0.append(reason) }
                }
            }
            guard text == formatted else { throw SmokeFailure("\(baseUrl) changed the text to \(text)") }
            guard reasons.list.withLock({ $0.count }) == 1 else { throw SmokeFailure("polish at \(baseUrl) did not fall back") }
        }
    }

    /// A mailbox round trip in the app group: the app posts a take, a
    /// simulated keyboard reads it once, and a second read gets nothing.
    static func checkMailbox() throws {
        guard let container = AppGroup.containerURL else { throw SmokeFailure("no container for \(AppGroup.identifier)") }
        let mailbox = Mailbox(file: container.appending(path: "smoke-mailbox-\(UUID().uuidString).json"))
        defer { try? FileManager.default.removeItem(at: mailbox.file) }
        let take = UUID()
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "smoke words for the keyboard", at: .now))
        guard mailbox.claim(take) == "smoke words for the keyboard" else { throw SmokeFailure("the keyboard did not get the words") }
        guard mailbox.claim(take) == nil, mailbox.claim() == nil else { throw SmokeFailure("a second read got the words again") }
    }

    /// Fallback reasons, collected across the smoke's async bridge.
    private final class Reasons: Sendable {
        let list = Mutex<[String]>([])
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

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT {"checks":{"appGroup":true,"connectionTest":true,"keychain":true,"keyRing":true,"mailbox":true,"polish":true,"sharedJson":true,"speechGate":true,"transcription":true,"waitingTakes":true},"ok":true}`

The check exercises Task 1's code, which already passes, so it cannot be seen failing first. `MailboxTests` pinned the same behavior red to green.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-008: the smoke posts a take to the mailbox, reads it once, and finds nothing the second time"
```

### Task 9: Docs, the live check, and the records

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json` (IOS-008 notes), and the roadmaps via `npm run roadmap`.

- [ ] **Step 1: Append to `ios/docs/iphone.md`:**

```markdown
## How do I add the murmur keyboard?

Add it once in Settings, turn on Full Access, then pick it with the globe key.

1. Open Settings, then General, then Keyboard, then Keyboards.
2. Tap Add New Keyboard, and pick murmur.
3. Tap murmur in the list, and turn on Allow Full Access.
4. In any text field, hold the globe key and pick murmur. The Keyboard screen in murmur has a box to try it in.

The keyboard is a dictation pad: the pill to talk, and globe, space, delete, and return. Tap the pill, speak, and tap it again; your words land where the cursor is. Typing letters stays with your other keyboards. In password and phone number fields, iOS always shows its own keyboard instead.

For now the pill works while murmur is open. Starting a take from another app comes with murmur's listening session.

## Why does murmur need Full Access?

Full Access lets the keyboard and the murmur app share a small drawer. The keyboard leaves a note saying start or stop, and the app leaves your words for the keyboard to type. Without Full Access, iOS walls the keyboard off from the app, so the pill cannot work; the keyboard says so and shows the steps to turn it on.

The keyboard itself never connects to the internet. A test checks that every time murmur is built. Only the app talks to your provider, and only your newest take's words pass through the drawer, cleared as soon as they are typed.

## What is Insert last?

If you leave the text field before your words are ready, murmur does not type them into whatever field you moved to. The keyboard shows Insert last instead. Tap it to type your newest take where your cursor is now. A take is typed once: after that, its words are cleared from the keyboard.
```

- [ ] **Step 2: Add the live check to HANDOFF.md**, under the IOS-007 item:

```markdown
- [ ] IOS-008 live check, once TestFlight 1 is on your iPhone (IOS-015; added 2026-10-12). (1) Add the keyboard: Settings, General, Keyboard, Keyboards, Add New Keyboard, murmur. Then tap murmur in that list and turn on Allow Full Access. (2) Open murmur, tap Keyboard, tap the box under Try it here, and hold the globe key to pick murmur. (3) Tap Tap to talk, say a sentence, and tap Stop. Your words should appear in the box once. Say a second sentence the same way: it should land after the first with a space between them. (4) In any app's password field, check that iOS shows its own keyboard, not murmur's. (5) Tell Claude what happened. (6) When Claude asks, plug the iPhone into the Mac and keep dictating for a few minutes while Claude watches the keyboard's memory in Instruments.
```

- [ ] **Step 3: Write IOS-008's notes in `ios/prd.json`** (passes stays false, needs_human true), then run `npm run roadmap`.

- [ ] **Step 4: Run every gate**

Run: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`.
Expected: typecheck clean; 893 desktop tests; 104 MurmurCore tests (1 known issue); 108 app tests; iPhone smoke 10 of 10.

- [ ] **Step 5: Commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json ROADMAP.md ios/ROADMAP.md
git commit -m "IOS-008: the iPhone docs answer how to add the keyboard, why it needs Full Access, and what Insert last is"
```
