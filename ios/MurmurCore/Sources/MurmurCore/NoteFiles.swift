// SPDX-License-Identifier: GPL-3.0-only
// Notes (ios/prd.json IOS-023): where a note lands and how its entry
// reads, desktop's src/shared/notes.ts with the layout and the sorter's
// prompts and numbers from shared/sorter.json, so both platforms keep the
// same files: murmur/inbox/<date>.md for every note, murmur/todo.md and
// murmur/ideas.md for what a sort files.
import Foundation

/// shared/sorter.json.
public struct SorterRules: Decodable, Sendable, Equatable {
    public struct Layout: Decodable, Sendable, Equatable {
        public let inbox: String
        public let entry: String
        public let tasks: String
        public let ideas: String
        public let heading: String
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
    public let temperature: Double
    public let timeoutMs: Int
    public let receiptLineMax: Int
    public let pillPlaceMax: Int
    public let reminderMaxChars: Int
    public let layout: Layout
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
