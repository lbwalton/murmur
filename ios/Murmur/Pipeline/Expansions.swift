import Foundation

// Spoken text expansions: say a trigger phrase, get the literal value.
// Applied at the very end of the pipeline, after transcription, corrections,
// and formatting, so the values never appear in any API request (hard
// constraint, proven by unit test). Whole-phrase, word-boundary,
// case-insensitive, matching desktop semantics.
struct Expansion: Equatable, Codable {
    let trigger: String
    let value: String
    var enabled: Bool = true
}

enum Expansions {
    static func apply(_ text: String, list: [Expansion]) -> String {
        guard !text.isEmpty, !list.isEmpty else { return text }
        var out = text
        for expansion in list where expansion.enabled {
            let trigger = expansion.trigger.trimmingCharacters(in: .whitespaces)
            guard !trigger.isEmpty, !expansion.value.isEmpty else { continue }
            let escaped = NSRegularExpression.escapedPattern(for: trigger)
            guard let re = try? NSRegularExpression(
                pattern: "(?<![A-Za-z0-9_])\(escaped)(?![A-Za-z0-9_])",
                options: [.caseInsensitive]
            ) else { continue }
            let range = NSRange(out.startIndex..., in: out)
            out = re.stringByReplacingMatches(
                in: out, range: range,
                withTemplate: NSRegularExpression.escapedTemplate(for: expansion.value)
            )
        }
        return out
    }
}
