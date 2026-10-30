# Home and History (IOS-012) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real Home. It shows:
- the session, with Start session and End session;
- what is left of setup;
- takes waiting to retry;
- your takes, newest first, with their words, time, and length.

Tap a take to copy it. Deleting asks first, in red, and Clear all says the real count. History stays on the phone. Settings gathers the screens, and About says what murmur is.

**Architecture:**
- `HistoryStore` keeps one JSON line per take that came back as words. It lives in the app's own Application Support, out of iCloud backups, with the after-first-unlock protection class; never in the app group.
- `History`, an @Observable model, keeps the screen current.
- `TakeModel` gains a `record` closure. The live model feeds it into `History`, so a take's words and a retried take's words are kept, and silence or a failure never is.
- `HomeScreen` replaces the placeholder list. `ContentView` hosts it, with Dictate and Settings in the top bar, and still runs first run and the Recording screen.
- `SettingsScreen` and `AboutScreen` hold the rest.

**Tech Stack:** Swift 6, SwiftUI (List, swipeActions, confirmationDialog, Canvas), Foundation (JSON lines, file protection, backup exclusion), Swift Testing.

**Spec:** `ios/prd.json` IOS-012, with `conventions` (privacy, design, verify, docs). Also `CLAUDE.md` and `DESIGN.md`, including the empty state's one dry grey mark. Also CONTRIBUTING.md, for the no-outside-code note. It builds on IOS-006 (the take model and waiting takes), IOS-009 (the session), and IOS-011 (the setup checklist). Desktop's history (`src/main/history`) is murmur's own, and the iPhone keeps the same shape. The design skills were consulted: frontend-design, elite-saas-designer, and ui-skills-root.

**Proven before writing:** every block below ran in a throwaway copy of `feature/ios` at 203ce8c before this plan was saved:
- `npm run ios:test` ran 199 app tests: 186 existing and 13 new.
- `npm run ios:smoke` printed fourteen true checks, `history` among them.
- Home (empty, a few takes, a take waiting to retry), Settings, and About were rendered in the simulator and read. Two things were corrected:
  - the empty state's dry mark first drew as flat even lines, like a barcode, and now rises, narrows, and runs dry;
  - About's last line named MurmurCore, a code name, and now says "the code they share".

## Rulings in this plan

LaBroi can overturn any of these; each says what it costs if wrong.

1. **History holds only takes that came back as words.** Each records when it was spoken, how long it recorded, its words and word count, and whether it came from a retry. Waiting takes stay in their own list, shown on Home as "N takes waiting to retry". If wrong: failed takes could be listed too.
2. **History lives as JSON lines in the app's Application Support,** out of iCloud backups, writable after first unlock, never in the app group. A damaged line costs that line only.
3. **History has no size limit yet;** takes are short text. Desktop's retention setting can come to the phone later.
4. **Tapping a take copies its words,** and Copied shows in place of its length for a second and a half.
5. **Delete is a swipe, or a VoiceOver action, followed by a dialog whose Delete take is red.** Clear all opens a dialog that says the real count ("Delete all 12 takes?", "Delete your 1 take?").
6. **The empty state draws one dry grey brush mark in code** (seeded, the same every time), with one sentence on how to make the first take.
7. **Home's order: Session, Finish setting up, waiting takes, then Takes.** Dictate and Settings sit in the top bar.
8. **Settings holds Provider and key, Cleanup, Session, Keyboard, and About.** Dictionary and expansions (IOS-013) and Diagnostics (IOS-014) join when they ship.
9. **About gives the version and build, the GPLv3 with links to the source and the license, the no-outside-code note from CONTRIBUTING.md, and that the app bundles no outside code.** No third-party code is in the iPhone app.
10. **A retried take is kept at the time it was spoken,** marked retried, with its audio's length.
11. **The live check waits for TestFlight 1** (IOS-015).

## Global Constraints

- Swift 6 with strict concurrency; iOS 26 minimum. It must compile with Swift 6.3 (CI's Xcode 26.6): bind by key path, never `Binding(get:set:)` with closures, and write long math as small typed steps.
- Privacy: history never reaches the app group, the network, or backups.
- Design: night studio tokens. Gold for actions, `ok` for Copied, red only in the delete dialogs (the system's destructive role). One dry grey mark for the empty state, and no other paint. 44 point targets; VoiceOver gets each take's words and time, a copy hint, and a Delete action.
- Every `.swift` file starts with its SPDX line. murmur is lowercase. No em dashes or spaced hyphens.
- Commits start with `IOS-012:`, then `git pull --rebase`. Before every commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, and `npm run ios:smoke`.
- Clean room: never open `~/Projects/undertone`, `~/Projects/the-peoples-voice-flow`, or `~/Projects/OpenWhisp`.
- The review gate runs before any push.

## Review Focus

1. **History leaving the phone,** through backups or the app group. It never does. Pinned by `HistoryStoreTests.historyStaysOnThePhone` and `theRealHistoryIsTheAppsOwn` (Task 1), and the smoke's `history` check (Task 4).
2. **Silence or a failed take turning up in history.** Neither ever does; a retry that lands does. Pinned by `TakeModelTests.onlyWordsAreKeptAndRetriesKeepTheirTime` (Task 2).
3. **A damaged history file losing everything.** Only the damaged line goes. Pinned by `HistoryStoreTests.aDamagedLineIsSkipped` (Task 1).
4. **Delete or Clear all removing the wrong take, or leaving words behind.** Pinned by `HistoryStoreTests.oneTakeDeletesAndClearAllEmpties` and `HistoryModelTests.theModelKeepsTheScreenCurrent` (Task 1).
5. **Clear all's count, wrong or badly worded for one take.** Pinned by `HomeCopyTests.clearAllSaysTheRealCount` (Task 3).

---

### Task 1: The history store

**Files:** Create `ios/App/History/History.swift`. Test `ios/AppTests/HistoryTests.swift`.

**Interfaces:**
- Produces `HistoryEntry`:
  - fields `id`, `at`, `durationMs`, `words`, `wordCount`, and `retried`;
  - `init(id:at:durationMs:words:retried:)`.
- Produces `HistoryStore` (`file`, `.standard`, `append(_:)`, `list()`, `remove(_:)`, `clear()`).
- Produces `History` (`entries`, `add(_:)`, `delete(_:)`, `clear()`, `History.live()`).

- [ ] **Step 1: Write the failing tests**

```swift
// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct HistoryStoreTests {
    let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "history-\(UUID().uuidString)", directoryHint: .isDirectory).appending(path: "history.jsonl"))
    let start = Date(timeIntervalSince1970: 1_790_000_000)

    func entry(_ words: String, _ minutes: Double) -> HistoryEntry {
        HistoryEntry(at: start.addingTimeInterval(minutes * 60), durationMs: 2_400, words: words)
    }

    /// Takes read back newest first, with their words, time, length, and
    /// word count.
    @Test func takesReadBackNewestFirst() throws {
        #expect(store.list().isEmpty)
        try store.append(entry("First take.", 0))
        try store.append(entry("Second take here.", 1))
        let entries = store.list()
        #expect(entries.map(\.words) == ["Second take here.", "First take."])
        #expect(entries[0].wordCount == 3)
        #expect(entries[0].durationMs == 2_400)
        #expect(entries[1].at == start)
    }

    @Test func oneTakeDeletesAndClearAllEmpties() throws {
        let keep = entry("Keep me.", 0)
        let drop = entry("Drop me.", 1)
        try store.append(keep)
        try store.append(drop)
        try store.remove(drop.id)
        #expect(store.list() == [keep])
        try store.append(entry("Another.", 2))
        try store.clear()
        #expect(store.list().isEmpty)
        #expect(!FileManager.default.fileExists(atPath: store.file.path))
    }

    /// History never leaves the phone: out of iCloud backups, and writable
    /// after first unlock, as a take can land with the phone locked.
    @Test func historyStaysOnThePhone() throws {
        try store.append(entry("Private words.", 0))
        let folder = store.file.deletingLastPathComponent()
        #expect(try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        let protection = try store.file.resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        #expect(protection == .completeUntilFirstUserAuthentication)
        #expect(!store.file.path.contains("Group Containers") && !store.file.path.contains("AppGroup"))
    }

    /// A damaged line costs that line, never the rest.
    @Test func aDamagedLineIsSkipped() throws {
        try store.append(entry("Before.", 0))
        let handle = try FileHandle(forWritingTo: store.file)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data("{not a take}\n".utf8))
        try handle.close()
        try store.append(entry("After.", 1))
        #expect(store.list().map(\.words) == ["After.", "Before."])
    }

    /// The real history sits in the app's own container.
    @Test func theRealHistoryIsTheAppsOwn() {
        #expect(HistoryStore.standard.file.path.hasPrefix(URL.applicationSupportDirectory.path))
    }
}

@MainActor @Suite struct HistoryModelTests {
    let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "history-model-\(UUID().uuidString).jsonl"))

    @Test func theModelKeepsTheScreenCurrent() {
        let history = History(store: store)
        let first = HistoryEntry(at: .now, durationMs: 1_000, words: "One.")
        let second = HistoryEntry(at: .now, durationMs: 1_000, words: "Two.")
        history.add(first)
        history.add(second)
        #expect(history.entries.map(\.words) == ["Two.", "One."])
        history.delete(second.id)
        #expect(history.entries == [first])
        #expect(History(store: store).entries == [first])
        history.clear()
        #expect(history.entries.isEmpty)
        #expect(History(store: store).entries.isEmpty)
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'HistoryStore' in scope`.

- [ ] **Step 3: Write the store and the model**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// History (ios/prd.json IOS-012): every take that came back as words,
// kept only in the app's own container, never in the app group the
// keyboard shares and never in iCloud backups, so it never leaves the
// phone. One line per take, newest last on disk and first on screen.
import Foundation
import Observation

struct HistoryEntry: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    /// When the take was spoken.
    let at: Date
    /// How long it recorded.
    let durationMs: Int
    let words: String
    let wordCount: Int
    /// A take that failed first and came back on a retry (IOS-006).
    let retried: Bool

    init(id: UUID = UUID(), at: Date, durationMs: Int, words: String, retried: Bool = false) {
        self.id = id
        self.at = at
        self.durationMs = max(0, durationMs)
        self.words = words
        wordCount = words.split(whereSeparator: \.isWhitespace).count
        self.retried = retried
    }
}

struct HistoryStore: Sendable {
    let file: URL

    static let standard = HistoryStore(file: URL.applicationSupportDirectory.appending(path: "history", directoryHint: .isDirectory).appending(path: "history.jsonl"))

    /// Adds a take at the end, creating the file (out of backups, writable
    /// after first unlock, as a take may land with the phone locked).
    func append(_ entry: HistoryEntry) throws {
        try prepare()
        var line = try JSONEncoder().encode(entry)
        line.append(0x0A)
        let handle = try FileHandle(forWritingTo: file)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }

    /// Every take, newest first; a line that cannot be read is skipped.
    func list() -> [HistoryEntry] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        let decoder = JSONDecoder()
        return data.split(separator: 0x0A).compactMap { try? decoder.decode(HistoryEntry.self, from: Data($0)) }.reversed()
    }

    func remove(_ id: UUID) throws {
        let kept = list().reversed().filter { $0.id != id }
        try rewrite(Array(kept))
    }

    func clear() throws {
        if FileManager.default.fileExists(atPath: file.path) {
            try FileManager.default.removeItem(at: file)
        }
    }

    private func rewrite(_ entries: [HistoryEntry]) throws {
        try prepare()
        let encoder = JSONEncoder()
        var data = Data()
        for entry in entries {
            data.append(try encoder.encode(entry))
            data.append(0x0A)
        }
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

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

/// The history the app shows: the store, read once and kept current.
@Observable @MainActor final class History {
    private(set) var entries: [HistoryEntry]
    @ObservationIgnored private let store: HistoryStore

    init(store: HistoryStore) {
        self.store = store
        entries = store.list()
    }

    /// A take that came back as words. If the disk refuses it, it still
    /// shows until murmur closes.
    func add(_ entry: HistoryEntry) {
        try? store.append(entry)
        entries.insert(entry, at: 0)
    }

    func delete(_ id: UUID) {
        try? store.remove(id)
        entries = store.list()
    }

    func clear() {
        try? store.clear()
        entries = []
    }
}

extension History {
    private static var shared: History?

    /// The app's one history.
    static func live() -> History {
        if let shared { return shared }
        let history = History(store: .standard)
        shared = history
        return history
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `HistoryStoreTests` (5 tests) and `HistoryModelTests` (1 test) pass, and the app total is 192.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/History/History.swift ios/AppTests/HistoryTests.swift
git commit -m "IOS-012: history keeps each take's words on the phone, newest first"
```

### Task 2: Takes are kept

**Files:** Modify `ios/App/Takes/TakeModel.swift`, `ios/App/Takes/TakeScreen.swift`, `ios/AppTests/TakeModelTests.swift`.

**Interfaces:**
- Consumes `HistoryEntry` and `History.live()` (Task 1).
- Produces `TakeModel.init(...,record:)`, where `record: @MainActor (HistoryEntry) -> Void` defaults to doing nothing.

- [ ] **Step 1: Write the failing tests**

In `ios/AppTests/TakeModelTests.swift`, make three changes:
- In `Sink`, add `var kept: [HistoryEntry] = []` after `copied`, and change its comment to "What a take copied, what it kept in history, and the time it reads."
- In `model(send:)`, after `now: { [sink] in sink.now }`, add `, record: { [sink] entry in sink.kept.append(entry) }` as the last argument.
- Before `aRetryDeliversTheWordsThenDeletesTheAudio`, add:

```swift
    /// A take that comes back as words is kept in history (IOS-012), with
    /// when it was spoken and how long it recorded.
    @Test func aTakeThatLandsIsKeptInHistory() async {
        let model = model(.says("Send the invoice tomorrow."))
        let spoken = sink.now
        await take(model)
        #expect(sink.kept.count == 1)
        #expect(sink.kept.first?.words == "Send the invoice tomorrow.")
        #expect(sink.kept.first?.at == spoken)
        #expect(sink.kept.first?.durationMs == 2_000)
        #expect(sink.kept.first?.retried == false)
    }

    /// Silence and failures keep nothing; a retried take is kept at the
    /// time it was spoken, marked retried.
    @Test func onlyWordsAreKeptAndRetriesKeepTheirTime() async {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        let spoken = sink.now
        await take(model)
        #expect(sink.kept.isEmpty)
        microphone.samples = ScriptedMicrophone.silence
        await take(model)
        #expect(sink.kept.isEmpty)
        provider.answer([(200, #"{"text":"Late words."}"#)])
        pass(60)
        await model.retry(model.waiting.map(\.id))
        #expect(sink.kept.map(\.words) == ["Late words."])
        #expect(sink.kept.first?.retried == true)
        #expect(sink.kept.first?.at == spoken)
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `extra argument 'record' in call`.

- [ ] **Step 3: Keep the words**

In `ios/App/Takes/TakeModel.swift`, make six changes:
- After the `keepAlive` property, add:

```swift
    /// Keeps a take that came back as words in history (IOS-012).
    @ObservationIgnored private let record: @MainActor (HistoryEntry) -> Void
```

- In `init`, after the `keepAlive` parameter, add `, record: @escaping @MainActor (HistoryEntry) -> Void = { _ in }`.
- In `init`'s body, after `self.keepAlive = keepAlive`, add `self.record = record`.
- In `stop()`, after `let samples = microphone.stop()`, add `let length = Int(now().timeIntervalSince(since) * 1000)`.
- In `stop()`, after `state = words.map(State.words) ?? .heardNothing(sent: true)`, add `if let words { record(HistoryEntry(at: since, durationMs: length, words: words)) }`.
- In `retry(_:)`, after `guard let audio = try? store.audio(id) else { continue }`, add `let spoken = store.take(id)?.startedAt ?? now()`. After `delivered.append(words)`, add `record(HistoryEntry(at: spoken, durationMs: Wav.durationMs(audio), words: words, retried: true))`.

In `ios/App/Takes/TakeScreen.swift`, in `TakeModel.live()`, add the argument `record: { History.live().add($0) }` after `keepAlive: BackgroundTime.hold`.

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `TakeModelTests` passes, and the app total is 194.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Takes/TakeModel.swift ios/App/Takes/TakeScreen.swift ios/AppTests/TakeModelTests.swift
git commit -m "IOS-012: a take that comes back as words is kept in history, and silence never is"
```

### Task 3: Home, Settings, and About

**Files:**
- Create: `ios/App/Home/HomeScreen.swift`, `ios/App/Home/SettingsScreen.swift`.
- Modify (whole file below): `ios/App/ContentView.swift`.
- Modify: `ios/AppTests/HistoryTests.swift`.

**Interfaces:**
- Consumes Tasks 1 and 2, `Session` (IOS-009), and `Setup` and `SetupChecklist` (IOS-011).
- Produces:
  - `HomeScreen(history:session:model:setup:resume:)`;
  - `SessionCard`, `TakeRow`, `EmptyTakes`, `DryMark`, and `HomeCopy`;
  - `HomePreview` (debug previews);
  - `SettingsScreen`, `AboutScreen`, and `AboutCopy`.

- [ ] **Step 1: Write the failing tests**

At the end of `ios/AppTests/HistoryTests.swift`, add:

```swift
@Suite struct HomeCopyTests {
    @Test func lengthsReadAsPeopleSayThem() {
        #expect(HomeCopy.length(0) == "1 second")
        #expect(HomeCopy.length(12_400) == "12 seconds")
        #expect(HomeCopy.length(60_000) == "1 minute")
        #expect(HomeCopy.length(65_000) == "1 minute 5 seconds")
        #expect(HomeCopy.length(181_000) == "3 minutes 1 second")
    }

    /// Clear all says the real count, and one take reads as one.
    @Test func clearAllSaysTheRealCount() {
        #expect(HomeCopy.clearTitle(12) == "Delete all 12 takes?")
        #expect(HomeCopy.clearAction(12) == "Delete 12 takes")
        #expect(HomeCopy.clearTitle(1) == "Delete your 1 take?")
        #expect(HomeCopy.clearAction(1) == "Delete 1 take")
        #expect(HomeCopy.waiting(1) == "1 take waiting to retry")
        #expect(HomeCopy.waiting(3) == "3 takes waiting to retry")
    }

    /// Today's takes show the time; older ones the date too.
    @Test func olderTakesShowTheirDate() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        #expect(HomeCopy.time(now.addingTimeInterval(-60), now: now) == now.addingTimeInterval(-60).formatted(date: .omitted, time: .shortened))
        let lastWeek = now.addingTimeInterval(-7 * 86_400)
        #expect(HomeCopy.time(lastWeek, now: now) == lastWeek.formatted(date: .abbreviated, time: .shortened))
    }

    @Test func everyLineFollowsTheWritingRules() {
        let lines = [HomeCopy.empty, HomeCopy.copyHint, HomeCopy.deleteOne, AboutCopy.license, AboutCopy.noOutsideCode, AboutCopy.bundled]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
        #expect(HomeCopy.empty.contains("Tap the pill"))
    }

    /// About names the version and build, the license, the source, and that
    /// murmur takes no outside code.
    @Test func aboutSaysWhatMurmurIs() {
        #expect(AboutCopy.version(["CFBundleShortVersionString": "0.1.0", "CFBundleVersion": "7"]) == "0.1.0 (7)")
        #expect(AboutCopy.source.absoluteString == "https://github.com/lbwalton/murmur")
        #expect(AboutCopy.license.contains("version 3"))
        #expect(AboutCopy.noOutsideCode.contains("does not accept outside code"))
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run ios:test`
Expected: the app test build fails with `cannot find 'HomeCopy' in scope`.

- [ ] **Step 3: Write the screens**

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Home (ios/prd.json IOS-012): the session, with Start session and End
// session; what is left of setup; takes waiting to retry; and the newest
// takes with their words, time, and length. Tap a take to copy it;
// deleting one asks first, in red, and Clear all says the real count.
import MurmurCore
import SwiftUI
import UIKit

struct HomeScreen: View {
    let history: History
    let session: Session?
    let model: TakeModel?
    let setup: Setup
    let resume: (Setup.Step) -> Void
    @State private var copied: UUID?
    @State private var deleting: HistoryEntry?
    @State private var askingDelete = false
    @State private var askingClear = false

    var body: some View {
        List {
            if let session {
                SessionCard(session: session)
            }
            if !setup.isFinished {
                SetupChecklist(setup: setup, resume: resume)
            }
            if let model, !model.waiting.isEmpty {
                Section {
                    NavigationLink {
                        TakeRoute()
                    } label: {
                        Label(HomeCopy.waiting(model.waiting.count), systemImage: "arrow.clockwise")
                            .foregroundStyle(Tokens.brand)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            Section {
                if history.entries.isEmpty {
                    EmptyTakes()
                } else {
                    ForEach(history.entries) { entry in
                        TakeRow(entry: entry, copied: copied == entry.id) {
                            copy(entry)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(HomeCopy.delete, role: .destructive) { ask(entry) }
                        }
                        .accessibilityAction(named: HomeCopy.delete) { ask(entry) }
                    }
                }
            } header: {
                HStack {
                    SectionTitle(HomeCopy.takes)
                    Spacer()
                    if !history.entries.isEmpty {
                        Button(HomeCopy.clearAll) { askingClear = true }
                            .font(.subheadline)
                            .foregroundStyle(Tokens.brand)
                            .textCase(nil)
                            .frame(minHeight: 44)
                    }
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .confirmationDialog(HomeCopy.deleteOne, isPresented: $askingDelete, titleVisibility: .visible, presenting: deleting) { entry in
            Button(HomeCopy.deleteOneAction, role: .destructive) { history.delete(entry.id) }
        }
        .confirmationDialog(HomeCopy.clearTitle(history.entries.count), isPresented: $askingClear, titleVisibility: .visible) {
            Button(HomeCopy.clearAction(history.entries.count), role: .destructive) { history.clear() }
        }
    }

    private func copy(_ entry: HistoryEntry) {
        UIPasteboard.general.string = entry.words
        copied = entry.id
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            if copied == entry.id { copied = nil }
        }
    }

    private func ask(_ entry: HistoryEntry) {
        deleting = entry
        askingDelete = true
    }
}

/// Whether a session is running, and the one action that changes it.
struct SessionCard: View {
    let session: Session
    @State private var refused = false

    var body: some View {
        Section {
            Text(SessionCopy.status(until: session.until))
            Button(session.isOn ? SessionCopy.end : SessionCopy.start) {
                if session.isOn {
                    session.end()
                } else {
                    Task { refused = await !session.begin() }
                }
            }
            .buttonStyle(RowAction())
            .frame(minHeight: 44)
        } header: {
            SectionTitle(HomeCopy.session)
        } footer: {
            if refused, !session.isOn {
                Text(SessionCopy.micOff).foregroundStyle(Tokens.red)
            }
        }
        .listRowBackground(Tokens.panel)
    }
}

/// One take: its words, when, and how long. Tapping copies the words.
struct TakeRow: View {
    let entry: HistoryEntry
    let copied: Bool
    let copy: () -> Void

    var body: some View {
        Button(action: copy) {
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.words)
                    .lineLimit(3)
                    .foregroundStyle(Tokens.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack {
                    Text(HomeCopy.time(entry.at))
                    Spacer()
                    if copied {
                        Label(HomeCopy.copied, systemImage: "checkmark")
                            .foregroundStyle(Tokens.ok)
                    } else {
                        Text(HomeCopy.length(entry.durationMs))
                    }
                }
                .font(.footnote.monospacedDigit())
                .foregroundStyle(Tokens.textDim)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(HomeCopy.copyHint)
    }
}

/// Home before the first take: one dry grey mark and the way to begin.
struct EmptyTakes: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            DryMark()
                .frame(width: 120, height: 30)
                .accessibilityHidden(true)
            Text(HomeCopy.empty)
                .foregroundStyle(Tokens.textDim)
        }
        .padding(.vertical, 12)
    }
}

/// A dry grey brush mark drawn by code: bristles along one gentle stroke
/// that run out of paint toward the end, the same every time.
struct DryMark: View {
    var body: some View {
        Canvas { context, size in
            var random = Seeded(89)
            let bristles = 7
            let steps = 40
            for bristle in 0..<bristles {
                let spread = (CGFloat(bristle) - CGFloat(bristles - 1) / 2) * size.height / CGFloat(bristles + 3)
                let alpha = 0.35 + 0.4 * random.next()
                // Bristles touch down a little apart, so the stroke starts ragged.
                let start = 0.08 * random.next()
                var path = Path()
                var drawing = false
                for step in 0...steps {
                    let t = start + (1 - start) * CGFloat(step) / CGFloat(steps)
                    let x = t * size.width
                    // The stroke rises a little and narrows as it goes.
                    let rise: CGFloat = sin(t * .pi * 0.8) * size.height * 0.22
                    let y = size.height * 0.6 + spread * (1 - 0.45 * t) - rise
                    // The brush runs dry: gaps grow toward the end.
                    let dry = random.next() < t * t * 0.85
                    if dry {
                        drawing = false
                    } else if drawing {
                        path.addLine(to: CGPoint(x: x, y: y))
                    } else {
                        path.move(to: CGPoint(x: x, y: y))
                        drawing = true
                    }
                }
                context.stroke(path, with: .color(Tokens.textDim.opacity(alpha)), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
            }
        }
    }
}

/// What Home says.
enum HomeCopy {
    static let session = "Session"
    static let takes = "Takes"
    static let clearAll = "Clear all"
    static let delete = "Delete"
    static let deleteOne = "Delete this take?"
    static let deleteOneAction = "Delete take"
    static let copied = "Copied"
    static let copyHint = "Double tap to copy the words."
    static let empty = "Your takes land here. Tap the pill in any app, or tap Dictate."

    static func waiting(_ count: Int) -> String {
        count == 1 ? "1 take waiting to retry" : "\(count) takes waiting to retry"
    }

    static func clearTitle(_ count: Int) -> String {
        count == 1 ? "Delete your 1 take?" : "Delete all \(count) takes?"
    }

    static func clearAction(_ count: Int) -> String {
        count == 1 ? "Delete 1 take" : "Delete \(count) takes"
    }

    /// The time alone today; the date and time before today.
    static func time(_ at: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        calendar.isDate(at, inSameDayAs: now)
            ? at.formatted(date: .omitted, time: .shortened)
            : at.formatted(date: .abbreviated, time: .shortened)
    }

    /// How long a take recorded, in whole seconds, at least one.
    static func length(_ ms: Int) -> String {
        let seconds = max(1, (ms + 500) / 1000)
        let minutes = seconds / 60
        let rest = seconds % 60
        func unit(_ n: Int, _ name: String) -> String { n == 1 ? "1 \(name)" : "\(n) \(name)s" }
        if minutes == 0 { return unit(rest, "second") }
        return rest == 0 ? unit(minutes, "minute") : "\(unit(minutes, "minute")) \(unit(rest, "second"))"
    }
}

#if DEBUG
/// Home in each state the previews show: empty, a few takes, many, and a
/// take waiting to retry.
struct HomePreview: View {
    enum Scene { case empty, few, many, failed }
    let scene: Scene
    @State private var history: History
    @State private var setup: Setup
    @State private var model: TakeModel?

    init(_ scene: Scene) {
        self.scene = scene
        let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "home-preview-\(UUID().uuidString).jsonl"))
        let count = scene == .empty ? 0 : scene == .many ? 40 : 3
        let words = ["Send the invoice tomorrow and copy the whole team.", "Pick up oat milk on the way home.", "The demo moved to Thursday at ten."]
        for i in 0..<count {
            try? store.append(HistoryEntry(at: .now.addingTimeInterval(Double(i - count) * 3_700), durationMs: 2_000 + i * 900, words: words[i % words.count]))
        }
        _history = State(initialValue: History(store: store))
        let access = ScriptedAccess(answer: true)
        access.status = .granted
        let defaults = UserDefaults(suiteName: "home-preview")!
        _setup = State(initialValue: Setup(microphone: access, report: { KeyboardReport(fullAccess: true, at: .now) }, hasKey: { true }, defaults: defaults))
        _model = State(initialValue: scene == .failed ? Self.failedModel() : nil)
    }

    /// A take model with one take waiting to retry.
    private static func failedModel() -> TakeModel? {
        guard let rules = try? BundledRules.takeRules(), let catalog = try? BundledRules.catalog(), let defaults = UserDefaults(suiteName: "home-preview-failed"),
              let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate)
        else { return nil }
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "home-preview-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
        _ = try? store.save(wav, startedAt: .now, failure: TakeFailure(kind: "network", detail: "offline"))
        return TakeModel(
            microphone: ScriptedMicrophone(), store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: MemoryKeyRing(),
            send: { _ in throw URLError(.notConnectedToInternet) }, copy: { _ in }
        )
    }

    var body: some View {
        NavigationStack {
            HomeScreen(history: history, session: nil, model: model, setup: setup) { _ in }
                .navigationTitle("murmur")
        }
        .preferredColorScheme(.dark)
    }
}

#Preview("Empty") { HomePreview(.empty) }
#Preview("A few takes") { HomePreview(.few) }
#Preview("Many takes") { HomePreview(.many) }
#Preview("A failed take") { HomePreview(.failed) }
#endif
```

```swift
// SPDX-License-Identifier: GPL-3.0-only
// Settings (ios/prd.json IOS-012): Provider and keys, Cleanup, the session's
// length, the keyboard and the pill's look, and About. Dictionary and
// expansions (IOS-013) and Diagnostics (IOS-014) join the list when they
// ship.
import SwiftUI

struct SettingsScreen: View {
    var body: some View {
        List {
            Group {
                NavigationLink("Provider and key") { ProviderRoute() }
                NavigationLink("Cleanup") { CleanupRoute() }
                NavigationLink("Session") { SessionRoute() }
                NavigationLink("Keyboard") { KeyboardScreen() }
                NavigationLink("About") { AboutScreen() }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The version, the license, the source, and how murmur is made.
struct AboutScreen: View {
    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: AboutCopy.version())
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.license)
                Link(AboutCopy.readSource, destination: AboutCopy.source)
                    .buttonStyle(RowAction())
                Link(AboutCopy.readLicense, destination: AboutCopy.gpl)
                    .buttonStyle(RowAction())
            } header: {
                SectionTitle("Free software")
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.noOutsideCode)
            } header: {
                SectionTitle("Who writes murmur")
            }
            .listRowBackground(Tokens.panel)
            Section {
                Text(AboutCopy.bundled)
            } header: {
                SectionTitle("Licenses")
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
}

enum AboutCopy {
    static let license = "murmur is free software under the GNU General Public License, version 3. Read it, learn from it, and build it yourself."
    static let readSource = "Read the source"
    static let readLicense = "Read the license"
    static let noOutsideCode = "murmur does not accept outside code: pull requests are closed without being merged. That keeps Eze Media LLC the sole copyright holder, which is what lets murmur ship on the App Store as well as under the GPL."
    static let bundled = "murmur bundles no outside code. The app, the keyboard, and the code they share are murmur's own, all under the GPL, version 3."
    static let source = URL(string: "https://github.com/lbwalton/murmur")!
    static let gpl = URL(string: "https://www.gnu.org/licenses/gpl-3.0.html")!

    /// The version and build, from the app's Info.plist.
    static func version(_ info: [String: Any]? = Bundle.main.infoDictionary) -> String {
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}
```

`ios/App/ContentView.swift`, whole:

```swift
// SPDX-License-Identifier: GPL-3.0-only
import SwiftUI

/// The app's root: Home (IOS-012), with Dictate and Settings at the top.
/// It starts the keyboard's bridge and the session, opens first run on the
/// first launch (IOS-011), and shows the Recording screen when the keyboard
/// opens murmur.
struct ContentView: View {
    @State private var opener = TakeOpener.shared
    @State private var setup = Setup.live()
    @State private var history = History.live()
    @State private var firstRun: Setup.Step?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            HomeScreen(history: history, session: Session.live(), model: TakeModel.live(), setup: setup) { firstRun = $0 }
                .navigationTitle("murmur")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            TakeRoute()
                        } label: {
                            Image(systemName: "mic")
                                .accessibilityLabel("Dictate")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            SettingsScreen()
                        } label: {
                            Image(systemName: "gearshape")
                                .accessibilityLabel("Settings")
                        }
                    }
                }
                .fullScreenCover(item: $firstRun) { step in
                    FirstRunScreen(setup: setup, step: step)
                }
        }
        .tint(Tokens.brand)
        .preferredColorScheme(.dark)
        .task {
            _ = KeyboardBridge.live()
            _ = Session.live()
            if !setup.seen {
                // Everything done already: nothing to walk through.
                if let next = setup.next { firstRun = next } else { setup.seen = true }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { setup.refresh() }
        }
        .onOpenURL { url in
            Task { await opener.open(url) }
        }
        .fullScreenCover(isPresented: $opener.showing) { RecordingRoute() }
    }
}

#Preview {
    ContentView()
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm run ios:test`, then read the result bundle.
Expected: `HomeCopyTests` passes (5 tests), and the app total is 199.

- [ ] **Step 5: Run the gates and commit**

```bash
git add ios/App/Home/HomeScreen.swift ios/App/Home/SettingsScreen.swift ios/App/ContentView.swift ios/AppTests/HistoryTests.swift
git commit -m "IOS-012: Home shows the session, setup, waiting takes, and your takes; Settings and About gather the rest"
```

### Task 4: The smoke checks history

**Files:** Modify `ios/App/Smoke/SmokeRunner.swift`.

The smoke check is the test here: Task 1 built and unit-tested the store, and the check runs it in the launched app.

- [ ] **Step 1: Add the check**

In `SmokeRunner.runAndExit`'s list, after `("firstRun", checkFirstRun),`, add `("history", checkHistory),`. Before `/// Runs main-actor work to the end from the smoke's synchronous start`, add:

```swift
    /// History in a scratch folder (IOS-012): three takes written read back
    /// newest first, one deletes, Clear all empties it, and the folder is
    /// out of backups with the file writable after first unlock.
    static func checkHistory() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "smoke-history-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = HistoryStore(file: folder.appending(path: "history.jsonl"))
        let takes = ["The first smoke take.", "The second smoke take.", "The third smoke take."].enumerated().map { index, words in
            HistoryEntry(at: Date(timeIntervalSince1970: 1_790_000_000 + Double(index) * 60), durationMs: 1_500, words: words)
        }
        for take in takes { try store.append(take) }
        guard store.list() == takes.reversed() else { throw SmokeFailure("history read back \(store.list().map(\.words))") }
        try store.remove(takes[1].id)
        guard store.list() == [takes[2], takes[0]] else { throw SmokeFailure("deleting one left \(store.list().map(\.words))") }
        guard try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else { throw SmokeFailure("history is in backups") }
        let protection = try store.file.resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        guard protection == .completeUntilFirstUserAuthentication else { throw SmokeFailure("history has protection \(String(describing: protection))") }
        try store.clear()
        guard store.list().isEmpty else { throw SmokeFailure("Clear all left takes") }
    }
```

- [ ] **Step 2: Run the smoke**

Run: `npm run ios:smoke`
Expected: `SMOKE_RESULT` lists fourteen checks, all true, `history` among them.

- [ ] **Step 3: Run the gates and commit**

```bash
git add ios/App/Smoke/SmokeRunner.swift
git commit -m "IOS-012: the smoke writes takes to history, reads them back, deletes one, and clears all"
```

### Task 5: The docs, the live check, and the notes

**Files:** Modify `ios/docs/iphone.md`, `HANDOFF.md`, `ios/prd.json`.

- [ ] **Step 1: The docs**

At the end of `ios/docs/iphone.md`, add:

```markdown
## Where is my history kept on iPhone?

Only on your iPhone, in murmur's own storage. Your history is left out of iCloud backups and never goes to your provider or anyone else. The murmur keyboard never sees it: only your newest take's words pass through the drawer the keyboard shares, and they are cleared as soon as they are typed.

murmur's home screen shows your takes, newest first, with their words, when you spoke them, and how long they ran. Tap a take to copy its words.

## How do I delete my history on iPhone?

On murmur's home screen, swipe left on a take and tap Delete, then Delete take. To delete everything, tap Clear all above your takes; murmur asks first and says how many takes will go. Deleting murmur from your iPhone deletes your history too.
```

- [ ] **Step 2: The live check**

In `HANDOFF.md`, under `## Now`, after the IOS-011 live check, add:

```markdown
- [ ] IOS-012 live check, once TestFlight 1 is on your iPhone (IOS-015; added 2026-10-12). (1) Dictate a few takes in any app, then open murmur. Under Takes, your takes should be listed newest first, each with its words, the time you spoke it, and how long it ran. (2) Tap one take. It should say Copied for a moment. Open Notes and paste: the words should be there. (3) Back in murmur, swipe left on a different take and tap Delete. A box asks Delete this take? with a red Delete take; tap it, and the take should disappear. (4) Tap Clear all above your takes. It should ask Delete all N takes? with the real number. Tap Cancel this time. (5) At the top of Home, check that Session says whether a session is running, with Start session or End session under it. (6) Tap the gear at the top. Settings should list Provider and key, Cleanup, Session, Keyboard, and About. Open About and check the version matches the TestFlight build. (7) Tell Claude what each step did.
```

- [ ] **Step 3: The notes**

In `ios/prd.json`, set IOS-012's `notes` to say what was built and verified, every ruling above, that the live check waits for LaBroi (`passes` stays false), and the final gate counts. Write only the notes field.

- [ ] **Step 4: Run the gates and commit**

```bash
git add ios/docs/iphone.md HANDOFF.md ios/prd.json
git commit -m "IOS-012: the iPhone docs answer where history is kept and how to delete it"
```
