// SPDX-License-Identifier: GPL-3.0-only
// The painting book on iPhone (ios/prd.json IOS-019): a record per day,
// kept in the app's own container and out of backups, as desktop keeps
// paintings.json. Word counts only, never text. A painting is made from
// its takes: a take that lands paints the next stroke, deleting a take
// takes its stroke away, and Clear all clears the paintings, as desktop's
// does. A book that cannot be read is kept aside, never overwritten.
import Foundation
import MurmurCore
import Observation

/// The book on disk: this install's own seed and the paintings by day.
struct PaintingFile: Codable {
    /// Nil when it cannot be read: the days still stand, as desktop's do.
    var install: UInt32?
    var days: PaintingBook

    private enum Keys: String, CodingKey { case install, days }

    init(install: UInt32?, days: PaintingBook) {
        self.install = install
        self.days = days
    }

    /// A day that cannot be read is left out; the rest stand, as desktop
    /// reads its book.
    init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        install = try? box.decode(UInt32.self, forKey: .install)
        let days = (try? box.decode([String: Lenient].self, forKey: .days)) ?? [:]
        self.days = days.compactMapValues(\.record).filter { Paintings.isDayKey($0.key) }
    }

    func encode(to encoder: any Encoder) throws {
        var box = encoder.container(keyedBy: Keys.self)
        try box.encodeIfPresent(install, forKey: .install)
        try box.encode(days, forKey: .days)
    }

    private struct Lenient: Decodable {
        let record: PaintingRecord?

        init(from decoder: any Decoder) throws {
            record = try? PaintingRecord(from: decoder)
        }
    }
}

@Observable @MainActor final class PaintingStore {
    private(set) var book: PaintingBook
    @ObservationIgnored let install: UInt32
    @ObservationIgnored private let file: URL
    @ObservationIgnored private let ladder: [RankSpec]
    /// The file was there but could not be read this run: it is never
    /// written over, so nothing in it is lost.
    @ObservationIgnored private var unreadable = false

    static let standardFile = URL.applicationSupportDirectory.appending(path: "paintings", directoryHint: .isDirectory).appending(path: "paintings.json")

    init(file: URL, ladder: [RankSpec]) {
        self.file = file
        self.ladder = ladder
        var kept: PaintingFile?
        if FileManager.default.fileExists(atPath: file.path) {
            if let data = try? Data(contentsOf: file) {
                kept = try? JSONDecoder().decode(PaintingFile.self, from: data)
                // A file that is not a book is moved aside (paintings.json.bad),
                // so a rebuild from the takes never overwrites it.
                if kept == nil { Self.keepAside(file) }
            } else {
                unreadable = true
            }
        }
        install = kept?.install ?? UInt32.random(in: .min ... .max)
        book = kept?.days ?? [:]
    }

    private static func keepAside(_ file: URL) {
        let bad = file.deletingLastPathComponent().appending(path: file.lastPathComponent + ".bad")
        try? FileManager.default.removeItem(at: bad)
        try? FileManager.default.moveItem(at: file, to: bad)
    }

    /// What the takes made, as they change: a take that lands paints the
    /// next stroke, a deleted take takes its stroke away, and Clear all
    /// clears the paintings, as desktop's does.
    func apply(_ change: HistoryChange) {
        switch change {
        case let .added(entries): sync(entries)
        case let .deleted(take, remaining): forget(take, remaining: remaining)
        case .cleared: clear()
        }
    }

    /// A deleted take's stroke comes off its day's painting; a day with no
    /// takes left has no painting.
    func forget(_ take: HistoryEntry, remaining: [HistoryEntry]) {
        let day = take.paintingEvent.day
        guard var record = book[day] else { return }
        let left = remaining.map(\.paintingEvent).filter { $0.day == day }.sorted { $0.at < $1.at }
        if left.isEmpty {
            book[day] = nil
        } else {
            record.words = left.map(\.strokeWords)
            record.hour = Paintings.paintingHour(left.map(\.hour), target: record.target)
            book[day] = record
        }
        try? save()
    }

    /// Clear all: the paintings go with the takes; the book keeps its seed.
    func clear() {
        book = [:]
        try? save()
    }

    /// Brings the book up to date with these takes, and keeps it.
    func sync(_ entries: [HistoryEntry]) {
        let next = Paintings.sync(book, events: entries.map(\.paintingEvent), install: install, ladder: ladder)
        guard next != book || !FileManager.default.fileExists(atPath: file.path) else { return }
        book = next
        try? save()
    }

    private func save() throws {
        guard !unreadable else { return }
        let folder = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = folder
        try url.setResourceValues(values)
        let data = try JSONEncoder().encode(PaintingFile(install: install, days: book))
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

extension PaintingStore {
    private static var shared: PaintingStore?

    /// The app's one book; nil only if the app's own ladder could not be read.
    static func live() -> PaintingStore? {
        if let shared { return shared }
        guard let ladder = JourneyRules.live?.ranks.ranks else { return nil }
        let store = PaintingStore(file: standardFile, ladder: ladder)
        shared = store
        return store
    }
}
