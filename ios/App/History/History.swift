// SPDX-License-Identifier: GPL-3.0-only
// History (ios/prd.json IOS-012): every take that came back as words,
// kept only in the app's own container, never in the app group the
// keyboard shares and never in iCloud backups, so it never leaves the
// phone. One line per take, newest last on disk and first on screen.
import Foundation
import MurmurCore
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
    /// The local day it was spoken on, kept as it was then, as desktop
    /// keeps it, so a timezone change never moves a take to another day and
    /// a belt once earned stays earned (IOS-017). Nil on takes kept before.
    let day: String?
    /// The local hour it was spoken in, 0 to 23, kept the same way for the
    /// achievements that count the hour (IOS-018). Nil on takes kept before.
    let hour: Int?

    init(id: UUID = UUID(), at: Date, durationMs: Int, words: String, retried: Bool = false, calendar: Calendar = .current) {
        self.id = id
        self.at = at
        self.durationMs = max(0, durationMs)
        self.words = words
        wordCount = words.split(whereSeparator: \.isWhitespace).count
        self.retried = retried
        day = Self.dayKey(at, calendar: calendar)
        hour = Self.hourOf(at, calendar: calendar)
    }

    /// A local day as yyyy-MM-dd, the form desktop's dayKey writes: always
    /// in the Gregorian calendar, as desktop's dates are, whatever calendar
    /// the phone is set to. Only the given calendar's time zone counts.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// The local hour, 0 to 23, in the given calendar's time zone.
    static func hourOf(_ date: Date, calendar: Calendar = .current) -> Int {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        return gregorian.component(.hour, from: date)
    }

    /// The take as the achievements see it.
    var achievementEvent: AchievementEvent {
        AchievementEvent(at: rankEvent.at, words: wordCount, durationMs: durationMs, day: day ?? Self.dayKey(at), hour: hour ?? Self.hourOf(at))
    }

    /// The take as the painting a day sees it (IOS-019): its words paint
    /// the stroke and count toward the belts.
    var paintingEvent: PaintingEvent {
        PaintingEvent(at: rankEvent.at, day: day ?? Self.dayKey(at), hour: hour ?? Self.hourOf(at), strokeWords: wordCount)
    }

    /// The take as the belt math sees it.
    var rankEvent: RankEvent {
        RankEvent(at: Int64((at.timeIntervalSince1970 * 1000).rounded()), words: wordCount, day: day ?? Self.dayKey(at))
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

/// What happened to the takes, for what they made (IOS-019).
enum HistoryChange {
    /// A take landed: every take now kept.
    case added([HistoryEntry])
    /// One take was deleted: it, and every take still kept.
    case deleted(HistoryEntry, remaining: [HistoryEntry])
    /// Clear all.
    case cleared
}

/// The history the app shows: the store, read once and kept current.
@Observable @MainActor final class History {
    private(set) var entries: [HistoryEntry]
    @ObservationIgnored private let store: HistoryStore
    /// Forgets deleted words wherever else they wait: the given words, or
    /// all with nil.
    @ObservationIgnored private let forget: @MainActor (Set<String>?) -> Void
    /// Tells what the takes made (the painting a day, IOS-019) when takes
    /// land, one is deleted, or all are cleared.
    @ObservationIgnored private let changed: @MainActor (HistoryChange) -> Void

    init(store: HistoryStore, forget: @escaping @MainActor (Set<String>?) -> Void = { _ in }, changed: @escaping @MainActor (HistoryChange) -> Void = { _ in }) {
        self.store = store
        self.forget = forget
        self.changed = changed
        entries = store.list()
    }

    /// A take that came back as words. If the disk refuses it, it still
    /// shows until murmur closes.
    func add(_ entry: HistoryEntry) {
        try? store.append(entry)
        entries.insert(entry, at: 0)
        changed(.added(entries))
    }

    func delete(_ id: UUID) {
        let gone = entries.first { $0.id == id }
        try? store.remove(id)
        entries = store.list()
        if let gone {
            forget([gone.words])
            changed(.deleted(gone, remaining: entries))
        }
    }

    func clear() {
        try? store.clear()
        entries = []
        forget(nil)
        changed(.cleared)
    }
}

extension History {
    private static var shared: History?

    /// The app's one history. Deleting also forgets the words on the
    /// Dictate screen and any the keyboard still holds as Insert last.
    static func live() -> History {
        if let shared { return shared }
        let history = History(store: .standard) { words in
            TakeModel.live()?.forget(words)
            Mailbox.shared?.forget(words)
        } changed: { change in
            PaintingStore.live()?.apply(change)
            Looks.refresh(change.kept)
            // The recap says the day as it stands after this take.
            let kept = change.kept
            Task { await RecapNotifications.refresh(kept) }
        }
        // Takes kept before the painting a day paint their days too.
        PaintingStore.live()?.sync(history.entries)
        // A look chosen before its accent's color moved paints the new one.
        Looks.refresh(history.entries)
        shared = history
        return history
    }
}
