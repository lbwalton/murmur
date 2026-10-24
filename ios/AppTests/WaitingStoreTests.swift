// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct WaitingStoreTests {
    let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
    let second = Wav.encodePcm16([Float](repeating: 0.1, count: 16_000), sampleRate: 16_000)
    let failure = TakeFailure(kind: "timeout", detail: "no response in 30 s")
    let saved = Date(timeIntervalSince1970: 1_790_000_000)

    @Test func aFailedTakeListsWithItsReasonAndLength() throws {
        let id = try store.save(second, startedAt: saved.addingTimeInterval(-3), failure: failure, now: saved)
        #expect(id == "recovery-1790000000000")
        #expect(store.list() == [WaitingTake(id: id, savedAt: saved, startedAt: saved.addingTimeInterval(-3), audioMs: 1000, failure: failure)])
        #expect(try store.audio(id) == second)
    }

    @Test func onlyTheNewest20AreKept() throws {
        for i in 0..<22 {
            try store.save(second, startedAt: saved, failure: failure, now: saved.addingTimeInterval(Double(i)))
        }
        let ids = store.list().map(\.id)
        #expect(ids.count == 20)
        #expect(ids.first == "recovery-1790000021000")
        #expect(ids.last == "recovery-1790000002000")
        let files = try FileManager.default.contentsOfDirectory(atPath: store.directory.path)
        #expect(files.count == 40)
    }

    /// Writable after first unlock, so a take that fails while the phone
    /// is locked still saves.
    @Test func filesAllowWritingAfterFirstUnlock() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        for name in ["\(id).wav", "\(id).json"] {
            let url = store.directory.appending(path: name)
            #expect(try url.resourceValues(forKeys: [.fileProtectionKey]).fileProtection == .completeUntilFirstUserAuthentication)
        }
    }

    @Test func theAudioStaysOutOfBackups() throws {
        try store.save(second, startedAt: saved, failure: failure, now: saved)
        #expect(try store.directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
    }

    @Test func aRetryThatFailsUpdatesTheReasonAndKeepsTheStart() throws {
        let id = try store.save(second, startedAt: saved.addingTimeInterval(-3), failure: failure, now: saved)
        try store.markFailed(id, .noSpeech)
        #expect(store.take(id)?.failure == .noSpeech)
        #expect(store.take(id)?.startedAt == saved.addingTimeInterval(-3))
    }

    @Test func removeDeletesAudioAndRecord() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        try store.remove(id)
        #expect(store.list().isEmpty)
        #expect(try FileManager.default.contentsOfDirectory(atPath: store.directory.path).isEmpty)
    }

    /// A take whose record is gone still lists, timed from its audio.
    @Test func aTakeWithoutItsRecordStillLists() throws {
        let id = try store.save(second, startedAt: saved, failure: failure, now: saved)
        try FileManager.default.removeItem(at: store.directory.appending(path: "\(id).json"))
        let take = try #require(store.take(id))
        #expect(take.failure == nil)
        #expect(take.startedAt == saved.addingTimeInterval(-1))
    }

    @Test(arguments: ["../settings", "recovery-12", "recovery-1790000000000/../x", "x"])
    func anIdThatIsNotATakeIsRefused(_ id: String) throws {
        try store.save(second, startedAt: saved, failure: failure, now: saved)
        #expect(store.take(id) == nil)
        #expect(throws: (any Error).self) { try store.audio(id) }
        try store.remove(id)
        #expect(store.list().count == 1)
    }

    @Test func anEmptyFolderListsNothing() {
        #expect(store.list().isEmpty)
    }
}
