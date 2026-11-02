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

    /// What deleting asked to be forgotten elsewhere.
    @MainActor final class Forgotten {
        var calls: [Set<String>?] = []
    }

    /// Deleting a take forgets its words everywhere else they wait (the
    /// Dictate screen, the keyboard's Insert last); Clear all forgets them all.
    @Test func deletingForgetsTheWordsEverywhere() {
        let forgotten = Forgotten()
        let history = History(store: store) { forgotten.calls.append($0) }
        let first = HistoryEntry(at: .now, durationMs: 1_000, words: "One.")
        let second = HistoryEntry(at: .now, durationMs: 1_000, words: "Two.")
        history.add(first)
        history.add(second)
        history.delete(second.id)
        #expect(forgotten.calls == [["Two."]])
        history.clear()
        #expect(forgotten.calls.count == 2)
        #expect(forgotten.calls.last == .some(nil))
    }

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

    /// The question that deletes a take shows which take: its words, cut
    /// short when long.
    @Test func theDeleteQuestionShowsTheTake() {
        #expect(HomeCopy.preview("Pick up oat milk.") == "Pick up oat milk.")
        let long = String(repeating: "word ", count: 30)
        #expect(HomeCopy.preview(long).count <= 83)
        #expect(HomeCopy.preview(long).hasSuffix("..."))
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
