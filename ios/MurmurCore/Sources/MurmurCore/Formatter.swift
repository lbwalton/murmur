// SPDX-License-Identifier: GPL-3.0-only
// The deterministic formatter, desktop's src/shared/formatter.ts in
// Swift. Pure, no IO: the rules come from shared/format-spec.json and the
// proof from shared/test-vectors.json. The cleanup model (IOS-010) falls
// back to this output on any failure.
import Foundation

public struct FormatSpec: Decodable, Sendable {
    public struct Words: Decodable, Sendable { public let words: [String] }
    public struct Triggers: Decodable, Sendable { public let triggers: [String] }
    public struct Phrases: Decodable, Sendable { public let map: [String: String] }
    public struct Numbers: Decodable, Sendable {
        public let units: [String: Int]
        public let tens: [String: Int]
    }
    public struct Terminal: Decodable, Sendable {
        public let minWords: Int
        public let append: String
    }

    public let fillers: Words
    public let scratchThat: Triggers
    public let spokenPunctuation: Phrases
    public let listCommands: Phrases
    public let numbers: Numbers
    public let terminalPunctuation: Terminal
}

public struct FormatOptions: Sendable, Equatable {
    public enum Level: String, Codable, Sendable { case off, light, full }
    public enum Numbers: String, Codable, Sendable { case auto, words, digits }

    public var level: Level
    public var numbers: Numbers
    /// The smart lists setting: spoken list commands convert only when true.
    public var smartLists: Bool

    public init(level: Level = .full, numbers: Numbers = .auto, smartLists: Bool = false) {
        self.level = level
        self.numbers = numbers
        self.smartLists = smartLists
    }
}

/// Format a raw transcript deterministically according to the spec.
public func formatTranscript(_ raw: String, options: FormatOptions, spec: FormatSpec) -> String {
    let trimmed = JS.trim(raw)
    if options.level == .off { return trimmed }

    var out = removeFillers(trimmed, spec.fillers.words)

    if options.level == .full {
        // Punctuation first: scratch that needs real sentence boundaries
        // to know where the current sentence starts.
        out = applySpokenPunctuation(out, spec.spokenPunctuation.map)
        // List commands share spoken punctuation's matching rules and stage.
        if options.smartLists { out = applySpokenPunctuation(out, spec.listCommands.map) }
        out = applyScratchThat(out, spec.scratchThat.triggers)
    }

    out = fixWhitespace(out)

    if options.level == .full && options.numbers == .digits {
        out = wordsToDigits(out, units: spec.numbers.units, tens: spec.numbers.tens)
    }
    if options.level == .full && options.numbers == .words {
        out = digitsToWords(out, units: spec.numbers.units)
    }

    out = capitalizeSentences(out)

    if options.level == .full {
        out = ensureTerminal(
            out,
            minWords: spec.terminalPunctuation.minWords,
            append: spec.terminalPunctuation.append,
            smartLists: options.smartLists
        )
    }
    return out
}

func removeFillers(_ text: String, _ words: [String]) -> String {
    guard !words.isEmpty else { return text }
    let names = words.map(JS.caseless).joined(separator: "|")
    let pattern = "(?:^|\(JS.space))(?:\(names))(?=\(JS.space)|[.,!?;:]|\(JS.end))"
    return JS.replace(text, JS.regex(pattern), with: "")
}

func applyScratchThat(_ text: String, _ triggers: [String]) -> String {
    var out = text
    while true {
        var earliest: NSRange?
        for trigger in triggers {
            let regex = JS.regex("\(JS.boundary)\(JS.caseless(trigger))\(JS.boundary)[.,]?")
            if let match = regex.firstMatch(in: out, range: NSRange(location: 0, length: out.utf16.count)),
                earliest.map({ match.range.location < $0.location }) ?? true
            {
                earliest = match.range
            }
        }
        guard let hit = earliest else { return out }
        // Delete from the start of the current sentence through the trigger.
        let source = out as NSString
        let before = source.substring(to: hit.location) as NSString
        let boundary = [".", "!", "?", "\n"].map { JS.lastIndex(of: $0, in: before) }.max() ?? -1
        let sentenceStart = boundary + 1
        let joined = source.substring(to: sentenceStart) + " " + source.substring(from: hit.location + hit.length)
        out = JS.replace(joined, JS.regex(" {2,}"), with: " ")
    }
}

/// Longest phrase first. Equal lengths go by symbol, then by phrase, so
/// every platform keeps one order (format-spec.json); for the shipped map
/// that is the file's own order (comma before colon, new paragraph before
/// question mark), and it matters when two of them are spoken side by side.
func phrasesLongestFirst(_ map: [String: String]) -> [(phrase: String, symbol: String)] {
    map.map { (phrase: $0.key, symbol: $0.value) }.sorted { a, b in
        let la = a.phrase.utf16.count
        let lb = b.phrase.utf16.count
        if la != lb { return la > lb }
        if !JS.same(a.symbol, b.symbol) { return JS.less(a.symbol, b.symbol) }
        return JS.less(a.phrase, b.phrase)
    }
}

func applySpokenPunctuation(_ text: String, _ map: [String: String]) -> String {
    var out = text
    for (phrase, symbol) in phrasesLongestFirst(map) {
        let pattern = "(?:^|\(JS.space))\(JS.caseless(phrase))(?=\(JS.space)|[.,]|\(JS.end))[.,]?"
        out = JS.replace(out, JS.regex(pattern), with: symbol)
    }
    return out
}

func fixWhitespace(_ text: String) -> String {
    var out = JS.replace(text, JS.regex("[ \\t]+"), with: " ")
    out = JS.replace(out, JS.regex(" ?([.,!?;:]) ?")) { match, source in
        source.substring(with: match.range(at: 1)) + " "
    }
    out = JS.replace(out, JS.regex("([.,!?;:]) (?=[.,!?;:])")) { match, source in
        source.substring(with: match.range(at: 1))
    }
    out = JS.replace(out, JS.regex(" ?\\n ?"), with: "\n")
    out = JS.replace(out, JS.regex("\\n{3,}"), with: "\n\n")
    out = JS.replace(out, JS.regex(" +\(JS.lineEnd)"), with: "")
    out = JS.replace(out, JS.regex("\(JS.lineStart) +"), with: "")
    return JS.trim(out)
}

func wordsToDigits(_ text: String, units: [String: Int], tens: [String: Int]) -> String {
    let tensNames = tens.keys.sorted(by: JS.less).map(JS.caseless).joined(separator: "|")
    let unitNames = units.filter { (1...9).contains($0.value) }.keys.sorted(by: JS.less).map(JS.caseless).joined(separator: "|")
    let pairs = JS.regex("\(JS.boundary)(\(tensNames))[ -](\(unitNames))\(JS.boundary)")
    var out = JS.replace(text, pairs) { match, source in
        let ten = tens[source.substring(with: match.range(at: 1)).lowercased()]
        let unit = units[source.substring(with: match.range(at: 2)).lowercased()]
        // JS.caseless matches only what JavaScript's i flag does, so every
        // match lowercases to a known name; this guard is only a safety net.
        guard let ten, let unit else { return source.substring(with: match.range) }
        return String(ten + unit)
    }
    let allNames = Set(units.keys).union(tens.keys).sorted(by: JS.less).map(JS.caseless).joined(separator: "|")
    out = JS.replace(out, JS.regex("\(JS.boundary)(\(allNames))\(JS.boundary)")) { match, source in
        let word = source.substring(with: match.range)
        guard let value = units[word.lowercased()] ?? tens[word.lowercased()] else { return word }
        return String(value)
    }
    return out
}

func digitsToWords(_ text: String, units: [String: Int]) -> String {
    // format-spec.json gives every unit its own value, so one word per value.
    var byValue: [Int: String] = [:]
    for (word, value) in units.sorted(by: { JS.less($0.key, $1.key) }) where byValue[value] == nil {
        byValue[value] = word
    }
    return JS.replace(text, JS.regex("\(JS.boundary)([0-9]{1,2})\(JS.boundary)")) { match, source in
        let digits = source.substring(with: match.range)
        return Int(digits).flatMap { byValue[$0] } ?? digits
    }
}

func capitalizeSentences(_ text: String) -> String {
    var out = JS.replace(text, JS.regex("^\(JS.space)*([a-z])"), all: false) { match, source in
        source.substring(with: match.range).uppercased()
    }
    out = JS.replace(out, JS.regex("([.!?][\"')\\]]?\(JS.space)+|\\n+\(JS.space)*)([a-z])")) { match, source in
        source.substring(with: match.range(at: 1)) + source.substring(with: match.range(at: 2)).uppercased()
    }
    return out
}

func ensureTerminal(_ text: String, minWords: Int, append: String, smartLists: Bool) -> String {
    if text.isEmpty { return text }
    // A list never gets a period stapled onto its last item. Gated on the
    // setting: with smart lists off, even a raw transcript that happens to
    // start a line with a dash formats exactly as before.
    if smartLists {
        let source = text as NSString
        let lastLine = source.substring(from: JS.lastIndex(of: "\n", in: source) + 1)
        if lastLine.utf16.starts(with: "- ".utf16) { return text }
    }
    if JS.wordCount(text) < minWords { return text }
    if let last = text.utf16.last, JS.isWord(last) || last == 0x29 { return text + append }
    return text
}
