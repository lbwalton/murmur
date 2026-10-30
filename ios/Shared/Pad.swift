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

    /// What the pad says when the app does not answer, when another take
    /// is running, and when a take it was listening to stops answering.
    static let noAnswer = "Open murmur, then tap the pill again."
    static let busy = "murmur is busy with another take. Try again in a moment."
    static let stoppedAnswering = "murmur stopped answering. Open murmur to see why."
    /// While iOS opens murmur for the first take of a session (IOS-009), and
    /// when iOS will not.
    static let opening = "Opening murmur"
    /// Under the pill at rest (IOS-010): the pill itself carries no words.
    static let idleHint = "Tap the pill to talk"
    static let openRefused = "Open murmur to start"
    /// After Note in the pill's menu (IOS-023), until the take starts.
    static let noteNext = "Next take is a note"
    static let noteMenu = "Note"
    /// Under the pill once a note lands (LaBroi, 2026-10-18).
    static let openNote = "Open note"
    /// Transform in the pill's menu, offered with text selected (IOS-024),
    /// and what the pad says once the rewrite is in, or waits.
    static let transformMenu = "Transform"
    static let rewritten = "Rewritten. Insert last brings back the original."
    static let selectionMoved = "The selection changed, so nothing was replaced. Insert last has the rewrite."
    static let copyFirst = "For more than a sentence, tap Copy first, then Transform."

    /// The most a single sentence may hold for the keyboard to trust it
    /// whole, in UTF-16 units.
    static let wholeLimit = 300

    /// Whether the keyboard surely holds the whole selection. iOS gives a
    /// keyboard only the first and last sentences of a longer selection
    /// (Apple bug FB7789012, still so in 2026), and a rewrite of part of
    /// it would replace all of it, so only one sentence of modest length
    /// counts. Anything that could be a sentence break counts as one, by
    /// the pad's own rule and by Foundation's sentence finder alike.
    static func isWhole(_ selected: String) -> Bool {
        selected.utf16.count <= wholeLimit && pieces(selected).count <= 1 && sentences(selected) <= 1
    }

    /// The whole selection from the clipboard, when you copied it: the
    /// same text, or text that opens with the selection's first sentence,
    /// holds every piece the keyboard saw in order, and closes with its
    /// last, as iOS shortens it. Nil otherwise.
    static func whole(_ selected: String, clipboard: String?) -> String? {
        guard let clipboard, !clipboard.isEmpty else { return nil }
        if clipboard == selected { return clipboard }
        let parts = pieces(selected)
        guard let first = parts.first, let last = parts.last,
              clipboard.utf16.count > selected.utf16.count, clipboard.hasPrefix(first), clipboard.hasSuffix(last)
        else { return nil }
        let source = clipboard as NSString
        var from = 0
        for part in parts {
            let found = source.range(of: part, options: .literal, range: NSRange(location: from, length: source.length - from))
            guard found.location != NSNotFound else { return nil }
            from = found.location + found.length
        }
        return clipboard
    }

    /// When the keyboard last saw the selection change, by the clipboard's
    /// change count (IOS-024): a copy counts for a selection only when it
    /// came after, so an older clipboard that opens and closes alike is
    /// never taken for it. Reading the count never asks to paste.
    struct SelectionMark: Equatable {
        private(set) var selected: String?
        private(set) var count: Int

        init(selected: String?, count: Int) {
            self.selected = selected
            self.count = count
        }

        /// A selection the keyboard sees; only a new one moves the mark.
        mutating func see(_ selected: String?, count: Int) {
            guard selected != self.selected else { return }
            self.selected = selected
            self.count = count
        }

        /// murmur typed into the field: the clipboard now is older than
        /// what the field holds.
        mutating func typed(count: Int) {
            selected = nil
            self.count = count
        }

        func copiedSince(_ count: Int) -> Bool {
            count != self.count
        }
    }

    /// Where a rewrite goes when it comes back (IOS-024): in, over its
    /// selection; or, when the keyboard does not see that selection, one
    /// look again a moment later (a keyboard coming back from murmur may
    /// not have it yet), then Insert last.
    enum Landing: Equatable {
        case replace, lookAgain, offer
    }

    static func landing(replaces: Bool, lookedAgain: Bool) -> Landing {
        if replaces { return .replace }
        return lookedAgain ? .offer : .lookAgain
    }

    /// How many sentences Foundation finds in the text.
    static func sentences(_ text: String) -> Int {
        var count = 0
        let source = text as NSString
        source.enumerateSubstrings(in: NSRange(location: 0, length: source.length), options: .bySentences) { sentence, _, _, _ in
            if let sentence, !sentence.allSatisfy(\.isWhitespace) { count += 1 }
        }
        return count
    }

    /// The selection split wherever a sentence might end: after . ! ? an
    /// ellipsis, or a danda, with any closing quotes or brackets, before
    /// a space; right after a CJK or Devanagari full stop, space or not;
    /// and at every line break.
    static func pieces(_ text: String) -> [String] {
        let ends = "\\u3002\\uFF01\\uFF1F\\u0964\\u0965"
        let breaks = try! NSRegularExpression(
            pattern: "(?<=[.!?\\u2026\(ends)][\"'\\u201D\\u2019\\u00BB)\\]]{0,3})\\s+|(?<=[\(ends)])(?=\\S)|[\\n\\r\\u2028\\u2029]+"
        )
        let source = text as NSString
        var out: [String] = []
        var cursor = 0
        for match in breaks.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            out.append(source.substring(with: NSRange(location: cursor, length: match.range.location - cursor)))
            cursor = match.range.location + match.range.length
        }
        out.append(source.substring(from: cursor))
        return out.filter { !$0.allSatisfy(\.isWhitespace) }
    }

    /// An item in the pill's menu.
    struct MenuItem: Equatable {
        let title: String
        let symbol: String
        let on: Bool
    }

    /// Note is one switch (LaBroi, 2026-10-18): the same item, checked
    /// while the next take is a note.
    static func noteItem(armed: Bool) -> MenuItem {
        MenuItem(title: noteMenu, symbol: "note.text", on: armed)
    }

    /// Where Open note goes: murmur, which hands the note on to Obsidian
    /// when the notes are in a vault. A keyboard may open no app but its
    /// own (App Review Guidelines 4.4.1, checked 2026-10-18).
    static func noteLink(_ entry: MailboxEntry?, scheme: String = TakeLink.scheme) -> URL? {
        guard let entry, entry.phase == .noted, let file = entry.notedFile else { return nil }
        return NoteLink.murmur(file: file, scheme: scheme)
    }

    /// The note receipt (IOS-023): where the note landed.
    static func noted(_ place: String?) -> String {
        "Noted to \(place ?? "inbox")"
    }

    /// mine is the take this keyboard asked for, nil when it is not waiting
    /// on one; sameField is whether the cursor is still in the field the take
    /// began in; a keyboard that is not on screen does nothing, so it never
    /// takes words meant for the keyboard you are looking at.
    static func react(to entry: MailboxEntry?, mine: UUID?, sameField: Bool, visible: Bool) -> Reaction {
        guard visible, let entry else { return .none }
        let ours = entry.take == mine
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
            return .status(entry.line ?? "That take did not work. Open murmur to see why.")
        case .noted where ours:
            return .status(noted(entry.noted))
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

    /// The pill's stage after a refresh: the take's own while one is waited
    /// on; nil (leave it) while how the last take ended still shows; rest
    /// otherwise, so a keyboard that comes back with no take never keeps an
    /// old stage, least of all Recording.
    static func stage(waiting: Bool, phase: MailboxEntry.Phase?, ending: Bool) -> PillStage? {
        if waiting { return PillStage(phase) }
        return ending ? nil : .idle
    }

    /// The take this keyboard is waiting on, kept in the keyboard's own
    /// defaults: opening murmur closes the keyboard, and the one you swipe
    /// back to is a new one that has to know the take is its own.
    struct Waiting: Codable, Equatable {
        let take: UUID
        /// Started by opening murmur, so the words land in the field you come
        /// back to, and leaving the keyboard does not cancel it.
        let opened: Bool
        /// The field the take began in; for an opened take, the field the
        /// keyboard came back to.
        var field: UUID?
        let at: Date
        /// An opened take that a keyboard you came back to has taken over.
        private(set) var adopted = false
        /// The text a transform take rewrites (IOS-024), whole, and the
        /// selection as the keyboard saw it: the rewrite goes in only while
        /// that is still what is selected.
        var original: String? = nil
        var selected: String? = nil

        /// A take waited on longer than this is let go: its words, if any,
        /// wait as Insert last.
        static let life: TimeInterval = 10 * 60
        static let key = "waitingTake"

        static func load(from defaults: UserDefaults, now: Date = .now) -> Waiting? {
            guard let data = defaults.data(forKey: key), let waiting = try? JSONDecoder().decode(Waiting.self, from: data),
                  now.timeIntervalSince(waiting.at) < life
            else { return nil }
            return waiting
        }

        static func save(_ waiting: Waiting?, to defaults: UserDefaults) {
            if let waiting, let data = try? JSONEncoder().encode(waiting) {
                defaults.set(data, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }

        /// Whether the cursor is in the take's field. An opened take adopts
        /// the first field the keyboard comes back to.
        func sameField(as current: UUID?) -> Bool {
            field == nil || field == current
        }

        /// Whether a transform's rewrite goes in now: only while the text it
        /// rewrites is still what is selected, so it never lands anywhere else.
        func replaces(_ current: String?) -> Bool {
            original != nil && selected != nil && current == selected
        }

        /// The keyboard you came back to from murmur takes the opened take
        /// over, in the field it is in.
        mutating func adopt(_ current: UUID?) {
            field = current
            adopted = true
        }

        /// Whether leaving the keyboard drops this take: one still starting or
        /// listening is dropped, except on the trip to murmur an opened take
        /// is for. Once taken over, an opened take is dropped like any other,
        /// so a take you walked away from never runs on unattended.
        func cancelsOnLeave(phase: MailboxEntry.Phase?) -> Bool {
            (!opened || adopted) && (phase == nil || phase == .listening)
        }
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
