// SPDX-License-Identifier: GPL-3.0-only
// The custom dictionary, desktop's src/shared/dictionary.ts in Swift:
// spellings fixed in the raw transcript before formatting, then their
// exact casing re-asserted at the very end. Word-boundary safe: it only
// ever changes words that were actually spoken.
import Foundation

public struct DictionaryEntry: Codable, Sendable, Equatable {
    public var from: String
    public var to: String

    public init(from: String, to: String) {
        self.from = from
        self.to = to
    }
}

/// Whole-word or whole-phrase matcher, shared with expansions. \b only
/// works against word characters, so a term that starts or ends with a
/// symbol (c++) is bounded by whitespace or the edge instead.
func boundaryPattern(_ term: String) -> NSRegularExpression {
    let lead = term.utf16.first.map(JS.isWord) == true ? JS.boundary : "(?<!\(JS.nonSpace))"
    let tail = term.utf16.last.map(JS.isWord) == true ? JS.boundary : "(?!\(JS.nonSpace))"
    return JS.regex(lead + JS.caseless(term) + tail)
}

private func isUsable(_ entry: DictionaryEntry) -> Bool {
    !JS.trim(entry.from).isEmpty && !JS.trim(entry.to).isEmpty
}

/// Replace each entry's from (any case, whole words, phrases allowed)
/// with its to, as written. Longer phrases go first; empty entries are
/// skipped.
public func applyDictionary(_ text: String, _ entries: [DictionaryEntry]) -> String {
    let ordered = entries.enumerated().filter { isUsable($0.element) }.sorted { a, b in
        let la = a.element.from.utf16.count
        let lb = b.element.from.utf16.count
        return la != lb ? la > lb : a.offset < b.offset
    }
    var out = text
    for (_, entry) in ordered {
        out = JS.replace(out, boundaryPattern(JS.trim(entry.from)), with: JS.trim(entry.to))
    }
    return out
}

/// Re-assert each entry's exact casing wherever it appears, however
/// cased. Runs last, after capitalization and the cleanup model, so an
/// entry written in lowercase stays lowercase even at a sentence start.
public func enforceDictionaryCasing(_ text: String, _ entries: [DictionaryEntry]) -> String {
    var out = text
    for entry in entries where isUsable(entry) {
        out = JS.replace(out, boundaryPattern(JS.trim(entry.to)), with: JS.trim(entry.to))
    }
    return out
}

/// The dictionary as a spelling hint for transcription (ios/prd.json
/// IOS-013): its spellings, in order and each once, as one line the speech
/// model reads as words it has already heard. It stops at about 600
/// characters. The speech model reads at most the last 224 tokens of a
/// prompt (Groq's speech to text docs, checked 2026-10-12), so a long
/// dictionary's first spellings may go unread; the dictionary still fixes
/// them after transcription, and a provider that refuses the hint gets the
/// take again without it (Transcription.run). Nil for an empty dictionary.
public func transcriptionHint(_ entries: [DictionaryEntry], limit: Int = 600) -> String? {
    var seen = Set<String>()
    var words: [String] = []
    var length = 0
    for entry in entries where isUsable(entry) {
        let word = entry.to.trimmingCharacters(in: .whitespacesAndNewlines)
        guard seen.insert(word.lowercased()).inserted else { continue }
        guard length + word.count + 2 <= limit else { break }
        words.append(word)
        length += word.count + 2
    }
    return words.isEmpty ? nil : words.joined(separator: ", ") + "."
}
