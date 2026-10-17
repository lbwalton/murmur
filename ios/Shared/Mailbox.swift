// SPDX-License-Identifier: GPL-3.0-only
// The mailbox (ios/prd.json IOS-008): small files in the app group shared
// by the app and the keyboard. The keyboard leaves its request for a take,
// with its own id; the app tells the keyboard how that take is going and,
// once it is done, its words. The keyboard claims the words once, which
// clears them, so a take never inserts twice and the shared drawer never
// keeps words longer than it must. Reads and writes are coordinated, since
// the app and the keyboard are two processes. A transform's ask carries
// the selection it rewrites (IOS-024).
import Foundation

struct MailboxEntry: Codable, Equatable, Sendable {
    enum Phase: String, Codable, Sendable {
        case listening, working, ready, nothing, failed
        /// Kept as a note instead of typed (IOS-023): the receipt says where.
        case noted
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
    /// Where a note landed, for the keyboard's receipt (IOS-023): inbox.
    var noted: String? = nil
    /// A rewrite's selection as it was (IOS-024), while the rewrite waits
    /// to be typed: once it is, the original takes the words' place, so
    /// Insert last brings it back.
    var original: String? = nil
    /// The line under the pill when the phase alone does not say why a
    /// take ended (IOS-024): why a selection stayed as it was.
    var line: String? = nil
}

/// A keyboard's ask for a take: its id, whether to keep it as a note, and
/// the selection a transform rewrites (IOS-024).
struct TakeAsk: Equatable, Sendable {
    let take: UUID
    let note: Bool
    var selection: String? = nil
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
        /// Missing in an ask from a keyboard before notes: a take to type.
        var note: Bool? = nil
        /// The selection a transform rewrites (IOS-024); missing otherwise.
        var selection: String? = nil
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
    /// and every later claim gets nil. A rewrite's original takes its place
    /// (IOS-024), for Insert last to bring back.
    func claim(_ take: UUID? = nil) -> String? {
        var words: String?
        coordinate(file, writing: true) { url in
            guard let data = try? Data(contentsOf: url),
                  var entry = try? JSONDecoder().decode(MailboxEntry.self, from: data),
                  take == nil || entry.take == take,
                  entry.phase == .ready, let ready = entry.words
            else { return }
            words = ready
            entry.words = entry.original
            entry.original = nil
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
            // Offered, not typed: nothing was replaced, so no original.
            entry.original = nil
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
            entry.original = nil
            try? JSONEncoder().encode(entry).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// Takes back an ask murmur never answered (IOS-024), so a selection
    /// never waits in the app group for a take that ended.
    func withdraw(_ take: UUID) {
        coordinate(requestFile, writing: true) { url in
            guard let data = try? Data(contentsOf: url), let request = try? JSONDecoder().decode(Request.self, from: data),
                  request.take == take
            else { return }
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// The keyboard asks for a take with its own id, just before it signals
    /// start; note keeps it as a note instead of typing it (IOS-023), and a
    /// selection makes it a transform of that text (IOS-024).
    func ask(_ take: UUID, note: Bool = false, selection: String? = nil, at: Date = .now) {
        coordinate(requestFile, writing: true) { url in
            try? JSONEncoder().encode(Request(take: take, at: at, note: note, selection: selection))
                .write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    /// The take the keyboard asked for, once, and only while the ask is
    /// fresh: a start that waited (murmur was not running) is dropped
    /// instead of recording a take no keyboard is waiting on.
    func answer(within seconds: TimeInterval, now: Date = .now) -> TakeAsk? {
        var ask: TakeAsk?
        coordinate(requestFile, writing: true) { url in
            defer { try? FileManager.default.removeItem(at: url) }
            guard let data = try? Data(contentsOf: url),
                  let request = try? JSONDecoder().decode(Request.self, from: data),
                  abs(now.timeIntervalSince(request.at)) <= seconds
            else { return }
            ask = TakeAsk(take: request.take, note: request.note ?? false, selection: request.selection)
        }
        return ask
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
