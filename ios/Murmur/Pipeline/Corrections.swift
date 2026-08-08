import Foundation

// The correction learning loop, a straight port of desktop
// src/main/corrections.js: when the user edits a transcript in History,
// the fix is diffed against what was heard, substitution pairs are kept,
// applied to every future transcript (case-insensitive, whole-word, the
// boundary class exactly [A-Za-z0-9_], the JavaScript \w), and pairs
// fixed twice promote their corrected term into the dictionary.
struct CorrectionPair: Equatable, Codable {
    let from: String
    let to: String
    var count: Int = 1
    var ts: Date = .distantPast
}

enum Corrections {

    static let maxPairs = 100
    static let maxRunWords = 4

    static func apply(_ text: String, pairs: [CorrectionPair]) -> String {
        var out = text
        for pair in pairs where !pair.from.isEmpty && !pair.to.isEmpty {
            let escaped = NSRegularExpression.escapedPattern(for: pair.from)
            guard let re = try? NSRegularExpression(
                pattern: "(?<![A-Za-z0-9_])\(escaped)(?![A-Za-z0-9_])",
                options: [.caseInsensitive]
            ) else { continue }
            let range = NSRange(out.startIndex..., in: out)
            out = re.stringByReplacingMatches(
                in: out, range: range,
                withTemplate: NSRegularExpression.escapedTemplate(for: pair.to)
            )
        }
        return out
    }

    // Case-sensitive word diff over the LCS, so "cloud code" -> "Claude
    // Code" comes out as one phrase-level pair instead of a risky
    // single-word swap. Semantics pinned by the shared diff vectors.
    static func diffPairs(oldText: String, newText: String) -> [(from: String, to: String)] {
        let a = oldText.split(whereSeparator: \.isWhitespace).map(String.init)
        let b = newText.split(whereSeparator: \.isWhitespace).map(String.init)
        var dp = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
        for i in stride(from: a.count - 1, through: 0, by: -1) {
            for j in stride(from: b.count - 1, through: 0, by: -1) {
                dp[i][j] = a[i] == b[j] ? dp[i + 1][j + 1] + 1 : max(dp[i + 1][j], dp[i][j + 1])
            }
        }
        var pairs: [(from: String, to: String)] = []
        var fromRun: [String] = []
        var toRun: [String] = []
        func flush() {
            if !fromRun.isEmpty && !toRun.isEmpty {
                let from = fromRun.joined(separator: " ")
                let to = toRun.joined(separator: " ")
                let caseOnly = from.lowercased() == to.lowercased()
                // A single-word capitalization tweak is style, not a
                // mishearing, and would make a dangerously broad rule.
                if from != to && !(caseOnly && fromRun.count == 1)
                    && fromRun.count <= maxRunWords && toRun.count <= maxRunWords {
                    pairs.append((from, to))
                }
            }
            fromRun = []
            toRun = []
        }
        var i = 0
        var j = 0
        while i < a.count && j < b.count {
            if a[i] == b[j] {
                flush()
                i += 1
                j += 1
            } else if dp[i + 1][j] >= dp[i][j + 1] {
                fromRun.append(a[i])
                i += 1
            } else {
                toRun.append(b[j])
                j += 1
            }
        }
        while i < a.count { fromRun.append(a[i]); i += 1 }
        while j < b.count { toRun.append(b[j]); j += 1 }
        flush()
        return pairs
    }

    // Merges fresh pairs into the stored list, bumping counts for repeats
    // and promoting twice-fixed terms into the dictionary.
    static func learn(oldText: String, newText: String,
                      corrections: [CorrectionPair], dictionary: [String],
                      now: Date = Date())
        -> (corrections: [CorrectionPair], dictionary: [String], promoted: [String]) {
        var corrections = corrections
        var dictionary = dictionary
        var promoted: [String] = []
        for pair in diffPairs(oldText: oldText, newText: newText) {
            let index = corrections.firstIndex {
                $0.from.lowercased() == pair.from.lowercased() && $0.to == pair.to
            }
            let entry: CorrectionPair
            if let index {
                corrections[index].count += 1
                corrections[index].ts = now
                entry = corrections[index]
            } else {
                entry = CorrectionPair(from: pair.from, to: pair.to, count: 1, ts: now)
                corrections.append(entry)
            }
            if entry.count >= 2 && !dictionary.contains(where: { $0.lowercased() == pair.to.lowercased() }) {
                dictionary.append(pair.to)
                promoted.append(pair.to)
            }
        }
        corrections.sort { $0.ts > $1.ts }
        if corrections.count > maxPairs { corrections.removeLast(corrections.count - maxPairs) }
        return (corrections, dictionary, promoted)
    }
}
