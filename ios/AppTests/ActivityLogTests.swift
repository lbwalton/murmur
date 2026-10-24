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
