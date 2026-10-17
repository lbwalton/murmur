// SPDX-License-Identifier: GPL-3.0-only
// Takes that were recorded but not transcribed (ios/prd.json IOS-006),
// kept as desktop keeps them (src/main/transcribe/recovery.ts): the WAV
// in the app's own container beside a small record of why it failed, the
// newest 20 kept. The files allow writing after first unlock, so a take
// that fails while the phone is locked still saves, and they stay out of
// backups, so the audio stays on this iPhone.
import Foundation
import MurmurCore

/// Why a take is waiting: a transcription failure kind (auth, network,
/// timeout, server, badrequest), or nospeech when a retry heard nothing.
struct TakeFailure: Codable, Equatable, Error, Sendable {
    let kind: String
    let detail: String

    static let noKey = TakeFailure(kind: "auth", detail: "no API key configured")
    static let noSpeech = TakeFailure(kind: "nospeech", detail: "no speech in the audio")
}

/// A waiting take as the screen sees it. No audio, no words.
struct WaitingTake: Identifiable, Equatable, Sendable {
    let id: String
    /// When the take failed and was saved.
    let savedAt: Date
    let startedAt: Date
    let audioMs: Int
    /// Nil when its record is missing or unreadable.
    let failure: TakeFailure?
}

struct WaitingStore: Sendable {
    static let keep = 20
    let directory: URL

    /// murmur's own container, never the app group the keyboard reads.
    static let standard = WaitingStore(directory: URL.applicationSupportDirectory.appending(path: "recovery", directoryHint: .isDirectory))

    private struct Record: Codable {
        let startedAt: Int64
        let failure: TakeFailure
    }

    private static func milliseconds(_ date: Date) -> Int64 { Int64((date.timeIntervalSince1970 * 1000).rounded()) }

    /// recovery- and 10 to 16 digits, so no id can name a path elsewhere.
    private static func isId(_ id: String) -> Bool {
        guard id.hasPrefix("recovery-") else { return false }
        let digits = id.dropFirst("recovery-".count)
        return (10...16).contains(digits.count) && digits.allSatisfy { $0.isASCII && $0.isNumber }
    }

    private func wav(_ id: String) -> URL { directory.appending(path: "\(id).wav") }
    private func record(_ id: String) -> URL { directory.appending(path: "\(id).json") }

    /// Saves a failed take and its record, then keeps only the newest 20.
    @discardableResult
    func save(_ audio: Data, startedAt: Date, failure: TakeFailure, now: Date = .now) throws -> String {
        try prepare()
        let id = "recovery-\(Self.milliseconds(now))"
        try audio.write(to: wav(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        try write(Record(startedAt: Self.milliseconds(startedAt), failure: failure), id)
        prune()
        return id
    }

    /// Every waiting take, newest first.
    func list() -> [WaitingTake] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names
            .filter { $0.hasSuffix(".wav") }
            .compactMap { take(String($0.dropLast(4))) }
            .sorted { $0.savedAt > $1.savedAt }
    }

    /// One waiting take, or nil when its audio is gone or the id is not one.
    func take(_ id: String) -> WaitingTake? {
        guard Self.isId(id), let saved = Int64(id.dropFirst("recovery-".count)),
              let audio = try? Data(contentsOf: wav(id), options: .mappedIfSafe)
        else { return nil }
        let savedAt = Date(timeIntervalSince1970: Double(saved) / 1000)
        let audioMs = Wav.durationMs(audio)
        let stored = (try? Data(contentsOf: record(id))).flatMap { try? JSONDecoder().decode(Record.self, from: $0) }
        let startedAt = stored.map { Date(timeIntervalSince1970: Double($0.startedAt) / 1000) } ?? savedAt.addingTimeInterval(-Double(audioMs) / 1000)
        return WaitingTake(id: id, savedAt: savedAt, startedAt: startedAt, audioMs: audioMs, failure: stored?.failure)
    }

    func audio(_ id: String) throws -> Data {
        guard Self.isId(id) else { throw CocoaError(.fileNoSuchFile) }
        return try Data(contentsOf: wav(id))
    }

    /// Records why a retry failed, keeping when the take began.
    func markFailed(_ id: String, _ failure: TakeFailure) throws {
        guard let take = take(id) else { return }
        try write(Record(startedAt: Self.milliseconds(take.startedAt), failure: failure), id)
    }

    /// Deletes a take's audio and record.
    func remove(_ id: String) throws {
        guard Self.isId(id) else { return }
        for url in [wav(id), record(id)] where FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    private func prepare() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = directory
        try url.setResourceValues(values)
    }

    private func write(_ record: Record, _ id: String) throws {
        try JSONEncoder().encode(record).write(to: self.record(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Keeps the newest 20 takes (names sort by time) and drops any
    /// record whose audio is gone.
    private func prune() {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        let takes = names.filter { $0.hasSuffix(".wav") }.map { String($0.dropLast(4)) }.filter(Self.isId).sorted()
        let kept = Set(takes.suffix(Self.keep))
        for name in names {
            let id = name.hasSuffix(".wav") || name.hasSuffix(".json") ? String(name.prefix { $0 != "." }) : ""
            guard Self.isId(id), !kept.contains(id) else { continue }
            try? FileManager.default.removeItem(at: directory.appending(path: name))
        }
    }
}
