// SPDX-License-Identifier: GPL-3.0-only
// Text expansions, desktop's src/shared/expansions.ts in Swift: spoken
// triggers become saved snippets. Runs last, so triggers match clean
// formatted text and a snippet goes in exactly as written. One pass: a
// snippet is never rescanned, so one expansion can never set off another.
import Foundation

public struct ExpansionEntry: Codable, Sendable, Equatable {
    public var trigger: String
    public var text: String

    public init(trigger: String, text: String) {
        self.trigger = trigger
        self.text = text
    }
}

/// Replace each spoken trigger (any case, whole phrase) with its snippet.
/// At the same position the longest trigger wins, and matches never
/// overlap: one expansion per spot.
public func applyExpansions(_ text: String, _ entries: [ExpansionEntry]) -> String {
    let usable = entries.filter { !JS.trim($0.trigger).isEmpty && !JS.trim($0.text).isEmpty }
    guard !usable.isEmpty else { return text }

    struct Hit {
        let start: Int
        let end: Int
        let replacement: String
        let order: Int
    }
    var hits: [Hit] = []
    let whole = NSRange(location: 0, length: text.utf16.count)
    for entry in usable {
        for match in boundaryPattern(JS.trim(entry.trigger)).matches(in: text, range: whole) {
            let end = match.range.location + match.range.length
            hits.append(Hit(start: match.range.location, end: end, replacement: entry.text, order: hits.count))
        }
    }
    guard !hits.isEmpty else { return text }

    // Earliest first; at the same start the longest match wins.
    hits.sort { a, b in
        if a.start != b.start { return a.start < b.start }
        if a.end - a.start != b.end - b.start { return a.end - a.start > b.end - b.start }
        return a.order < b.order
    }
    let source = text as NSString
    var out = ""
    var cursor = 0
    for hit in hits where hit.start >= cursor {
        out += source.substring(with: NSRange(location: cursor, length: hit.start - cursor)) + hit.replacement
        cursor = hit.end
    }
    return out + source.substring(from: cursor)
}
