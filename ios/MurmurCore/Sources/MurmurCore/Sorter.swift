// SPDX-License-Identifier: GPL-3.0-only
// The note sorter's pure half (ios/prd.json IOS-023): desktop's
// src/shared/sorter.ts in Swift. The model only labels numbered
// sentences, votes on cut points the code found, and points at word
// numbers; murmur copies the spoken words into the files itself, so
// nothing on this path can reword a note. A reply that is anything but a
// complete labeling is rejected whole and the note stays in the inbox.
// shared/notes-vectors.json and shared/sort-scenarios.json keep these
// rules giving desktop's answers.
import Foundation

public enum SortLabel: String, Codable, Sendable, CaseIterable {
    case task, idea, note
}

/// A lead-in: the words that introduce a run of items ("I need to buy"),
/// filed once with the items nested under it. group tells two runs with
/// the same words apart.
public struct LeadIn: Codable, Equatable, Sendable {
    public let text: String
    public let group: String

    public init(text: String, group: String) {
        self.text = text
        self.group = group
    }
}

/// Where a sentence could be cut: the seam text's span, in UTF-16 units.
public struct Seam: Equatable, Sendable {
    public let start: Int
    public let end: Int
}

/// The first and last word worth filing in a sentence, word numbers
/// among keepWords (IOS-033, desktop US-115).
public struct KeepSpan: Equatable, Sendable {
    public let first: Int
    public let last: Int

    public init(first: Int, last: Int) {
        self.first = first
        self.last = last
    }
}

/// A complete labeling, with whatever votes rode along.
public struct SortVerdict: Equatable, Sendable {
    public let labels: [SortLabel]
    /// Confirmed seam numbers per sentence number.
    public let seams: [Int: [Int]]
    /// Relation votes per sentence number.
    public let relations: [Int: RelationVote]
    /// Where each run's first item begins, per sentence number; nil when
    /// no sentence offered lead words.
    public let starts: [Int: Int]?
    /// The words worth filing per task or idea sentence; nil when no
    /// sentence offered words to keep, empty when every one files whole.
    public var keep: [Int: KeepSpan]? = nil
}

public enum SortReading: Equatable, Sendable {
    case labeled(SortVerdict)
    case rejected(String)
}

public enum Sorter {
    /// The units the model labels, and the lead-in each list line sits
    /// under: one unit per line, a prose line cut at its sentence ends, a
    /// list line kept whole, and a prose line ending in a colon right above
    /// list lines taken as their lead-in instead of a unit.
    public static func splitUnits(_ text: String) -> (sentences: [String], leads: [LeadIn?]) {
        var sentences: [String] = []
        var leads: [LeadIn?] = []
        let lines = text.components(separatedBy: "\n").map(JS.trim).filter { !$0.isEmpty }
        var heading: LeadIn?
        for (index, line) in lines.enumerated() {
            if test(listLine, line) {
                sentences.append(line)
                leads.append(heading)
                continue
            }
            heading = nil
            let headsList = index + 1 < lines.count && test(listLine, lines[index + 1])
            let pieces = split(line, sentenceEnd).map(JS.trim).filter { !$0.isEmpty }
            var carry = ""
            var out: [String] = []
            for piece in pieces {
                let joined = carry.isEmpty ? piece : "\(carry) \(piece)"
                if test(abbreviation, joined) {
                    carry = joined
                    continue
                }
                out.append(joined)
                carry = ""
            }
            if !carry.isEmpty { out.append(carry) }
            if headsList, let last = out.last, last.utf16.last == 0x3A {
                out.removeLast()
                heading = LeadIn(text: last, group: "heading-\(index)")
            }
            for sentence in out {
                sentences.append(sentence)
                leads.append(nil)
            }
        }
        return (sentences, leads)
    }

    /// The sentences, numbered from one, as the model receives them.
    public static func numberedList(_ sentences: [String]) -> String {
        sentences.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
    }

    /// Whether a reply is a complete labeling of count sentences: every
    /// number exactly once, only the three labels. The seam, relation,
    /// start, and keep votes ride the same object under reserved keys,
    /// allowed only when offered; a bad vote is no vote for that sentence alone.
    public static func validate(
        _ count: Int, _ candidate: String, seamCounts: [Int] = [], items: Int = 0, leadCounts: [Int] = [], keepCounts: [Int] = []
    ) -> SortReading {
        let text = JS.trim(candidate)
        if text.isEmpty { return .rejected("empty") }
        guard let parsed = JSValue.parse(extractObject(text) ?? text) else { return .rejected("not json") }
        guard let object = parsed.object else { return .rejected("not an object") }
        let offeredSeams = seamCounts.contains { $0 > 0 }
        let offeredItems = items > 0
        let offeredLeads = leadCounts.contains { $0 > 0 }
        let offeredKeep = keepCounts.contains { $0 > 0 }
        var reserved: Set<String> = []
        if offeredSeams { reserved.insert("seams") }
        if offeredItems { reserved.insert("relations") }
        if offeredLeads { reserved.insert("starts") }
        if offeredKeep { reserved.insert("keep") }
        let expected = Set((0..<max(0, count)).map { String($0 + 1) })
        let numbered = object.entries.filter { !reserved.contains($0.key) }
        for entry in numbered where !expected.contains(entry.key) {
            return .rejected("extra sentences")
        }
        if numbered.count < count { return .rejected("missing sentences") }
        var labels: [SortLabel] = []
        for i in stride(from: 1, through: count, by: 1) {
            let label = object[String(i)]?.string.map { JS.trim($0).lowercased() } ?? ""
            guard let known = SortLabel(rawValue: label) else { return .rejected("bad label") }
            labels.append(known)
        }
        let seams = offeredSeams ? readSeamVotes(object["seams"], seamCounts: seamCounts) : [:]
        let relations = offeredItems ? Compare.readRelationVotes(object["relations"], sentenceCount: count, itemCount: items) : [:]
        let starts = offeredLeads ? readLeadStarts(object["starts"], leadCounts: leadCounts) : nil
        let keep = offeredKeep ? readKeepSpans(object["keep"], keepCounts: keepCounts) : nil
        return .labeled(SortVerdict(labels: labels, seams: seams, relations: relations, starts: starts, keep: keep))
    }

    /// The text from the first { to the last }, fences and chatter dropped.
    static func extractObject(_ candidate: String) -> String? {
        let source = candidate as NSString
        let start = source.range(of: "{", options: .literal).location
        let end = source.range(of: "}", options: [.literal, .backwards]).location
        guard start != NSNotFound, end != NSNotFound, end > start else { return nil }
        return source.substring(with: NSRange(location: start, length: end - start + 1))
    }

    // MARK: Seams

    /// Candidate seams, in order: none in a list line, none where either
    /// side has no words of its own, none inside a quote or parenthesis.
    public static func findSeams(_ sentence: String) -> [Seam] {
        if test(listLine, sentence) { return [] }
        let source = sentence as NSString
        var seams: [Seam] = []
        for match in seam.matches(in: sentence, range: NSRange(location: 0, length: source.length)) {
            let start = match.range.location
            let end = start + match.range.length
            let left = source.substring(to: start)
            let right = source.substring(from: end)
            guard hasWords(left), hasWords(right), !insideQuoteOrParen(left) else { continue }
            seams.append(Seam(start: start, end: end))
        }
        return seams
    }

    /// The two sides of a seam.
    public static func sides(_ sentence: String, _ seam: Seam) -> (left: String, right: String) {
        let source = sentence as NSString
        return (JS.trim(source.substring(to: seam.start)), JS.trim(source.substring(from: seam.end)))
    }

    /// Cut at the confirmed seams only; a vote for a seam that does not
    /// exist leaves the whole sentence as one line. Fillers alone between
    /// two cuts ("buy milk, oh well, call Bob") are no item either: the
    /// cut after them goes, so they ride with the next piece (US-114).
    public static func cut(_ sentence: String, _ seams: [Seam], confirmed: [Int]) -> [String] {
        if confirmed.contains(where: { $0 < 1 || $0 > seams.count }) { return [sentence] }
        var seen: [Int] = []
        for n in confirmed where !seen.contains(n) { seen.append(n) }
        var chosen = seen.map { seams[$0 - 1] }.sorted { $0.start < $1.start }
        var k = fillerPiece(sentence, chosen)
        while k != -1 && !chosen.isEmpty {
            chosen.remove(at: min(k, chosen.count - 1))
            k = fillerPiece(sentence, chosen)
        }
        let source = sentence as NSString
        var pieces: [String] = []
        var cursor = 0
        for seam in chosen {
            pieces.append(source.substring(with: NSRange(location: cursor, length: seam.start - cursor)))
            cursor = seam.end
        }
        pieces.append(source.substring(from: cursor))
        return pieces.map { JS.trim(JS.replace(JS.trim($0), trailingJoiners, with: "")) }.filter { !$0.isEmpty }
    }

    /// The first piece between chosen cuts that holds words but no item
    /// (fillers or joining words alone), or -1. An empty piece is left to
    /// the cutter's own trim.
    static func fillerPiece(_ sentence: String, _ chosen: [Seam]) -> Int {
        let source = sentence as NSString
        for k in 0...chosen.count {
            let from = k == 0 ? 0 : chosen[k - 1].end
            let to = k == chosen.count ? source.length : chosen[k].start
            let piece = source.substring(with: NSRange(location: from, length: max(0, to - from)))
            if !JS.trim(piece).isEmpty && !hasWords(piece) { return k }
        }
        return -1
    }

    /// A vote as a clean, sorted list of seam numbers, or nil when it is
    /// not a list of whole numbers naming real seams.
    static func confirmedSeams(_ vote: JSValue?, seamCount: Int) -> [Int]? {
        guard let list = vote?.array else { return nil }
        var numbers: [Int] = []
        for value in list {
            guard let n = value.number, JS.isInteger(n), n >= 1, n <= Double(seamCount) else { return nil }
            if !numbers.contains(Int(n)) { numbers.append(Int(n)) }
        }
        return numbers.sorted()
    }

    static func readSeamVotes(_ raw: JSValue?, seamCounts: [Int]) -> [Int: [Int]] {
        var votes: [Int: [Int]] = [:]
        guard let object = raw?.object else { return votes }
        for (key, value) in object.entries {
            let sentence = JS.number(key)
            guard JS.isInteger(sentence), sentence >= 1, sentence <= Double(seamCounts.count) else { continue }
            let count = seamCounts[Int(sentence) - 1]
            if count == 0 { continue }
            if let confirmed = confirmedSeams(value, seamCount: count), !confirmed.isEmpty { votes[Int(sentence)] = confirmed }
        }
        return votes
    }

    /// The seams as the chat model sees them: N.M: "left" | "right".
    public static func seamPrompt(_ sentences: [String], _ seamsBySentence: [[Seam]]) -> String {
        var lines: [String] = []
        for (i, sentence) in sentences.enumerated() {
            for (j, seam) in (i < seamsBySentence.count ? seamsBySentence[i] : []).enumerated() {
                let (left, right) = sides(sentence, seam)
                lines.append("\(i + 1).\(j + 1): \"\(left)\" | \"\(right)\"")
            }
        }
        return lines.joined(separator: "\n")
    }

    // MARK: Lead-ins

    /// The words the lead-in question offers: every word before the last
    /// seam, bare of trailing commas; none for one word or too many.
    public static func leadWords(_ sentence: String, _ seams: [Seam], rules: SorterRules) -> [String] {
        guard let last = seams.last else { return [] }
        let before = (sentence as NSString).substring(to: last.start)
        let words = matches(word, before)
        guard words.count >= 2, words.count <= rules.leadWordsMax else { return [] }
        return words.map { w in
            let bare = JS.replace(w, leadWordTail, with: "")
            return bare.isEmpty ? w : bare
        }
    }

    /// The lead words as the chat model sees them: N: 1 word | 2 word.
    public static func leadPrompt(_ sentences: [String], _ seamsBySentence: [[Seam]], rules: SorterRules) -> String {
        var lines: [String] = []
        for (i, sentence) in sentences.enumerated() {
            let words = leadWords(sentence, i < seamsBySentence.count ? seamsBySentence[i] : [], rules: rules)
            if !words.isEmpty {
                lines.append("\(i + 1): " + words.enumerated().map { "\($0.offset + 1) \($0.element)" }.joined(separator: " | "))
            }
        }
        return lines.joined(separator: "\n")
    }

    /// A starts vote: per sentence, a word number from 2 to the count offered.
    static func readLeadStarts(_ raw: JSValue?, leadCounts: [Int]) -> [Int: Int] {
        var starts: [Int: Int] = [:]
        guard let object = raw?.object else { return starts }
        for (key, value) in object.entries {
            let sentence = JS.number(key)
            guard JS.isInteger(sentence), sentence >= 1, sentence <= Double(leadCounts.count) else { continue }
            var word: Double?
            if let text = value.string {
                word = test(digitsOnly, JS.trim(text)) ? JS.number(text) : nil
            } else {
                word = value.number
            }
            guard let word, JS.isInteger(word) else { continue }
            if word >= 2 && word <= Double(leadCounts[Int(sentence) - 1]) { starts[Int(sentence)] = Int(word) }
        }
        return starts
    }

    /// Split a run's first piece where its first item begins.
    public static func splitLeadIn(_ piece: String, start: Int) -> (lead: String, item: String)? {
        guard start > 1 else { return nil }
        let source = piece as NSString
        let words = word.matches(in: piece, range: NSRange(location: 0, length: source.length))
        guard start <= words.count else { return nil }
        let at = words[start - 1].range.location
        let lead = JS.replace(JS.trim(source.substring(to: at)), leadTail, with: "")
        let item = JS.trim(source.substring(from: at))
        guard !lead.isEmpty, !item.isEmpty else { return nil }
        return (lead, item)
    }

    /// Cut a sentence at its confirmed seams and, when that makes a run,
    /// take the lead-in the model pointed at and trim the run's final period.
    public static func cutRun(_ sentence: String, _ seams: [Seam], confirmed: [Int], start: Int?, rules: SorterRules) -> (lead: String?, pieces: [String]) {
        var pieces = cut(sentence, seams, confirmed: confirmed)
        if pieces.count < 2 { return (nil, pieces) }
        let last = pieces.count - 1
        if !test(abbreviation, pieces[last]) {
            let trimmed = JS.trim(JS.replace(pieces[last], finalPeriod, with: ""))
            if !trimmed.isEmpty { pieces[last] = trimmed }
        }
        let offered = leadWords(sentence, seams, rules: rules).count
        guard let start, start <= offered, let split = splitLeadIn(pieces[0], start: start) else { return (nil, pieces) }
        pieces[0] = split.item
        return (split.lead, pieces)
    }

    /// Task and idea sentences with a confirmed vote, expanded into their
    /// pieces with the label kept; everything else passes through.
    public static func applySplits(
        _ sentences: [String], _ labels: [SortLabel], _ seamsBySentence: [[Seam]], votes: [Int: [Int]], starts: [Int: Int] = [:], group: String = "run", rules: SorterRules
    ) -> (sentences: [String], labels: [SortLabel], leads: [LeadIn?]) {
        var out: (sentences: [String], labels: [SortLabel], leads: [LeadIn?]) = ([], [], [])
        for (i, sentence) in sentences.enumerated() {
            let label = labels[i]
            if label != .note, let confirmed = votes[i + 1], !confirmed.isEmpty {
                let run = cutRun(sentence, i < seamsBySentence.count ? seamsBySentence[i] : [], confirmed: confirmed, start: starts[i + 1], rules: rules)
                let lead = run.lead.map { LeadIn(text: $0, group: "\(group)-\(i + 1)") }
                for piece in run.pieces {
                    out.sentences.append(piece)
                    out.labels.append(label)
                    out.leads.append(lead)
                }
                continue
            }
            out.sentences.append(sentence)
            out.labels.append(label)
            out.leads.append(nil)
        }
        return out
    }

    // MARK: Keep

    /// The words the keep question offers for a sentence (US-115): every
    /// word, as the same tokens the lead-in counts. Empty for a list line,
    /// a sentence under 3 words, or a ramble over rules.keepWordsMax.
    public static func keepWords(_ sentence: String, rules: SorterRules) -> [String] {
        if test(listLine, sentence) { return [] }
        let words = matches(word, sentence)
        return words.count >= 3 && words.count <= rules.keepWordsMax ? words : []
    }

    /// The words as the chat model sees them: N: 1 word | 2 word.
    public static func keepPrompt(_ sentences: [String], rules: SorterRules) -> String {
        var lines: [String] = []
        for (i, sentence) in sentences.enumerated() {
            let words = keepWords(sentence, rules: rules)
            if !words.isEmpty {
                lines.append("\(i + 1): " + words.enumerated().map { "\($0.offset + 1) \($0.element)" }.joined(separator: " | "))
            }
        }
        return lines.joined(separator: "\n")
    }

    /// A keep vote: per sentence, [first, last] inside the words offered.
    /// Anything else, or a span of every word, leaves that sentence whole.
    static func readKeepSpans(_ raw: JSValue?, keepCounts: [Int]) -> [Int: KeepSpan] {
        var spans: [Int: KeepSpan] = [:]
        guard let object = raw?.object else { return spans }
        for (key, value) in object.entries {
            let sentence = JS.number(key)
            guard JS.isInteger(sentence), sentence >= 1, sentence <= Double(keepCounts.count) else { continue }
            guard let pair = value.array, pair.count == 2, let first = pair[0].number, let last = pair[1].number else { continue }
            guard JS.isInteger(first), JS.isInteger(last) else { continue }
            let count = Double(keepCounts[Int(sentence) - 1])
            if first < 1 || last < first || last > count { continue }
            if first == 1 && last == count { continue }
            spans[Int(sentence)] = KeepSpan(first: Int(first), last: Int(last))
        }
        return spans
    }

    /// A sentence cut down to the words worth filing, its seams, their
    /// votes, and its lead-in start carried over to the shorter text: a
    /// seam outside the kept words is gone, a lead-in that began among the
    /// dropped words is none. The joining punctuation the trim leaves goes,
    /// and so does a period when the kept words stop short of the end. A
    /// span that keeps nothing usable changes nothing.
    public static func applyKeep(
        _ sentence: String, _ seams: [Seam], confirmed: [Int]?, start: Int?, span: KeepSpan
    ) -> (sentence: String, seams: [Seam], confirmed: [Int], start: Int?) {
        let same = (sentence: sentence, seams: seams, confirmed: confirmed ?? [], start: start)
        let source = sentence as NSString
        let words = word.matches(in: sentence, range: NSRange(location: 0, length: source.length))
        let first = span.first
        let last = span.last
        if first < 1 || last < first || last > words.count || (first == 1 && last == words.count) { return same }
        let from = words[first - 1].range.location
        let end = words[last - 1].range
        var text = JS.replace(source.substring(with: NSRange(location: from, length: end.location + end.length - from)), keepTail, with: "")
        if last < words.count && !test(abbreviation, text) { text = JS.replace(text, finalPeriod, with: "") }
        text = JS.trim(text)
        // Fillers alone are no item, whichever way they arrive (US-114).
        if !hasWords(text) { return same }
        let offered = findSeams(text)
        let length = (text as NSString).length
        var carried: [Int] = []
        for n in confirmed ?? [] {
            guard n >= 1, n <= seams.count else { continue }
            let seam = seams[n - 1]
            guard seam.start >= from, seam.end <= from + length else { continue }
            guard let index = offered.firstIndex(where: { $0.start == seam.start - from && $0.end == seam.end - from }) else { continue }
            if !carried.contains(index + 1) { carried.append(index + 1) }
        }
        let moved: Int? = start.flatMap { $0 > first ? $0 - (first - 1) : nil }
        return (text, offered, carried.sorted(), moved)
    }

    // MARK: Filing

    /// A markdown link from the folder holding fromFile to toFile, every
    /// segment percent-encoded as encodeURIComponent does.
    public static func relativeLink(from fromFile: String, to toFile: String) -> String {
        // Split on code units, as JavaScript does: a slash before a
        // combining mark is one Character in Swift.
        let fromDir = Array((fromFile as NSString).components(separatedBy: "/").filter { !$0.isEmpty }.dropLast())
        let to = (toFile as NSString).components(separatedBy: "/").filter { !$0.isEmpty }
        var common = 0
        while common < fromDir.count, common < to.count - 1, JS.same(fromDir[common], to[common]) { common += 1 }
        let ups = Array(repeating: "..", count: fromDir.count - common)
        return (ups + to[common...].map(encodeURIComponent)).joined(separator: "/")
    }

    static func encodeURIComponent(_ text: String) -> String {
        var out = ""
        for byte in text.utf8 {
            let keep = (0x41...0x5A).contains(byte) || (0x61...0x7A).contains(byte) || (0x30...0x39).contains(byte) || "-_.!~*'()".utf8.contains(byte)
            out += keep ? String(UnicodeScalar(byte)) : String(format: "%%%02X", byte)
        }
        return out
    }

    /// The sentence without a list marker it already carried.
    static func bare(_ sentence: String) -> String {
        JS.trim(JS.replace(sentence, listLine, all: false, with: ""))
    }

    public static func taskLine(_ sentence: String, time: String, link: String) -> String {
        "- [ ] \(bare(sentence)) ([\(time)](\(link)))"
    }

    public static func ideaLine(_ sentence: String, time: String, link: String) -> String {
        "- \(bare(sentence)) ([\(time)](\(link)))"
    }

    /// A lead-in as it is filed: its words closed with one colon.
    public static func leadLine(_ text: String) -> String {
        JS.replace(text, leadLineTail, with: "") + ":"
    }

    public struct FiledLines: Equatable, Sendable {
        public var tasks: [String] = []
        public var ideas: [String] = []
        public var notes: [String] = []
    }

    /// Each sentence into its bucket, in spoken order, untouched; an item
    /// with a lead-in nests under it, the lead line written before the
    /// first item of its run in each file.
    public static func planFiling(_ sentences: [String], _ labels: [SortLabel], time: String, inbox: String, tasks: String, ideas: String, leads: [LeadIn?] = []) -> FiledLines {
        var plan = FiledLines()
        let taskLink = relativeLink(from: tasks, to: inbox)
        let ideaLink = relativeLink(from: ideas, to: inbox)
        var open: [SortLabel: String] = [:]
        for (i, sentence) in sentences.enumerated() {
            let label = labels[i]
            if label == .note {
                plan.notes.append(sentence)
                continue
            }
            let line = label == .task ? taskLine(sentence, time: time, link: taskLink) : ideaLine(sentence, time: time, link: ideaLink)
            var entry = line
            if let lead = i < leads.count ? leads[i] : nil {
                entry = "  \(line)"
                if open[label] != lead.group {
                    entry = "- \(leadLine(lead.text))\n\(entry)"
                    open[label] = lead.group
                }
            } else {
                open[label] = nil
            }
            if label == .task { plan.tasks.append(entry) } else { plan.ideas.append(entry) }
        }
        return plan
    }

    /// The heading filed lines sit under, one line, '' when headings are off.
    public static func filedHeading(_ template: String, at moment: NoteMoment, topic: String = "") -> String {
        if JS.trim(template).isEmpty { return "" }
        var values = moment.values
        values["topic"] = topic
        return JS.trim(JS.replace(NoteFiles.render(template, values), spaces, with: " "))
    }

    /// The heading and a newline when the file does not carry it yet.
    public static func headingPrefix(_ heading: String, existing: String) -> String {
        if heading.isEmpty { return "" }
        let carried = existing.components(separatedBy: "\n").contains { JS.same(JS.trim($0), heading) }
        return carried ? "" : "\(heading)\n"
    }

    /// Positions no sort has settled yet, in order: what Sort again sends.
    public static func remaining(_ count: Int, settled: Set<Int>) -> [Int] {
        (0..<max(0, count)).filter { !settled.contains($0) }
    }

    /// The settled set after a sort that sent positions and kept keptLocal among them.
    public static func settle(_ settled: Set<Int>, positions: [Int], keptLocal: [Int]) -> Set<Int> {
        var next = settled
        for i in keptLocal where i >= 0 && i < positions.count { next.insert(positions[i]) }
        return next
    }

    // MARK: Patterns

    static let listLine = JS.regex("^(?:- \\[[ xX]\\] |- |[0-9]+\\. )")
    static let sentenceEnd = JS.regex("(?<=[.!?][\"\u{201D}')\\]]?)\(JS.space)+")
    static let abbreviation = JS.regex(
        "(?:^|\(JS.space))(?:" + ["Dr", "Mr", "Mrs", "Ms", "Prof", "Jr", "Sr", "St", "vs", "etc", "approx", "e.g", "i.e"].map(JS.caseless).joined(separator: "|") + ")\\.\(JS.end)"
    )
    static let connector = "(?:" + ["and then", "and also", "and", "then", "also"].map(JS.caseless).joined(separator: "|") + ")"
    static let seam = JS.regex("[,;]\(JS.space)+(?:\(connector)\(JS.space)+)?|\(JS.space)+\(connector)\(JS.space)+")
    /// shared/sorter.json's notAnItem, in its order (a test holds the two
    /// together): spoken fillers and joining words, never an item alone.
    static let notAnItemWords = ["and", "then", "also", "oh", "ah", "um", "uhm", "uh", "uhh", "erm", "hmm", "mhm", "well", "so", "okay", "ok", "yeah", "anyway", "actually"]
    /// A side of fillers alone (US-114). Every separator belongs to one
    /// quantifier only, so a long run of fillers matches in linear time.
    static let notAnItem = JS.regex(
        "^[\(JS.spaceMembers).,;!?]*(?:(?:" + notAnItemWords.map(JS.caseless).joined(separator: "|") + ")\(JS.boundary)[\(JS.spaceMembers).,;!?]*)+\(JS.end)"
    )
    static let asciiWord = JS.regex("[A-Za-z0-9_]")
    static let word = JS.regex("\(JS.nonSpace)+")
    static let trailingJoiners = JS.regex("[,;]+\(JS.end)")
    static let leadWordTail = JS.regex("[,;:]+\(JS.end)")
    static let keepTail = JS.regex("[,;:]+\(JS.end)")
    static let leadTail = JS.regex("[\(JS.spaceMembers),;:]+\(JS.end)")
    static let leadLineTail = JS.regex("[\(JS.spaceMembers),;:.]+\(JS.end)")
    static let finalPeriod = JS.regex("(?<!\\.)\\.\(JS.end)")
    static let digitsOnly = JS.regex("^[0-9]+\(JS.end)")
    static let spaces = JS.regex("\(JS.space)+")

    static func hasWords(_ side: String) -> Bool {
        test(asciiWord, side) && !test(notAnItem, side)
    }

    static func insideQuoteOrParen(_ left: String) -> Bool {
        let units = left.utf16
        let opens = units.filter { $0 == 0x28 }.count
        let closes = units.filter { $0 == 0x29 }.count
        let quotes = units.filter { $0 == 0x22 }.count
        return opens > closes || quotes % 2 == 1
    }

    // MARK: Helpers

    static func test(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    static func matches(_ regex: NSRegularExpression, _ text: String) -> [String] {
        let source = text as NSString
        return regex.matches(in: text, range: NSRange(location: 0, length: source.length)).map { source.substring(with: $0.range) }
    }

    /// String.prototype.split with a pattern that captures nothing.
    static func split(_ text: String, _ regex: NSRegularExpression) -> [String] {
        let source = text as NSString
        var out: [String] = []
        var cursor = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: source.length)) where match.range.length > 0 {
            out.append(source.substring(with: NSRange(location: cursor, length: match.range.location - cursor)))
            cursor = match.range.location + match.range.length
        }
        out.append(source.substring(from: cursor))
        return out
    }
}
