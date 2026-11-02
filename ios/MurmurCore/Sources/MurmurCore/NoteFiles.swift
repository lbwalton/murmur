// SPDX-License-Identifier: GPL-3.0-only
// Notes (ios/prd.json IOS-023): where a note lands and how its entry
// reads, desktop's src/shared/notes.ts with the layout and the sorter's
// prompts and numbers from shared/sorter.json, so both platforms keep the
// same files: murmur/inbox/<date>.md for every note, murmur/todo.md and
// murmur/ideas.md for what a sort files, or the files a changed layout
// names, under desktop's path guard (resolveNotePath).
import Foundation

/// shared/sorter.json.
public struct SorterRules: Decodable, Sendable, Equatable {
    public struct Layout: Decodable, Sendable, Equatable {
        public let inbox: String
        public let entry: String
        public let tasks: String
        public let ideas: String
        public let heading: String

        public init(inbox: String, entry: String, tasks: String, ideas: String, heading: String) {
            self.inbox = inbox
            self.entry = entry
            self.tasks = tasks
            self.ideas = ideas
            self.heading = heading
        }
    }

    public let systemPrompt: [String]
    public let topicPrompt: [String]
    public let seamsPrompt: [String]
    public let leadsPrompt: [String]
    public let relationsPrompt: [String]
    public let contextHeader: String
    public let compareCap: Int
    public let topicMaxChars: Int
    public let topicMaxWords: Int
    public let leadWordsMax: Int
    public let keepPrompt: [String]
    public let keepWordsMax: Int
    public let notAnItem: [String]
    public let temperature: Double
    public let timeoutMs: Int
    public let receiptLineMax: Int
    public let pillPlaceMax: Int
    public let reminderMaxChars: Int
    public var layout: Layout
}

/// A note's moment as its files read it: the local date and time.
public struct NoteMoment: Codable, Sendable, Equatable, Hashable {
    /// yyyy-MM-dd
    public let date: String
    /// HH:mm
    public let time: String

    public init(date: String, time: String) {
        self.date = date
        self.time = time
    }

    /// The moment in the given calendar's time zone, Gregorian as
    /// desktop's files are, whatever calendar the iPhone shows.
    public init(_ when: Date, timeZone: TimeZone = .current) {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = timeZone
        let parts = gregorian.dateComponents([.year, .month, .day, .hour, .minute], from: when)
        func pad(_ n: Int?) -> String { String(format: "%02d", n ?? 0) }
        self.init(date: "\(parts.year ?? 1970)-\(pad(parts.month))-\(pad(parts.day))", time: "\(pad(parts.hour)):\(pad(parts.minute))")
    }

    /// The template tokens: date, time, datetime, year, month, day.
    public var values: [String: String] {
        let parts = date.split(separator: "-").map(String.init)
        return [
            "date": date, "time": time, "datetime": "\(date) \(time)",
            "year": parts.first ?? "", "month": parts.count > 1 ? parts[1] : "", "day": parts.count > 2 ? parts[2] : ""
        ]
    }
}

public enum NoteFiles {
    /// renderTemplate: {token} for every key in values; unknown tokens stay.
    public static func render(_ template: String, _ values: [String: String]) -> String {
        JS.replace(template, token) { match, source in
            let key = source.substring(with: match.range(at: 1))
            return values[key] ?? source.substring(with: match.range)
        }
    }

    /// The inbox file a note at this moment lands in, relative to the notes folder.
    public static func inbox(_ moment: NoteMoment, rules: SorterRules) -> String {
        render(rules.layout.inbox, moment.values)
    }

    /// renderNoteEntry: the time tokens first, the words last and once, so
    /// tokens spoken aloud never expand; one newline after it, or two when
    /// the template ends with a blank line.
    public static func entry(_ text: String, at moment: NoteMoment, template: String) -> String {
        let usable = template.contains("{text}") ? template : "## {time}\n\n{text}\n\n"
        let body = render(usable, moment.values).components(separatedBy: "{text}").joined(separator: text)
        // Code units: "\r\n" is one Character, so hasSuffix would miss it.
        let trailing = Array(body.utf16.suffix(2)) == [0x0A, 0x0A] ? "\n\n" : "\n"
        return JS.replace(body, trailingBreaks, with: "") + trailing
    }

    /// appendSeparator: what goes before an entry so it starts its own line.
    public static func separator(_ tail: String?) -> String {
        guard let tail, !tail.isEmpty else { return "" }
        return tail.utf16.last == 0x0A ? "" : "\n"
    }

    private static let token = JS.regex("\\{([a-z]+)\\}")
    private static let trailingBreaks = JS.regex("\\n+\(JS.end)")
}

/// Why a path template cannot be used: desktop's NotePathProblem.
public enum NotePathProblem: String, Error, Sendable, Equatable {
    case empty, absolute, escapes, `extension`, characters, reserved
}

public enum NotePath {
    /// resolveNotePath: a path template, relative to the notes folder, at a
    /// moment, with the time tokens filename-safe (10-32, not 10:32); the
    /// clean path it names, which can only point inside the folder, or why
    /// it cannot be used.
    public static func resolve(_ template: String, at moment: NoteMoment) -> Result<String, NotePathProblem> {
        var safe = moment.values
        safe["time"] = safe["time"].map { replaceFirst($0, ":", "-") }
        safe["datetime"] = safe["datetime"].map { replaceFirst($0, ":", "-") }
        // Code units, as JavaScript sees them: a slash before a combining
        // mark is one Character in Swift, and still a slash here.
        let units = JS.trim(NoteFiles.render(template, safe)).utf16.map { $0 == backslash ? slash : $0 }
        guard let first = units.first else { return .failure(.empty) }
        let rendered = String(decoding: units, as: UTF16.self)
        if first == slash || first == tilde || Sorter.test(drive, rendered) { return .failure(.absolute) }
        let segments = units.split(separator: slash).map { String(decoding: $0, as: UTF16.self) }
        if segments.contains(where: { JS.same($0, ".") || JS.same($0, "..") }) { return .failure(.escapes) }
        if segments.contains(where: { Sorter.test(badCharacters, $0) || Sorter.test(badEnding, $0) }) { return .failure(.characters) }
        if segments.contains(where: { Sorter.test(reservedName, $0) }) { return .failure(.reserved) }
        guard let last = segments.last, Sorter.test(allowedExtension, last) else { return .failure(.extension) }
        return .success(segments.joined(separator: "/"))
    }

    /// String.prototype.replace with a string: the first match only.
    private static func replaceFirst(_ text: String, _ target: String, _ replacement: String) -> String {
        guard let range = text.range(of: target, options: .literal) else { return text }
        return text.replacingCharacters(in: range, with: replacement)
    }

    private static let slash: UInt16 = 0x2F
    private static let backslash: UInt16 = 0x5C
    private static let tilde: UInt16 = 0x7E
    private static let drive = JS.regex("^[a-zA-Z]:")
    // Windows refuses these in any file name, so a vault synced across
    // platforms never holds a name one side cannot read.
    private static let badCharacters = JS.regex("[<>:\"|?*\\x{00}-\\x{1f}]")
    private static let badEnding = JS.regex("[. ]\(JS.end)")
    // Windows device names: an append into CON.md goes nowhere.
    private static let reservedName = JS.regex(
        "^(?:\(JS.caseless("con"))|\(JS.caseless("prn"))|\(JS.caseless("aux"))|\(JS.caseless("nul"))|\(JS.caseless("com"))[1-9]|\(JS.caseless("lpt"))[1-9])(?:\\.\(JS.dot)*)?\(JS.end)"
    )
    private static let allowedExtension = JS.regex("^\(JS.dot)+\\.(?:\(JS.caseless("md"))|\(JS.caseless("txt")))\(JS.end)")
}

/// The files Settings, Notes, File layout names, as templates: desktop's
/// Inbox file, Tasks file, and Ideas file.
public struct NoteLayout: Equatable, Sendable {
    public var inbox: String
    public var tasks: String
    public var ideas: String

    public init(inbox: String, tasks: String, ideas: String) {
        self.inbox = inbox
        self.tasks = tasks
        self.ideas = ideas
    }

    /// shared/sorter.json's own layout.
    public static func standard(_ rules: SorterRules) -> NoteLayout {
        NoteLayout(inbox: rules.layout.inbox, tasks: rules.layout.tasks, ideas: rules.layout.ideas)
    }

    /// The rules with this layout's files resolved at the moment. A file
    /// that cannot be used falls back to the bundled default on its own,
    /// as desktop's resolveTemplateOrDefault does.
    public func applied(to rules: SorterRules, at moment: NoteMoment) -> SorterRules {
        func file(_ template: String, _ standard: String) -> String {
            if case let .success(path) = NotePath.resolve(template, at: moment) { return path }
            if case let .success(path) = NotePath.resolve(standard, at: moment) { return path }
            return NoteFiles.render(standard, moment.values)
        }
        var applied = rules
        applied.layout = SorterRules.Layout(
            inbox: file(inbox, rules.layout.inbox), entry: rules.layout.entry,
            tasks: file(tasks, rules.layout.tasks), ideas: file(ideas, rules.layout.ideas), heading: rules.layout.heading
        )
        return applied
    }
}
