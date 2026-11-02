# Diagnostics (IOS-014) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When something goes wrong, one plain report you read before you send it.
- murmur keeps a small activity log of what happened to each take: captured, heard nothing (with the measured level), failed (with its kind and status), typed by the keyboard, or waiting as Insert last.
- Settings, Diagnostics, Save report builds one text file and opens it as a preview. Share there opens the share sheet. Nothing is ever sent by itself.
- Never words, never keys. A canary test and a smoke check prove it.

**Architecture:**
- `ActivityLog` writes one line per `ActivityEvent` to `Application Support/logs/activity.log`. Every event case carries only numbers, flags, fixed names, and short take ids, so a line cannot hold words or a key by construction.
- `TakeModel` gains a `note` closure, beside IOS-012's `record`, and notes each outcome.
- The keyboard notes in the mailbox entry whether it typed the words or offered them as Insert last (`MailboxEntry.typed`). The app's `KeyboardBridge` logs that when the next keyboard take begins, and the report builder logs it before reading.
- `DiagnosticsReport` gathers `DiagnosticsFacts` (app, phone, keyboard, session, settings as names and counts, the log tail) and turns them into text.
- `DiagnosticsScreen` saves the text to a temporary file and shows a preview with a ShareLink.

**Tech Stack:** Swift 6, SwiftUI (List, sheet, ShareLink), Foundation file APIs, Swift Testing.

**Spec:** `ios/prd.json` IOS-014, with `conventions` (design, verify, docs), `CLAUDE.md`, and `DESIGN.md`. Desktop's `src/main/diagnostics.ts` and `src/main/logging.ts` are murmur's own, and the iPhone follows their ideas: a content-free log, a capped rolling file, a report built only from local state, never auto-sent, and a smoke leak check that can fail. The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** every block below ran in a throwaway copy of `feature/ios` at 9725e22 before this plan was saved:
- `npm run ios:test` ran 225 app tests: 211 there plus 14 new.
- `npm run ios:smoke` printed sixteen true checks, `diagnostics` among them.
- The Diagnostics screen and the report preview were rendered in the simulator and read.

On this branch's head (6469bbb, after IOS-013's review fixes) the app suite starts at 213, so the totals below count from 213.

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **Where the log lives and how big it gets.**
   - It lives in `Application Support/logs/activity.log`, in murmur's own container. It is out of iCloud backups and writable after first unlock, since a take can land while the phone is locked.
   - At 64 KB it rolls over once (`activity.1.log`), so about 1,200 lines are kept. The report shows the last 200.
   - If wrong: a size change is one constant.
2. **Lines are built only from `ActivityEvent`.** A line holds:
   - numbers, flags, and fixed names;
   - the first 8 characters of a keyboard take's id;
   - for a failure, its kind from the known set (anything else becomes other) and only the http status or URL error number from its detail.
   Nothing free-form reaches a line.
3. **Typed and Insert last come from the keyboard's note in the mailbox entry.** The app logs them when the next keyboard take begins and when a report is built. The keyboard writes nothing else and keeps no log of its own.
4. **The report never writes a custom provider address**, only the word custom. Preset names and model ids are written, and whether a key is saved shows as yes or no.
5. **Save report writes one file** to the app's temporary folder, replacing the last one. The preview's Share opens the share sheet. If the file cannot be written, Share sends the text instead.
6. **Diagnostics sits in Settings** between Keyboard and About.
7. **Only takes are logged.** Session starts and ends and app launches are not, since the story asks what happened to each take. If wrong: one event case each.
8. **IOS-014 is `needs_human: false`.** Every criterion is checked by tests, the smoke, and the rendered screens, so `passes` is set true after the review gate's fixes.

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6): bind by key path, never `Binding(get:set:)` with closures, and write long math as small typed steps.
- The keyboard keeps no network code. `scripts/lib/keyboard-network.js` still scans it.
- Never words and never keys in a log line or the report. Never a custom address in the report.
- Design: night studio tokens. Gold for Save report and the preview's buttons; no red on this screen. 44 point targets. VoiceOver reads the Share button by name.
- Every `.swift` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-014:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **Words or a key reaching the log or the report through any path:**
   - a provider error that repeats the key;
   - the dictionary and expansions;
   - the mailbox's waiting words;
   - a retried take.
   Pinned by `DiagnosticsCanaryTests.neitherCanaryReachesTheLogOrTheReport` (Task 4) and the smoke's `diagnostics` check (Task 6).
2. **A failure line that carries more than its kind and number.** Pinned by `ActivityLogTests.aFailureNamesItsKindAndNumberOnly` (Task 2).
3. **A log that grows without end, or loses its newest lines when it rolls.** Pinned by `ActivityLogTests.theLogRollsOverOnce` (Task 2).
4. **A keyboard outcome logged twice, or never.** Pinned by `ActivityLogTests.theKeyboardsOutcomeIsNotedOnce` (Task 2), `KeyboardBridgeTests.theLastKeyboardTakeIsNotedWhenTheNextBegins` (Task 3), and `DiagnosticsReportTests.theKeyboardsLastTakeIsIncluded` (Task 4).
5. **A custom provider address in the report.** Pinned by `DiagnosticsReportTests.aCustomAddressIsNeverWritten` (Task 4).

---

### Task 1: The keyboard notes what it did with the words

**Files:**
- Modify: `ios/Shared/Mailbox.swift`, `ios/Keyboard/KeyboardViewController.swift`.
- Test: `ios/AppTests/MailboxTests.swift`.

**Interfaces:**
- Produces `MailboxEntry.Typed` (`.inserted`, `.offered`).
- Produces `MailboxEntry.typed: Typed?`, which defaults to nil, so `MailboxEntry(take:phase:words:at:)` still builds.
- Produces `Mailbox.offer(_ take: UUID)`. `Mailbox.claim` now sets `.inserted`.

- [ ] **Step 1: Write the failing test**

In `ios/AppTests/MailboxTests.swift`, before `anAskIsAnsweredOnce`, add:

```swift
    /// A claim notes that the words were typed, and Insert last notes that
    /// they were offered (IOS-014), only for the take's own ready words.
    @Test func whatTheKeyboardDidIsNoted() {
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "Send the invoice.", at: at))
        mailbox.offer(UUID())
        #expect(mailbox.read()?.typed == nil)
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == .offered)
        #expect(mailbox.read()?.words == "Send the invoice.")
        #expect(mailbox.claim(take) == "Send the invoice.")
        #expect(mailbox.read()?.typed == .inserted)
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == .inserted)
        mailbox.write(MailboxEntry(take: take, phase: .working, words: nil, at: at))
        mailbox.offer(take)
        #expect(mailbox.read()?.typed == nil)
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run ios:test`
Expected: the app test build fails with `value of type 'Mailbox' has no member 'offer'`.

- [ ] **Step 3: Note it**

`ios/Shared/Mailbox.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The mailbox (ios/prd.json IOS-008): small files in the app group shared
// by the app and the keyboard. The keyboard leaves its request for a take,
// with its own id; the app tells the keyboard how that take is going and,
// once it is done, its words. The keyboard claims the words once, which
// clears them, so a take never inserts twice and the shared drawer never
// keeps words longer than it must. Reads and writes are coordinated, since
// the app and the keyboard are two processes.
import Foundation

struct MailboxEntry: Codable, Equatable, Sendable {
    enum Phase: String, Codable, Sendable {
        case listening, working, ready, nothing, failed
    }

    /// What the keyboard did with the words (IOS-014), for the activity log.
    enum Typed: String, Codable, Sendable {
        /// Typed into the field.
        case inserted
        /// Offered as Insert last, the field being gone.
        case offered
    }

    /// The id the keyboard asked with, so each keyboard knows its own take.
    let take: UUID
    var phase: Phase
    /// The words, only while ready and not yet claimed.
    var words: String?
    let at: Date
    /// Nil until the keyboard types or offers the words.
    var typed: Typed? = nil
}

struct Mailbox: Sendable {
    let file: URL

    /// mailbox.json in the app group, or nil without the entitlement.
    static var shared: Mailbox? {
        AppGroup.containerURL.map { Mailbox(file: $0.appending(path: "mailbox.json")) }
    }

    /// Where the keyboard leaves its request, beside the mailbox.
    var requestFile: URL {
        file.deletingLastPathComponent().appending(path: file.deletingPathExtension().lastPathComponent + "-request.json")
    }

    private struct Request: Codable {
        let take: UUID
        let at: Date
    }

    func read() -> MailboxEntry? {
        var entry: MailboxEntry?
        coordinate(file, writing: false) { url in
            entry = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(MailboxEntry.self, from: $0) }
        }
        return entry
    }

    func write(_ entry: MailboxEntry) {
        coordinate(file, writing: true) { url in
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The take's words, once: the first claim gets them and clears them,
    /// and every later claim gets nil.
    func claim(_ take: UUID? = nil) -> String? {
        var words: String?
        coordinate(file, writing: true) { url in
            guard let data = try? Data(contentsOf: url),
                  var entry = try? JSONDecoder().decode(MailboxEntry.self, from: data),
                  take == nil || entry.take == take,
                  entry.phase == .ready, let ready = entry.words
            else { return }
            words = ready
            entry.words = nil
            entry.typed = .inserted
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        return words
    }

    /// Notes that the keyboard offered the take's words as Insert last
    /// (IOS-014). The words stay; only the note changes.
    func offer(_ take: UUID) {
        coordinate(file, writing: true) { url in
            guard let data = try? Data(contentsOf: url),
                  var entry = try? JSONDecoder().decode(MailboxEntry.self, from: data),
                  entry.take == take, entry.phase == .ready, entry.words != nil, entry.typed == nil
            else { return }
            entry.typed = .offered
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// Drops words still waiting to be typed (Insert last) when you delete
    /// them in murmur (IOS-012): the ones given, or any with nil. A take
    /// still running is left alone.
    func forget(_ words: Set<String>?) {
        coordinate(file, writing: true) { url in
            guard let data = try? Data(contentsOf: url),
                  var entry = try? JSONDecoder().decode(MailboxEntry.self, from: data),
                  entry.phase == .ready, let waiting = entry.words,
                  words?.contains(waiting) ?? true
            else { return }
            entry.words = nil
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The keyboard asks for a take with its own id, just before it signals
    /// start.
    func ask(_ take: UUID, at: Date = .now) {
        coordinate(requestFile, writing: true) { url in
            try? JSONEncoder().encode(Request(take: take, at: at)).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The take the keyboard asked for, once, and only while the ask is
    /// fresh: a start that waited (murmur was not running) is dropped
    /// instead of recording a take no keyboard is waiting on.
    func answer(within seconds: TimeInterval, now: Date = .now) -> UUID? {
        var take: UUID?
        coordinate(requestFile, writing: true) { url in
            defer { try? FileManager.default.removeItem(at: url) }
            guard let data = try? Data(contentsOf: url),
                  let request = try? JSONDecoder().decode(Request.self, from: data),
                  abs(now.timeIntervalSince(request.at)) <= seconds
            else { return }
            take = request.take
        }
        return take
    }

    private func coordinate(_ url: URL, writing: Bool, _ body: (URL) -> Void) {
        let coordinator = NSFileCoordinator()
        var error: NSError?
        if writing {
            coordinator.coordinate(writingItemAt: url, options: .forMerging, error: &error, byAccessor: body)
        } else {
            coordinator.coordinate(readingItemAt: url, options: [], error: &error, byAccessor: body)
        }
    }
}
```

In `ios/Keyboard/KeyboardViewController.swift`, in `refresh()`, under `case .offerInsertLast:`, after `pad.insertLast.isHidden = false`, add:

```swift
            if let take = entry?.take { mailbox.offer(take) }
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `MailboxTests` passes, and the app total is 214.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/Shared/Mailbox.swift ios/Keyboard/KeyboardViewController.swift ios/AppTests/MailboxTests.swift
git commit -m "IOS-014: the keyboard notes in the mailbox whether it typed a take or offered it as Insert last"
```

### Task 2: The activity log

**Files:** Create `ios/App/Diagnostics/ActivityLog.swift`. Test `ios/AppTests/ActivityLogTests.swift`.

**Interfaces:**
- Consumes `MailboxEntry.typed` (Task 1).
- Produces `KeyboardOutcome`, and `ActivityEvent` with:
  - cases `captured`, `heardNothing`, `words`, `failed`, `micOff`, `micFailed`, `keyboard`;
  - `line`, `short(_:)`, and `code(_:)`.
- Produces `ActivityLog(file:)` with:
  - `.standard`, `budget`, and `older`;
  - `write(_:at:)`, `recent(_:)`, `noteKeyboard(_:at:)`, and `clear()`.
- Produces the test helper `scratchLog()`.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// A log in its own scratch folder.
func scratchLog() -> ActivityLog {
    ActivityLog(file: FileManager.default.temporaryDirectory.appending(path: "activity-\(UUID().uuidString)", directoryHint: .isDirectory).appending(path: "activity.log"))
}

@Suite struct ActivityLogTests {
    let log = scratchLog()
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    /// Each event is one line with its time, in the order written.
    @Test func eachEventIsOneLine() {
        log.write(.captured(durationMs: 4200, peak: 0.31, voicedMs: 3100), at: at)
        log.write(.words(count: 12, retried: false), at: at)
        log.write(.heardNothing(durationMs: 2000, peak: 0.0004, voicedMs: 0, sent: false), at: at)
        log.write(.micOff, at: at)
        #expect(log.recent() == [
            "2026-09-21T14:13:20Z take captured ms=4200 peak=0.310 voicedMs=3100",
            "2026-09-21T14:13:20Z take words count=12",
            "2026-09-21T14:13:20Z take heard-nothing sent=false ms=2000 peak=0.000 voicedMs=0",
            "2026-09-21T14:13:20Z take mic-off"
        ])
    }

    /// A failure names its kind and its status or error number, never the
    /// rest of what it carried.
    @Test func aFailureNamesItsKindAndNumberOnly() {
        let cases: [(TakeFailure, String)] = [
            (TakeFailure(kind: "auth", detail: "http 401"), "take failed kind=auth status=401 saved=true"),
            (TakeFailure(kind: "network", detail: "url error -1009"), "take failed kind=network urlError=-1009 saved=true"),
            (TakeFailure(kind: "timeout", detail: "no response in 30 s"), "take failed kind=timeout saved=true"),
            (TakeFailure(kind: "made up", detail: "Invalid API Key gsk_secret 12"), "take failed kind=other saved=true")
        ]
        for (failure, line) in cases {
            #expect(ActivityEvent.failed(failure, saved: true, retried: false).line == line)
        }
        #expect(ActivityEvent.failed(.noKey, saved: false, retried: true).line == "take failed kind=auth saved=false retried")
    }

    /// Past its budget the log rolls over once, keeping the newest lines.
    @Test func theLogRollsOverOnce() throws {
        for count in 0..<3000 { log.write(.words(count: count, retried: false), at: at) }
        let size = try #require(try FileManager.default.attributesOfItem(atPath: log.file.path)[.size] as? Int)
        #expect(size <= ActivityLog.budget)
        #expect(FileManager.default.fileExists(atPath: log.older.path))
        let recent = log.recent()
        #expect(recent.count == 200)
        #expect(recent.last?.hasSuffix("take words count=2999") == true)
    }

    /// The log stays out of iCloud backups.
    @Test func theLogStaysOutOfBackups() throws {
        log.write(.micFailed, at: at)
        let folder = log.file.deletingLastPathComponent()
        #expect(try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        #expect(ActivityLog.standard.file.path.contains("/Library/Application Support/logs/"))
    }

    /// What the keyboard did with a take is noted once: offered as Insert
    /// last, then typed when it was.
    @Test func theKeyboardsOutcomeIsNotedOnce() {
        let take = UUID(uuidString: "0A1B2C3D-0000-0000-0000-000000000000")!
        var entry = MailboxEntry(take: take, phase: .ready, words: "Send it.", at: at, typed: .offered)
        log.noteKeyboard(entry, at: at)
        log.noteKeyboard(entry, at: at)
        entry.typed = .inserted
        entry.words = nil
        log.noteKeyboard(entry, at: at)
        log.noteKeyboard(entry, at: at)
        log.noteKeyboard(MailboxEntry(take: UUID(), phase: .ready, words: "Waiting.", at: at), at: at)
        log.noteKeyboard(MailboxEntry(take: UUID(), phase: .failed, words: nil, at: at, typed: .inserted), at: at)
        log.noteKeyboard(nil, at: at)
        #expect(log.recent() == [
            "2026-09-21T14:13:20Z keyboard take=0a1b2c3d insert-last",
            "2026-09-21T14:13:20Z keyboard take=0a1b2c3d inserted"
        ])
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find 'ActivityLog' in scope`.

- [ ] **Step 3: Write the log**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The activity log (ios/prd.json IOS-014): one short line for what
// happened to each take, kept in the app's own container for the
// diagnostics report. Lines are built only from the events below, which
// carry kinds, numbers, and short take ids, so nothing you said and no key
// can reach a line. Small and capped: past its budget the file rolls over
// once, and writing it never stops a take.
import Foundation
import MurmurCore

/// What the keyboard did with a take's words.
enum KeyboardOutcome: String, Sendable {
    /// Typed into the field.
    case inserted
    /// The field was gone, so they waited as Insert last.
    case insertLast = "insert-last"
}

/// Something worth a line. Every case carries only numbers, flags, and
/// fixed names.
enum ActivityEvent: Equatable, Sendable {
    /// A take with speech in it went to the provider.
    case captured(durationMs: Int, peak: Double, voicedMs: Int)
    /// Nothing to type: the gate heard no speech (not sent), or the
    /// provider and cleanup left nothing (sent).
    case heardNothing(durationMs: Int, peak: Double, voicedMs: Int, sent: Bool)
    /// The take came back as this many words.
    case words(count: Int, retried: Bool)
    /// Transcription failed; the audio waits for a retry when saved.
    case failed(TakeFailure, saved: Bool, retried: Bool)
    case micOff
    case micFailed
    /// What the keyboard did with a keyboard take's words.
    case keyboard(UUID, KeyboardOutcome)

    /// The failure kinds a line may name; any other is other.
    static let kinds: Set<String> = ["auth", "badrequest", "server", "network", "timeout", "nospeech"]

    var line: String {
        switch self {
        case .captured(let durationMs, let peak, let voicedMs):
            "take captured ms=\(durationMs) peak=\(Self.level(peak)) voicedMs=\(voicedMs)"
        case .heardNothing(let durationMs, let peak, let voicedMs, let sent):
            "take heard-nothing sent=\(sent) ms=\(durationMs) peak=\(Self.level(peak)) voicedMs=\(voicedMs)"
        case .words(let count, let retried):
            "take words count=\(count)\(retried ? " retried" : "")"
        case .failed(let failure, let saved, let retried):
            "take failed kind=\(Self.kinds.contains(failure.kind) ? failure.kind : "other")\(Self.code(failure.detail)) saved=\(saved)\(retried ? " retried" : "")"
        case .micOff:
            "take mic-off"
        case .micFailed:
            "take mic-failed"
        case .keyboard(let take, let outcome):
            "keyboard take=\(Self.short(take)) \(outcome.rawValue)"
        }
    }

    /// A level to three places.
    static func level(_ value: Double) -> String {
        String(format: "%.3f", min(max(value, 0), 1))
    }

    /// A take's first eight characters: enough to follow it, nothing more.
    static func short(_ take: UUID) -> String {
        String(take.uuidString.lowercased().prefix(8))
    }

    /// The status or error number in a failure's detail, and nothing else
    /// from it: " status=401", " urlError=-1009", or empty.
    static func code(_ detail: String) -> String {
        let parts = detail.split(separator: " ")
        guard let last = parts.last, let number = Int(last) else { return "" }
        if detail.hasPrefix("http ") { return " status=\(number)" }
        if detail.hasPrefix("url error ") { return " urlError=\(number)" }
        return ""
    }
}

struct ActivityLog: Sendable {
    /// About 600 lines; one older file is kept beside it.
    static let budget = 64 * 1024
    let file: URL

    static let standard = ActivityLog(file: URL.applicationSupportDirectory.appending(path: "logs", directoryHint: .isDirectory).appending(path: "activity.log"))

    /// The file the log rolled over to.
    var older: URL {
        file.deletingLastPathComponent().appending(path: file.deletingPathExtension().lastPathComponent + ".1.log")
    }

    /// Adds a line. Never throws: a log that cannot be written is skipped.
    func write(_ event: ActivityEvent, at date: Date = .now) {
        let line = Data("\(date.formatted(.iso8601)) \(event.line)\n".utf8)
        do {
            try prepare()
            let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
            if size + line.count > Self.budget {
                try? FileManager.default.removeItem(at: older)
                try FileManager.default.moveItem(at: file, to: older)
                try prepare()
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: line)
        } catch {
            // The log is for diagnostics; a take never waits on it.
        }
    }

    /// The newest lines, oldest first.
    func recent(_ count: Int = 200) -> [String] {
        let text = [older, file].compactMap { try? String(contentsOf: $0, encoding: .utf8) }.joined()
        return Array(text.split(separator: "\n").suffix(count).map(String.init))
    }

    /// Logs what the keyboard did with the take in the mailbox, once each:
    /// typed, or offered as Insert last (and typed later, if it was).
    func noteKeyboard(_ entry: MailboxEntry?, at date: Date = .now) {
        guard let entry, entry.phase == .ready, let typed = entry.typed else { return }
        let event = ActivityEvent.keyboard(entry.take, typed == .inserted ? .inserted : .insertLast)
        guard !recent(Self.budget).contains(where: { $0.hasSuffix(" " + event.line) }) else { return }
        write(event, at: date)
    }

    /// Clears both files.
    func clear() {
        try? FileManager.default.removeItem(at: file)
        try? FileManager.default.removeItem(at: older)
    }

    /// The folder (out of backups) and the file (writable after first
    /// unlock, as a take may land with the phone locked).
    private func prepare() throws {
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = folder
        try url.setResourceValues(values)
        if !FileManager.default.fileExists(atPath: file.path) {
            try Data().write(to: file, options: .completeFileProtectionUntilFirstUserAuthentication)
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `ActivityLogTests` passes (5 tests), and the app total is 219.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Diagnostics/ActivityLog.swift ios/AppTests/ActivityLogTests.swift
git commit -m "IOS-014: a small activity log of what happened to each take, built only from kinds and numbers"
```

### Task 3: Takes and the keyboard bridge write to the log

**Files:**
- Modify: `ios/App/Takes/TakeModel.swift`, `ios/App/Takes/TakeScreen.swift`, `ios/App/Keyboard/KeyboardBridge.swift`.
- Test: `ios/AppTests/TakeModelTests.swift`, `ios/AppTests/KeyboardBridgeTests.swift`.

**Interfaces:**
- Consumes `ActivityEvent` and `ActivityLog` (Task 2).
- Produces the `TakeModel.init` parameter `note: @MainActor (ActivityEvent) -> Void = { _ in }`, after `record`.
- Produces the `KeyboardBridge.init` parameter `log: ActivityLog? = nil`, before `announce`.

- [ ] **Step 1: Write the failing tests**

In `ios/AppTests/TakeModelTests.swift`, replace the `Sink` class and its doc comment with:

```swift
    /// What a take copied, what it kept in history, what it noted, and the
    /// time it reads.
    @MainActor final class Sink {
        var copied: [String] = []
        var kept: [HistoryEntry] = []
        var noted: [ActivityEvent] = []
        var now = Date(timeIntervalSince1970: 1_790_000_000)
    }
```

In the same file, in `model(send:)`, replace `record: { [sink] entry in sink.kept.append(entry) }` with:

```swift
            record: { [sink] entry in sink.kept.append(entry) },
            note: { [sink] event in sink.noted.append(event) }
```

Then, before `silenceIsNeverSent`, add:

```swift
    /// Each take notes what happened to it (IOS-014): captured with its
    /// level, then its words as a count; silence with its level; a failure
    /// with its kind; the microphone being off.
    @Test func eachTakeNotesWhatHappened() async throws {
        let provider = FakeProvider.says("Send the invoice tomorrow.")
        let model = model(provider)
        await take(model)
        #expect(sink.noted.count == 2)
        guard case .captured(let ms, let peak, let voiced) = sink.noted.first else { throw TakeModelTestsError.unexpected }
        #expect(ms == 2000)
        #expect(peak > 0.1 && voiced > 0)
        #expect(sink.noted.last == .words(count: 4, retried: false))
        microphone.samples = ScriptedMicrophone.silence
        await take(model)
        guard case .heardNothing(_, let quiet, 0, false) = sink.noted.last else { throw TakeModelTestsError.unexpected }
        #expect(quiet == 0)
        microphone.samples = ScriptedMicrophone.tone
        provider.answer([(401, "{}")])
        await take(model)
        #expect(sink.noted.last == .failed(TakeFailure(kind: "auth", detail: "http 401"), saved: true, retried: false))
        provider.answer([(200, #"{"text":"Kept."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(sink.noted.last == .words(count: 1, retried: true))
        microphone.allowed = false
        await model.start()
        #expect(sink.noted.last == .micOff)
    }

    enum TakeModelTestsError: Error { case unexpected }
```

In `ios/AppTests/KeyboardBridgeTests.swift`, before `aDictateScreenTakeStaysInTheApp`, add:

```swift
    /// What the keyboard did with a take is logged when the next keyboard
    /// take begins (IOS-014).
    @Test func theLastKeyboardTakeIsNotedWhenTheNextBegins() async throws {
        let log = scratchLog()
        let model = try model(.says("Send the invoice tomorrow."))
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, log: log) { _ in }
        bridge.listen()
        let first = start(bridge)
        try await waitUntilRecording(model)
        bridge.hear(.stop)
        _ = try await waitFor(.ready)
        #expect(mailbox.claim(first) == "Send the invoice tomorrow.")
        #expect(log.recent().isEmpty)
        start(bridge)
        _ = try await waitFor(.listening)
        #expect(log.recent().map { $0.split(separator: " ", maxSplits: 1).last.map(String.init) } == ["keyboard take=\(ActivityEvent.short(first)) inserted"])
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails, with `extra argument 'note' in call` and `extra argument 'log' in call` among the errors.

- [ ] **Step 3: Note each take, and the keyboard's last take**

`ios/App/Takes/TakeModel.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// One take in the app (ios/prd.json IOS-006): record, keep silence from
// typing, send one WAV to the chosen provider, clean up the words
// (IOS-007), and show them, Heard nothing, or why it failed. A failed
// take waits with its audio for a retry, as on desktop (src/main/retry.ts):
// one thing runs at a time, and a take's audio goes only once its words
// are safe.
import Foundation
import MurmurCore

/// The shared rules a take runs on, read once from the app bundle.
struct TakeRules: Sendable {
    let gate: SpeechGateSpec
    let hallucinations: HallucinationList
    let format: FormatSpec
    let polish: PolishRules

    var cleanup: CleanupRules { CleanupRules(format: format, polish: polish, hallucinations: hallucinations) }
}

@Observable @MainActor final class TakeModel {
    enum State: Equatable {
        case idle
        case recording(since: Date)
        case transcribing
        case words(String)
        /// sent is false when the gate stopped it before upload.
        case heardNothing(sent: Bool)
        /// saved is false when even the audio could not be kept.
        case failed(TakeFailure, saved: Bool)
        case micOff
        case micFailed
    }

    /// Two taps closer together than this are one double tap.
    static let doubleTap: TimeInterval = 0.5

    private(set) var state: State = .idle
    private(set) var waiting: [WaitingTake] = []
    /// The waiting takes a retry is running through, or empty.
    private(set) var retrying: [String] = []
    /// The waiting take whose Discard now asks delete audio?
    private(set) var armed: String?
    private(set) var message: String?

    @ObservationIgnored private var starting = false
    @ObservationIgnored private var armedAt = Date.distantPast
    @ObservationIgnored private let microphone: any Microphone
    @ObservationIgnored private let store: WaitingStore
    @ObservationIgnored private let rules: TakeRules
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let connections: ConnectionStore
    @ObservationIgnored private let cleanup: CleanupStore
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send
    @ObservationIgnored private let copy: @MainActor (String) -> Void
    @ObservationIgnored private let now: @MainActor () -> Date
    /// Holds background time; the closure it returns lets it go.
    @ObservationIgnored private let keepAlive: @MainActor () -> @MainActor () -> Void
    /// Keeps a take that came back as words in history (IOS-012).
    @ObservationIgnored private let record: @MainActor (HistoryEntry) -> Void
    /// Notes what happened to each take in the activity log (IOS-014).
    @ObservationIgnored private let note: @MainActor (ActivityEvent) -> Void

    init(
        microphone: any Microphone, store: WaitingStore, rules: TakeRules, catalog: ProviderCatalog,
        connections: ConnectionStore, cleanup: CleanupStore, ring: any KeyRing, send: @escaping ConnectionTest.Send,
        copy: @escaping @MainActor (String) -> Void, now: @escaping @MainActor () -> Date = { .now },
        keepAlive: @escaping @MainActor () -> @MainActor () -> Void = { {} },
        record: @escaping @MainActor (HistoryEntry) -> Void = { _ in },
        note: @escaping @MainActor (ActivityEvent) -> Void = { _ in }
    ) {
        self.microphone = microphone
        self.store = store
        self.rules = rules
        self.catalog = catalog
        self.connections = connections
        self.cleanup = cleanup
        self.ring = ring
        self.send = send
        self.copy = copy
        self.now = now
        self.keepAlive = keepAlive
        self.record = record
        self.note = note
        waiting = store.list()
    }

    var isRecording: Bool {
        state.isRecording
    }

    /// How loud the take is right now, 0 to 1, for the live waveform.
    var level: Float {
        microphone.level
    }

    /// Transcribing or retrying: one thing at a time.
    var isBusy: Bool {
        state == .transcribing || !retrying.isEmpty
    }

    func toggle() async {
        if isRecording { await stop() } else { await start() }
    }

    func start() async {
        guard !starting, !isRecording, !isBusy else { return }
        starting = true
        defer { starting = false }
        message = nil
        armed = nil
        guard await microphone.allow() else {
            state = .micOff
            note(.micOff)
            return
        }
        do {
            try microphone.start()
            state = .recording(since: now())
        } catch {
            state = .micFailed
            note(.micFailed)
        }
    }

    func stop() async {
        guard case .recording(let since) = state else { return }
        // Asked before the microphone lets go: when a session has just ended,
        // the microphone was all that kept murmur running in the background.
        let release = keepAlive()
        defer { release() }
        let samples = microphone.stop()
        let length = Int(now().timeIntervalSince(since) * 1000)
        let peak = SpeechGate.peakLevel(samples)
        let voiced = Int(SpeechGate.voicedMs(samples, sampleRate: Wav.targetSampleRate, spec: rules.gate))
        guard let wav = TakeAudio.upload(samples, gate: rules.gate) else {
            state = .heardNothing(sent: false)
            note(.heardNothing(durationMs: length, peak: peak, voicedMs: voiced, sent: false))
            return
        }
        note(.captured(durationMs: length, peak: peak, voicedMs: voiced))
        state = .transcribing
        switch await words(for: wav) {
        case .success(let words):
            state = words.map(State.words) ?? .heardNothing(sent: true)
            if let words {
                let entry = HistoryEntry(at: since, durationMs: length, words: words)
                record(entry)
                note(.words(count: entry.wordCount, retried: false))
            } else {
                note(.heardNothing(durationMs: length, peak: peak, voicedMs: voiced, sent: true))
            }
        case .failure(let failure):
            let saved = (try? store.save(wav, startedAt: since, failure: failure, now: now())) != nil
            waiting = store.list()
            state = .failed(failure, saved: saved)
            note(.failed(failure, saved: saved, retried: false))
        }
    }

    /// Takes words you deleted in murmur off the Dictate screen (IOS-012):
    /// the ones given, or any with nil.
    func forget(_ words: Set<String>?) {
        guard case .words(let shown) = state else { return }
        if let words, !words.contains(where: { shown.contains($0) }) { return }
        state = .idle
    }

    /// Leaving the screen mid-take drops the take: nothing is kept or sent.
    func cancel() {
        guard isRecording else { return }
        _ = microphone.stop()
        state = .idle
    }

    /// Runs the waiting takes one at a time through today's provider, in
    /// the order they were spoken (ids sort by time). Their words show
    /// here and go to the clipboard, so a retried take is safe before its
    /// audio is deleted.
    func retry(_ ids: [String]) async {
        guard !ids.isEmpty, !isRecording, !isBusy else { return }
        let release = keepAlive()
        defer { release() }
        retrying = ids
        message = nil
        armed = nil
        defer { retrying = [] }
        var delivered: [String] = []
        var failed = 0
        for id in ids.sorted() {
            guard let audio = try? store.audio(id) else { continue }
            let spoken = store.take(id)?.startedAt ?? now()
            switch await words(for: audio) {
            case .success(.some(let words)):
                delivered.append(words)
                let entry = HistoryEntry(at: spoken, durationMs: Wav.durationMs(audio), words: words, retried: true)
                record(entry)
                note(.words(count: entry.wordCount, retried: true))
                copy(delivered.joined(separator: "\n\n"))
                try? store.remove(id)
            case .success(.none):
                try? store.markFailed(id, .noSpeech)
                note(.failed(.noSpeech, saved: true, retried: true))
                failed += 1
            case .failure(let failure):
                try? store.markFailed(id, failure)
                note(.failed(failure, saved: true, retried: true))
                failed += 1
            }
            waiting = store.list()
        }
        if !delivered.isEmpty { state = .words(delivered.joined(separator: "\n\n")) }
        message = TakeCopy.retried(delivered: delivered.count, failed: failed)
    }

    /// The first tap asks delete audio?, and a later tap deletes. The
    /// second tap of a quick double tap is ignored.
    func discard(_ id: String) {
        guard !isBusy else { return }
        guard armed == id else {
            armed = id
            armedAt = now()
            message = nil
            return
        }
        guard now().timeIntervalSince(armedAt) >= Self.doubleTap else { return }
        armed = nil
        do {
            try store.remove(id)
        } catch {
            message = "murmur could not delete that recording. Try again."
        }
        waiting = store.list()
    }

    /// The cleaned-up words; nil when the provider heard only silence or
    /// cleanup left nothing (a take of only um); or why it failed.
    private func words(for wav: Data) async -> Result<String?, TakeFailure> {
        let settings = connections.load(catalog: catalog)
        let baseUrl = settings.transcription.baseUrl
        guard let key = (try? ring.key(for: baseUrl)) ?? nil else { return .failure(.noKey) }
        // The dictionary's spellings go to transcription as a hint, and to
        // polish (IOS-013).
        let cleanupSettings = cleanup.load()
        let hint = transcriptionHint(cleanupSettings.dictionary)
        switch await Transcription.run(wav: wav, baseUrl: baseUrl, model: settings.transcription.sttModel, key: key, prompt: hint, send: send) {
        case .words(let text):
            guard let heard = TakeAudio.heard(text, list: rules.hallucinations) else { return .success(nil) }
            let connection = settings.polishConnection { [ring] in (try? ring.key(for: $0)) ?? nil }
            let finished = await Cleanup.finish(heard, settings: cleanupSettings, rules: rules.cleanup, connection: connection, send: send)
            return .success(finished.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : finished)
        case .failed(let kind, let detail):
            return .failure(TakeFailure(kind: kind.rawValue, detail: detail))
        }
    }
}

extension TakeModel.State {
    var isRecording: Bool {
        if case .recording = self { true } else { false }
    }

    /// Something to show under the button: words, Heard nothing, or a failure.
    var hasResult: Bool {
        switch self {
        case .idle, .recording, .transcribing: false
        default: true
        }
    }
}
```

`ios/App/Keyboard/KeyboardBridge.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the keyboard (ios/prd.json IOS-008): it hears the
// keyboard's start, stop, and cancel, runs the take on the app's one take
// model under the id the keyboard asked with, and tells the keyboard how
// it goes through the mailbox. Only a take the keyboard started goes to
// the mailbox, so a take made on the Dictate screen never turns up in
// another app. While a keyboard take records, its loudness goes to the
// level file for the keyboard's pill (IOS-010).
import Foundation
import Observation

@MainActor final class KeyboardBridge {
    /// How long a keyboard's ask stays good. One that waited longer, sent
    /// while murmur was not running, is dropped.
    static let askLife: TimeInterval = 3
    /// How long a keyboard's ask stays good for a take link: opening murmur
    /// from cold can take a while.
    static let linkLife: TimeInterval = 60
    /// The longest a keyboard take may record. One nobody stopped (you
    /// walked away from it) ends here and is dropped, never sent.
    static let takeLimit: TimeInterval = 10 * 60

    private let model: TakeModel
    private let mailbox: Mailbox
    private let announce: @MainActor (Signal) -> Void
    private let limit: TimeInterval
    private let levels: LevelFile
    /// Where what the keyboard did with each take is noted (IOS-014).
    private let log: ActivityLog?
    private var listener: SignalListener?
    /// The take the keyboard asked for, until it ends.
    private var take: UUID?
    /// A cancel heard while the take was still starting.
    private var cancelled = false
    private var startedAt = Date.distantPast

    init(
        model: TakeModel, mailbox: Mailbox, limit: TimeInterval = KeyboardBridge.takeLimit, levels: LevelFile = .shared,
        log: ActivityLog? = nil, announce: @escaping @MainActor (Signal) -> Void = { $0.post() }
    ) {
        self.model = model
        self.mailbox = mailbox
        self.limit = limit
        self.levels = levels
        self.log = log
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
            guard let id = mailbox.answer(within: Self.askLife) else { return }
            begin(id)
        case .stop:
            guard take != nil, model.isRecording else { return }
            Task { await model.stop() }
        case .cancel:
            guard take != nil else { return }
            if model.isRecording { model.cancel() } else { cancelled = true }
        case .changed, .busy, .end:
            break
        }
    }

    /// The keyboard opened murmur with a take link (IOS-009). True when the
    /// take began, so murmur shows Recording only for a take that is there.
    /// Only the keyboard's own ask, left in the mailbox before it opened
    /// murmur, lets a link start a take: a link from anywhere else starts
    /// nothing. The ask is used up here, so it never starts a second take.
    @discardableResult
    func opened(_ id: UUID) -> Bool {
        let asked = mailbox.answer(within: Self.linkLife)
        // A start murmur answered late and the link for the same take are one
        // take, and a cancel heard on the way does not drop it.
        if take == id {
            cancelled = false
            return true
        }
        guard asked == id else { return false }
        return begin(id)
    }

    @discardableResult
    private func begin(_ id: UUID) -> Bool {
        guard take == nil, !model.isRecording, !model.isBusy else {
            announce(.busy)
            return false
        }
        // The last take's entry is about to go: note what the keyboard did
        // with its words first.
        log?.noteKeyboard(mailbox.read())
        take = id
        startedAt = .now
        cancelled = false
        // Written here, not read from the model, whose state may still
        // be the last take's words.
        write(.listening)
        Task { await settle(id) }
        return true
    }

    /// Settles how the start went. A start that did not record ends failed
    /// here: the model's state may not change at all (denied twice), and
    /// following it alone would leave the take open forever.
    private func settle(_ id: UUID) async {
        await model.start()
        guard take == id else { return }
        if cancelled {
            model.cancel()
            write(.nothing, ends: true)
        } else if !model.isRecording {
            write(.failed, ends: true)
        } else {
            Task { await limit(id) }
            Task { await stream(id) }
        }
    }

    /// Writes the take's loudness for the keyboard's pill about 30 times a
    /// second while it records, then silence.
    private func stream(_ id: UUID) async {
        var count: UInt32 = 0
        while take == id, model.isRecording {
            count &+= 1
            levels.write(model.level, count: count)
            try? await Task.sleep(for: .milliseconds(33))
        }
        levels.write(0, count: count &+ 1)
    }

    /// Ends a take still recording at the limit, dropping what it heard.
    private func limit(_ id: UUID) async {
        try? await Task.sleep(for: .seconds(limit))
        guard take == id, model.isRecording else { return }
        model.cancel()
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
        announce(.changed)
        if ends { self.take = nil }
    }
}

extension KeyboardBridge {
    private static var shared: KeyboardBridge?

    /// The one bridge for the app's life, on the app's take model, started
    /// by whichever comes first: the app's first screen or a take link.
    static func live() -> KeyboardBridge? {
        if let shared { return shared }
        guard let model = TakeModel.live(), let mailbox = Mailbox.shared else { return nil }
        let bridge = KeyboardBridge(model: model, mailbox: mailbox, log: .standard)
        bridge.listen()
        shared = bridge
        return bridge
    }
}
```

In `ios/App/Takes/TakeScreen.swift`, in `TakeModel.live()`, replace `record: { History.live().add($0) }` with:

```swift
            record: { History.live().add($0) },
            note: { ActivityLog.standard.write($0) }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `TakeModelTests` and `KeyboardBridgeTests` pass, and the app total is 221.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Takes/TakeModel.swift ios/App/Takes/TakeScreen.swift ios/App/Keyboard/KeyboardBridge.swift ios/AppTests/TakeModelTests.swift ios/AppTests/KeyboardBridgeTests.swift
git commit -m "IOS-014: each take notes what happened to it, and the bridge notes what the keyboard did with the last one"
```

### Task 4: The report

**Files:** Create `ios/App/Diagnostics/DiagnosticsReport.swift`. Test `ios/AppTests/DiagnosticsTests.swift`.

**Interfaces:**
- Consumes `ActivityLog` (Task 2) and `TakeModel(...note:)` (Task 3).
- Produces `DiagnosticsFacts`.
- Produces `DiagnosticsReport`, with:
  - `text(_:)`, `fileName(_:)`, `name(_:in:)`, and `model()`;
  - `facts(catalog:connections:cleanup:ring:log:waiting:history:defaults:keyboard:session:mailbox:pill:now:)`, where every source after `catalog` has the live default.

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct DiagnosticsReportTests {
    let groq = "https://api.groq.com/openai/v1"
    let catalog: ProviderCatalog
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let log = scratchLog()
    let waiting = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "report-takes-\(UUID().uuidString)", directoryHint: .isDirectory))
    let history = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "report-history-\(UUID().uuidString).jsonl"))
    let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "report-mailbox-\(UUID().uuidString).json"))
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    init() throws {
        catalog = try BundledRules.catalog()
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func facts(keyboard: KeyboardReport? = nil, session: SessionState = .off) -> DiagnosticsFacts {
        DiagnosticsReport.facts(
            catalog: catalog, connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            log: log, waiting: waiting, history: history, defaults: defaults, keyboard: keyboard, session: session,
            mailbox: mailbox, pill: PillLook(style: .bars), now: at
        )
    }

    /// The report says what the app is, what the phone is, how the keyboard
    /// and session stand, settings as names and counts, and the recent log.
    @Test func theReportSaysWhatHelps() throws {
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        var settings = CleanupStore(defaults: defaults).load()
        settings.dictionary = [DictionaryEntry(from: "la broy", to: "LaBroi"), DictionaryEntry(from: "eze", to: "Eze")]
        settings.expansions = [ExpansionEntry(trigger: "my address", text: "1 Main Street")]
        CleanupStore(defaults: defaults).save(settings)
        defaults.set(60, forKey: Session.lengthKey)
        log.write(.words(count: 3, retried: false), at: at)
        let text = DiagnosticsReport.text(facts(keyboard: KeyboardReport(fullAccess: true, at: at), session: SessionState(until: at.addingTimeInterval(60))))
        for line in [
            "murmur diagnostics report", "generated: 2026-09-21T14:13:20Z", "version: ", "system: iOS ", "device: ",
            "keyboard: reported with Full Access, last 2026-09-21T14:13:20Z", "session: 60 minutes, running",
            "transcription: Groq, model whisper-large-v3-turbo", "keySaved: yes", "dictionaryEntries: 2", "expansionEntries: 1",
            "waitingTakes: 0", "historyTakes: 0", "pill: bars", "2026-09-21T14:13:20Z take words count=3"
        ] {
            #expect(text.contains(line), "missing \(line)")
        }
        #expect(!text.contains("LaBroi") && !text.contains("la broy") && !text.contains("Main Street") && !text.contains("gsk_"))
    }

    /// A custom address is never written, only that it is custom.
    @Test func aCustomAddressIsNeverWritten() {
        var connection = ConnectionStore(defaults: defaults).load(catalog: catalog)
        connection.transcription.baseUrl = "https://speech.private.example.com/v1"
        ConnectionStore(defaults: defaults).save(connection)
        let text = DiagnosticsReport.text(facts())
        #expect(text.contains("transcription: custom, model "))
        #expect(!text.contains("private.example.com"))
        #expect(text.contains("keySaved: no"))
        #expect(text.contains("keyboard: no report yet"))
        #expect(text.contains("session: 15 minutes, off"))
        #expect(text.contains("(nothing yet)"))
    }

    /// The report notes the keyboard's last take first, so it is included.
    @Test func theKeyboardsLastTakeIsIncluded() {
        mailbox.write(MailboxEntry(take: UUID(), phase: .ready, words: nil, at: at, typed: .inserted))
        #expect(DiagnosticsReport.text(facts()).contains(" inserted"))
    }
}

/// Canaries: a word and a key that run through real takes and must never
/// reach a log line or the report.
@MainActor @Suite struct DiagnosticsCanaryTests {
    let groq = "https://api.groq.com/openai/v1"
    let canaryWord = "Quokkaberry"
    let canaryKey = "gsk_canarycanary9876"

    @Test func neitherCanaryReachesTheLogOrTheReport() async throws {
        let catalog = try BundledRules.catalog()
        let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        let ring = MemoryKeyRing()
        try ring.save(try #require(APIKey(canaryKey)), for: groq)
        var settings = CleanupSettings(polish: false)
        settings.dictionary = [DictionaryEntry(from: "quokka berry", to: canaryWord)]
        settings.expansions = [ExpansionEntry(trigger: "my fruit", text: canaryWord + " jam")]
        CleanupStore(defaults: defaults).save(settings)
        let log = scratchLog()
        let waiting = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "canary-takes-\(UUID().uuidString)", directoryHint: .isDirectory))
        let history = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "canary-history-\(UUID().uuidString).jsonl"))
        let mailbox = Mailbox(file: FileManager.default.temporaryDirectory.appending(path: "canary-mailbox-\(UUID().uuidString).json"))
        // The provider hears the word, then refuses the key and says the key
        // back, as some providers do.
        let provider = FakeProvider([
            (200, #"{"text":"quokka berry and my fruit"}"#),
            (401, #"{"error":{"message":"Invalid API Key \#(canaryKey) for \#(canaryWord)"}}"#)
        ])
        let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
        let model = TakeModel(
            microphone: microphone, store: waiting, rules: try BundledRules.takeRules(), catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: provider.send, copy: { _ in },
            record: { try? history.append($0) },
            note: { log.write($0) }
        )
        await model.start()
        await model.stop()
        // The canary really ran through the take.
        #expect(history.list().first?.words.contains(canaryWord) == true)
        await model.start()
        await model.stop()
        #expect(model.waiting.count == 1)
        mailbox.write(MailboxEntry(take: UUID(), phase: .ready, words: canaryWord, at: .now, typed: .offered))
        let report = DiagnosticsReport.text(DiagnosticsReport.facts(
            catalog: catalog, connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            log: log, waiting: waiting, history: history, defaults: defaults, keyboard: nil, session: .off, mailbox: mailbox,
            pill: PillLook(style: .bars)
        ))
        let logged = [log.file, log.older].compactMap { try? String(contentsOf: $0, encoding: .utf8) }.joined()
        #expect(logged.contains("take words count=4"))
        #expect(logged.contains("take failed kind=auth status=401 saved=true"))
        #expect(logged.contains(" insert-last"))
        for text in [logged, report] {
            for canary in [canaryWord, canaryKey, "quokka", "canary", "gsk_"] {
                #expect(!text.localizedCaseInsensitiveContains(canary), "\(canary) leaked")
            }
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find 'DiagnosticsReport' in scope`.

- [ ] **Step 3: Write the report**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// The diagnostics report (ios/prd.json IOS-014): one plain text file you
// read before you send it, like desktop's (src/main/diagnostics.ts). It
// holds the app and the phone, whether the keyboard has reported with Full
// Access, the session length, settings as names and counts, and the recent
// activity log. Never words, never dictionary or expansion text, never a
// key. Nothing is sent by itself: the report goes only where you share it.
import Foundation
import MurmurCore
import UIKit

/// Everything the report says, gathered first so the text is a plain
/// function of it.
struct DiagnosticsFacts: Sendable {
    var generated: Date
    var appVersion: String
    var build: String
    var system: String
    var device: String
    /// The keyboard's own report: it writes one only with Full Access.
    var keyboard: KeyboardReport?
    /// You said in first run that you added the keyboard.
    var keyboardAdded: Bool
    var sessionMinutes: Int
    var sessionOn: Bool
    /// A preset's name, or custom: a custom address is never written.
    var provider: String
    var sttModel: String
    var cleanupProvider: String
    var cleanupModel: String
    var keySaved: Bool
    var level: String
    var numbers: String
    var smartLists: Bool
    var polish: Bool
    var dictionaryEntries: Int
    var expansionEntries: Int
    var waitingTakes: Int
    var historyTakes: Int
    var pillStyle: String
    var log: [String]
}

enum DiagnosticsReport {
    /// The report's last lines of the activity log.
    static let logLines = 200

    static func text(_ facts: DiagnosticsFacts) -> String {
        let keyboard = facts.keyboard.map { "reported with Full Access, last \($0.at.formatted(.iso8601))" }
            ?? "no report yet (it reports only with Full Access on; added in first run: \(facts.keyboardAdded ? "yes" : "not said"))"
        let lines = [
            "murmur diagnostics report",
            "generated: \(facts.generated.formatted(.iso8601))",
            "version: \(facts.appVersion) (\(facts.build))",
            "system: \(facts.system)",
            "device: \(facts.device)",
            "",
            "keyboard: \(keyboard)",
            "session: \(facts.sessionMinutes) minutes, \(facts.sessionOn ? "running" : "off")",
            "",
            "transcription: \(facts.provider), model \(facts.sttModel)",
            "cleanup: \(facts.cleanupProvider), model \(facts.cleanupModel)",
            "keySaved: \(facts.keySaved ? "yes" : "no")",
            "formatting: level=\(facts.level) numbers=\(facts.numbers) smartLists=\(facts.smartLists) polish=\(facts.polish)",
            "dictionaryEntries: \(facts.dictionaryEntries)",
            "expansionEntries: \(facts.expansionEntries)",
            "waitingTakes: \(facts.waitingTakes)",
            "historyTakes: \(facts.historyTakes)",
            "pill: \(facts.pillStyle)",
            "",
            "recent activity (\(logLines) lines at most, oldest first):"
        ] + (facts.log.isEmpty ? ["(nothing yet)"] : facts.log)
        return lines.joined(separator: "\n") + "\n"
    }

    static func fileName(_ date: Date) -> String {
        "murmur-diagnostics-\(date.formatted(.iso8601.year().month().day())).txt"
    }

    /// A preset's name for an address, or custom.
    static func name(_ baseUrl: String, in catalog: ProviderCatalog) -> String {
        catalog.preset(forBaseUrl: baseUrl)?.name ?? "custom"
    }

    /// The facts as they are on this phone now. The keyboard's last take is
    /// noted in the log first, so the report includes it.
    @MainActor static func facts(
        catalog: ProviderCatalog, connections: ConnectionStore = ConnectionStore(), cleanup: CleanupStore = CleanupStore(),
        ring: any KeyRing = KeychainKeyRing(), log: ActivityLog = .standard, waiting: WaitingStore = .standard,
        history: HistoryStore = .standard, defaults: UserDefaults = .standard, keyboard: KeyboardReport? = KeyboardReport.read(),
        session: SessionState = SessionState.read(), mailbox: Mailbox? = Mailbox.shared, pill: PillLook = PillLook.read(), now: Date = .now
    ) -> DiagnosticsFacts {
        log.noteKeyboard(mailbox?.read(), at: now)
        let connection = connections.load(catalog: catalog)
        let settings = cleanup.load()
        let info = Bundle.main.infoDictionary ?? [:]
        let minutes = defaults.integer(forKey: Session.lengthKey)
        return DiagnosticsFacts(
            generated: now,
            appVersion: info["CFBundleShortVersionString"] as? String ?? "unknown",
            build: info["CFBundleVersion"] as? String ?? "unknown",
            system: "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            device: model(),
            keyboard: keyboard?.fullAccess == true ? keyboard : nil,
            keyboardAdded: defaults.bool(forKey: Setup.keyboardKey),
            sessionMinutes: Session.Length(rawValue: minutes)?.rawValue ?? Session.Length.fifteen.rawValue,
            sessionOn: session.isOn(at: now),
            provider: name(connection.transcription.baseUrl, in: catalog),
            sttModel: connection.transcription.sttModel,
            cleanupProvider: name(connection.cleanupBaseUrl, in: catalog),
            cleanupModel: connection.cleanupModel,
            keySaved: ((try? ring.key(for: connection.transcription.baseUrl)) ?? nil) != nil,
            level: settings.level.rawValue,
            numbers: settings.numbers.rawValue,
            smartLists: settings.smartLists,
            polish: settings.polish,
            dictionaryEntries: settings.dictionary.count,
            expansionEntries: settings.expansions.count,
            waitingTakes: waiting.list().count,
            historyTakes: history.list().count,
            pillStyle: pill.style.rawValue,
            log: log.recent(logLines)
        )
    }

    /// The phone's model identifier, such as iPhone17,1 (in the simulator,
    /// the model it simulates).
    static func model() -> String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { bytes in
            String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
        }
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `DiagnosticsReportTests` (3) and `DiagnosticsCanaryTests` (1) pass, and the app total is 225.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Diagnostics/DiagnosticsReport.swift ios/AppTests/DiagnosticsTests.swift
git commit -m "IOS-014: the report: app, phone, keyboard, session, settings as names and counts, and the recent log"
```

### Task 5: The screen

**Files:**
- Create: `ios/App/Diagnostics/DiagnosticsScreen.swift`.
- Modify: `ios/App/Home/SettingsScreen.swift`, `ios/AppTests/DiagnosticsTests.swift`.

**Interfaces:**
- Consumes `DiagnosticsReport` (Task 4).
- Produces:
  - `DiagnosticsScreen(build:)` and `ReportPreview`;
  - `DiagnosticsFile.write(_:now:in:)`;
  - `DiagnosticsRoute` and `DiagnosticsCopy`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/DiagnosticsTests.swift`, add:

```swift
@Suite struct DiagnosticsFileTests {
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    /// A report is one text file, named by its day, replacing the last.
    @Test func theReportIsOneFileNamedByItsDay() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "report-\(UUID().uuidString)", directoryHint: .isDirectory)
        _ = DiagnosticsFile.write("old", now: at.addingTimeInterval(-86_400 * 3), in: folder)
        let file = try #require(DiagnosticsFile.write("murmur diagnostics report\n", now: at, in: folder))
        #expect(file.lastPathComponent == "murmur-diagnostics-2026-09-21.txt")
        #expect(try String(contentsOf: file, encoding: .utf8) == "murmur diagnostics report\n")
        #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path) == [file.lastPathComponent])
    }
}

@Suite struct DiagnosticsCopyTests {
    @Test func everyLineFollowsTheWritingRules() {
        for line in [DiagnosticsCopy.what, DiagnosticsCopy.never, DiagnosticsCopy.footer, DiagnosticsCopy.noCatalog] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:generate && npm run ios:test`
Expected: the app test build fails with `cannot find 'DiagnosticsCopy' in scope` and `cannot find 'DiagnosticsFile' in scope`.

- [ ] **Step 3: Write the screen and its row in Settings**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Settings, Diagnostics (ios/prd.json IOS-014): what the report holds and
// what it never holds, and Save report. The report opens as a preview
// first; Share there opens the share sheet. Nothing is sent by itself.
import MurmurCore
import SwiftUI

struct DiagnosticsScreen: View {
    /// Builds the report's text when asked.
    let build: @MainActor () -> String
    @State private var report: Report?

    /// A built report and the file it was saved to.
    struct Report: Identifiable {
        let id = UUID()
        let text: String
        let file: URL?
    }

    var body: some View {
        List {
            Section {
                Text(DiagnosticsCopy.what)
                Text(DiagnosticsCopy.never)
            }
            .listRowBackground(Tokens.panel)
            Section {
                Button(DiagnosticsCopy.save) { save() }
                    .buttonStyle(RowAction())
            } footer: {
                Text(DiagnosticsCopy.footer).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(DiagnosticsCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $report) { report in
            NavigationStack { ReportPreview(report: report) }
                .preferredColorScheme(.dark)
        }
    }

    private func save() {
        let text = build()
        report = Report(text: text, file: DiagnosticsFile.write(text, now: .now))
    }
}

/// The report as it will be sent, with Share to send it.
struct ReportPreview: View {
    let report: DiagnosticsScreen.Report
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            Text(report.text)
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(Tokens.text)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .background(Tokens.ink)
        .navigationTitle(DiagnosticsCopy.preview)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(DiagnosticsCopy.done) { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                if let file = report.file {
                    ShareLink(item: file) { Label(DiagnosticsCopy.share, systemImage: "square.and.arrow.up") }
                } else {
                    ShareLink(item: report.text) { Label(DiagnosticsCopy.share, systemImage: "square.and.arrow.up") }
                }
            }
        }
        .tint(Tokens.brand)
    }
}

/// Where a report is saved for sharing: the app's temporary folder, one
/// report at a time.
enum DiagnosticsFile {
    static let folder = FileManager.default.temporaryDirectory.appending(path: "diagnostics", directoryHint: .isDirectory)

    /// The saved file, or nil when it could not be written (the preview
    /// then shares the text itself).
    static func write(_ text: String, now: Date, in folder: URL = folder) -> URL? {
        let file = folder.appending(path: DiagnosticsReport.fileName(now))
        do {
            try? FileManager.default.removeItem(at: folder)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(text.utf8).write(to: file, options: .atomic)
            return file
        } catch {
            return nil
        }
    }
}

/// Opens the screen on this phone's report.
struct DiagnosticsRoute: View {
    var body: some View {
        DiagnosticsScreen {
            guard let catalog = try? BundledRules.catalog() else { return DiagnosticsCopy.noCatalog }
            return DiagnosticsReport.text(DiagnosticsReport.facts(catalog: catalog))
        }
    }
}

/// What the screen says.
enum DiagnosticsCopy {
    static let title = "Diagnostics"
    static let what = "When something goes wrong, a report helps find out why. It holds the app and iPhone versions, whether the keyboard has Full Access, your settings as names and counts, and a short log of what happened to each take."
    static let never = "It never holds your words, your dictionary or expansions, or your key."
    static let save = "Save report"
    static let footer = "You read the report first. Share sends it only where you choose; murmur never sends it by itself."
    static let preview = "Report"
    static let share = "Share"
    static let done = "Done"
    static let noCatalog = "murmur diagnostics report\nThe app's own files could not be read, so this report is empty. Reinstalling murmur from TestFlight or the App Store fixes this.\n"
}

#if DEBUG
#Preview {
    NavigationStack {
        DiagnosticsScreen { "murmur diagnostics report\nversion: 0.1.0 (1)\n" }
    }
    .preferredColorScheme(.dark)
}
#endif
```

In `ios/App/Home/SettingsScreen.swift`, make two changes:
- After `NavigationLink("Keyboard") { KeyboardScreen() }`, add `NavigationLink("Diagnostics") { DiagnosticsRoute() }`.
- Replace the file's opening comment with:

```swift
// Settings (ios/prd.json IOS-012): Provider and keys, Cleanup, Dictionary
// and expansions (IOS-013), the session's length, the keyboard and the
// pill's look, Diagnostics (IOS-014), and About.
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:generate && npm run ios:test`, then read the result bundle.
Expected: `DiagnosticsFileTests` and `DiagnosticsCopyTests` pass, and the app total is 227.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Diagnostics/DiagnosticsScreen.swift ios/App/Home/SettingsScreen.swift ios/AppTests/DiagnosticsTests.swift
git commit -m "IOS-014: Settings, Diagnostics: Save report opens a preview, and Share there sends it where you choose"
```

### Task 6: The smoke builds a report after a canary take

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here: Tasks 2 to 4 built and unit-tested what it exercises.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("dictionary", checkDictionary),`, add `("diagnostics", checkDiagnostics),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// Diagnostics (IOS-014): a take with a canary word and a canary key in
    /// it is logged, and the report built after it says what happened while
    /// holding neither canary.
    static func checkDiagnostics() throws {
        if let failure = onMain({ await diagnosticsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func diagnosticsFailure() async -> String? {
        let canaryWord = "Smokeberry"
        let canaryKey = "gsk_smokecanary4321"
        guard let key = APIKey(canaryKey), let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-diagnostics-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        var settings = CleanupSettings(polish: false)
        settings.dictionary = [DictionaryEntry(from: "smoke berry", to: canaryWord)]
        cleanup.save(settings)
        let log = ActivityLog(file: scratch.appending(path: "logs", directoryHint: .isDirectory).appending(path: "activity.log"))
        let history = HistoryStore(file: scratch.appending(path: "history.jsonl"))
        let waiting = WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory))
        let model = TakeModel(
            microphone: ScriptedMicrophone(samples: ScriptedMicrophone.tone), store: waiting,
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"smoke berry spoken"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }, record: { try? history.append($0) }, note: { log.write($0) }
        )
        await model.start()
        await model.stop()
        guard case .words(let words) = model.state, words.contains(canaryWord) else { return "the take gave \(model.state)" }
        let report = DiagnosticsReport.text(DiagnosticsReport.facts(
            catalog: catalog, connections: connections, cleanup: cleanup, ring: ring, log: log, waiting: waiting,
            history: history, defaults: defaults, keyboard: nil, session: .off, mailbox: nil, pill: PillLook(style: .bars)
        ))
        guard report.contains("murmur diagnostics report"), report.contains("dictionaryEntries: 1"), report.contains("take captured"),
              report.contains("take words count=")
        else { return "the report missed the take: \(report)" }
        let logged = (try? String(contentsOf: log.file, encoding: .utf8)) ?? ""
        for text in [report, logged] where text.localizedCaseInsensitiveContains("smokeberry") || text.localizedCaseInsensitiveContains("smoke berry") || text.contains(canaryKey) {
            return "a canary reached the log or the report"
        }
        return nil
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists sixteen checks, all true, `diagnostics` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-014: the smoke runs a canary take and builds a report that holds neither canary"
```

### Task 7: The docs and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## How do I send diagnostics from my iPhone?

In murmur, tap the gear at the top right, then Diagnostics, then Save report. murmur shows you the whole report first. Tap Share to send it by Mail, Messages, or any app you choose, or tap Done to keep it to yourself. murmur never sends a report by itself.

The report is one plain text file. It holds the murmur version, your iPhone model and iOS version, whether the murmur keyboard has reported with Full Access, your session length, your settings as names and counts (your provider and models, how many dictionary words and expansions you have, whether a key is saved), and the recent activity log.

The activity log is one short line for what happened to each take: captured with its loudness, heard nothing with its loudness, failed with the kind of failure and its error number, the number of words it came back as, and whether the keyboard typed the words or offered them as Insert last. It never holds your words, your dictionary or expansions, a custom provider address, or your key. It stays in murmur's own storage on your iPhone, out of iCloud backups, and keeps only the most recent few hundred lines.
```

- [ ] **Step 2: The Settings list in the live checks**

In `HANDOFF.md`, in the IOS-012 live check's step (6), change `Provider and key, Cleanup, Dictionary and expansions, Session, Keyboard, and About` to `Provider and key, Cleanup, Dictionary and expansions, Session, Keyboard, Diagnostics, and About`.

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-014's `notes` to say what was built and verified, every ruling above, and the final gate counts. Write only the notes field; `passes` waits for the review gate (Ruling 8).

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-014: the iPhone docs answer how to send diagnostics"
```
