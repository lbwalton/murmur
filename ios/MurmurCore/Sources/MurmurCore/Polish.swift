// SPDX-License-Identifier: GPL-3.0-only
// The cleanup pass, polish (ios/prd.json IOS-007): desktop's
// src/main/formatter/llm.ts in Swift. One chat request to the cleanup
// model with the prompt from shared/polish.json, and an answer kept only
// when it passes every check there. An error, a timeout, chatter, a
// refusal, or an answer to the dictated words falls back to the
// formatted text it was given, so a transcript can never be lost here.
// shared/polish-vectors.json keeps this judging answers as desktop does.
import Foundation

/// shared/polish.json.
public struct PolishRules: Decodable, Sendable, Equatable {
    public struct Length: Decodable, Sendable, Equatable {
        public let ratioFromWords: Int
        public let floor: Double
        public let listFloor: Double
        public let ceiling: Double
        public let shortDelta: Int
    }

    /// How deep a correction may cut: slack words, plus perCue for each
    /// correction cue the answer dropped.
    public struct CorrectionCut: Decodable, Sendable, Equatable {
        public let slack: Int
        public let perCue: Int
    }

    /// How far an answer may stray from the speech before it is an answer
    /// to the dictation, not a cleanup of it (IOS-032): more than slack
    /// words and more than these shares of the answer's words new, or of
    /// the speech's words dropped.
    public struct Answer: Decodable, Sendable, Equatable {
        public let slack: Int
        public let addedShare: Double
        public let droppedShare: Double
    }

    public let systemPrompt: [String]
    public let smartListsPrompt: [String]
    public let correctionsPrompt: [String]
    public let correctionCues: [String]
    public let correctionCut: CorrectionCut
    /// Cues that count only where the speaker paused after them (No,).
    public let pausedCorrectionCues: [String]
    /// The marks that make that pause.
    public let correctionPause: String
    /// The marks that end a sentence, so the word after one opens the next.
    public let sentenceEnd: String
    public let metaOpeners: [String]
    public let refusals: [String]
    public let hintLead: String
    public let hintSentinel: String
    public let length: Length
    public let answer: Answer
    /// The marks that end a question.
    public let questionMarks: String
    /// Spoken number words a cleanup may write as digits.
    public let numberWords: [String]
    public let temperature: Double
    public let timeoutMs: Int
}

public enum PolishVerdict: Equatable, Sendable {
    case keep(String)
    /// The reason, in desktop's words for it.
    case reject(String)
}

/// What polish gave: the polished text, or why the formatted text stands.
public enum PolishResult: Equatable, Sendable {
    case polished(String)
    case fellBack(String)
}

public enum Polish {
    /// Decide whether a model's answer is a faithful cleanup of the input.
    /// Strict: when in doubt, reject, and the caller keeps its text.
    public static func validate(
        _ input: String, _ candidate: String, smartLists: Bool, corrections: Bool, rules: PolishRules, hallucinations: HallucinationList
    ) -> PolishVerdict {
        var text = JS.trim(candidate)
        if text.isEmpty { return .reject("empty") }

        // A whole-text quote wrapper the input did not have gets stripped.
        let units = Array(text.utf16)
        let quoted = (units.first == 0x22 && units.last == 0x22) || (units.first == 0x201C && units.last == 0x201D)
        if quoted && JS.trim(input).utf16.first != 0x22 {
            text = JS.trim(units.count > 2 ? String(decoding: units[1..<(units.count - 1)], as: UTF16.self) : "")
        }
        // An answer of only quote marks is empty too: keeping it would
        // replace the dictation with nothing.
        if text.isEmpty { return .reject("empty") }

        let lower = text.lowercased()
        if rules.metaOpeners.contains(where: { lower.utf16.starts(with: $0.utf16) }) { return .reject("meta chatter") }
        if rules.refusals.contains(where: { contains(lower, $0) }) { return .reject("refusal") }

        // A preamble line ending in a colon before the payload is chatter,
        // except a colon intro directly over list lines under smart lists.
        let lines = (text as NSString).components(separatedBy: "\n")
        if lines.count > 1, JS.trim(lines[0]).utf16.last == 0x3A, !contains(input, ":"),
           !(smartLists && isListBody(lines)) {
            return .reject("preamble line")
        }

        // Cleanup adjusts, it does not write or delete essays. List
        // markers are formatting, not words.
        let countable = smartLists ? JS.replace(text, listMarkers, with: "") : text
        let inputWords = JS.wordCount(input)
        let outputWords = JS.wordCount(countable)
        // A list earns the deeper floor only when the speech enumerated
        // and the list kept every entry the speech implied.
        let implied = smartLists && isListShaped(lines) ? impliedEntryCount(input) : 0
        let earnedListFloor = implied >= 2
        if earnedListFloor && lines.filter(isListLine).count < implied { return .reject("missing entries") }
        // With apply corrections on, a cut that is a correction earns the
        // same deeper floor: the speech said a cue the answer dropped, the
        // cut is no deeper than the dropped cues explain, and every word
        // left was spoken (IOS-030, desktop's US-105).
        // The answered check below reads the same shape with the setting off.
        let correctionCut = isCorrection(input, countable, cut: inputWords - outputWords, rules: rules)
        let earnedCorrectionFloor = corrections && correctionCut
        if inputWords >= rules.length.ratioFromWords {
            let ratio = Double(outputWords) / Double(inputWords)
            let floor = earnedListFloor || earnedCorrectionFloor ? rules.length.listFloor : rules.length.floor
            if ratio < floor || ratio > rules.length.ceiling { return .reject("length ratio") }
        } else if abs(outputWords - inputWords) > rules.length.shortDelta {
            return .reject("length delta")
        }

        // A polite closing the speaker never said is injected, not cleaned.
        if SpeechGate.isHallucination(lastSentence(text), phrases: hallucinations.phrases),
           !SpeechGate.isHallucination(lastSentence(input), phrases: hallucinations.phrases) {
            return .reject("appended chatter")
        }

        // An answer to the dictation, not a cleanup of it (IOS-032).
        if isAnswer(input, countable, text, listFloor: earnedListFloor, correctionCut: correctionCut, rules: rules) {
            return .reject("answered")
        }
        return .keep(text)
    }

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(
        _ text: String, baseUrl: String, model: String, key: APIKey, smartLists: Bool, corrections: Bool, hints: [String], rules: PolishRules
    ) -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/chat/completions")
        else { return nil }
        let system = (rules.systemPrompt + (smartLists ? rules.smartListsPrompt : []) + (corrections ? rules.correctionsPrompt : []) + hints)
            .joined(separator: " ")
        let body = Chat(model: model, temperature: rules.temperature, messages: [
            Chat.Message(role: "system", content: system),
            Chat.Message(role: "user", content: text)
        ])
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: Double(rules.timeoutMs) / 1000)
        request.httpMethod = "POST"
        request.setValue("Bearer \(key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        request.httpBody = try? encoder.encode(body)
        return request
    }

    /// Runs the cleanup model over formatted text. Never retries: dictation
    /// latency matters more than a second opinion.
    public static func run(
        _ text: String, baseUrl: String, model: String, key: APIKey, smartLists: Bool, corrections: Bool, hints: [String], rules: PolishRules,
        hallucinations: HallucinationList, send: ConnectionTest.Send
    ) async -> PolishResult {
        guard let request = request(text, baseUrl: baseUrl, model: model, key: key, smartLists: smartLists, corrections: corrections, hints: hints, rules: rules) else {
            return .fellBack("network")
        }
        let body: Data
        let response: URLResponse
        do {
            (body, response) = try await send(request)
        } catch let error as URLError where error.code == .timedOut {
            return .fellBack("timeout")
        } catch {
            return .fellBack("network")
        }
        guard let http = response as? HTTPURLResponse else { return .fellBack("network") }
        guard (200..<300).contains(http.statusCode) else { return .fellBack("http \(http.statusCode)") }
        // A body that is not JSON fails where desktop's response.json() throws.
        guard let object = try? JSONSerialization.jsonObject(with: body) else { return .fellBack("network") }
        guard let content = (((object as? [String: Any])?["choices"] as? [Any])?.first as? [String: Any])
            .flatMap({ ($0["message"] as? [String: Any])?["content"] as? String })
        else { return .fellBack("response missing text") }
        switch validate(text, content, smartLists: smartLists, corrections: corrections, rules: rules, hallucinations: hallucinations) {
        case .reject(let reason):
            return .fellBack("validate: \(reason)")
        case .keep(let kept):
            // Hint lines open with the sentinel, so an echo of hint text
            // is caught even when it slips the shape checks.
            if !hints.isEmpty, contains(kept.lowercased(), rules.hintSentinel), !contains(text.lowercased(), rules.hintSentinel) {
                return .fellBack("hint echo")
            }
            return .polished(kept)
        }
    }

    private struct Chat: Encodable {
        struct Message: Encodable {
            let role: String
            let content: String
        }

        let model: String
        let temperature: Double
        let messages: [Message]
    }

    /// includes() on code units, as JavaScript compares.
    private static func contains(_ text: String, _ part: String) -> Bool {
        (text as NSString).range(of: part, options: .literal).location != NSNotFound
    }

    private static let listLine = JS.regex("^(?:- |[0-9]+\\. )")
    private static let listMarkers = JS.regex("\(JS.lineStart)(?:- |[0-9]+\\. )")

    /// A list line as the smart lists prompt defines it: a dash or an
    /// ordered number prefix. Anything else is prose.
    private static func isListLine(_ line: String) -> Bool {
        listLine.firstMatch(in: line, range: NSRange(location: 0, length: (line as NSString).length)) != nil
    }

    private static func isListBody(_ lines: [String]) -> Bool {
        let body = lines.dropFirst().filter { !JS.trim($0).isEmpty }
        return !body.isEmpty && body.allSatisfy(isListLine)
    }

    /// A whole answer that is a list: at least two list lines, and at
    /// most one prose line, the intro at the top.
    private static func isListShaped(_ lines: [String]) -> Bool {
        let nonEmpty = lines.filter { !JS.trim($0).isEmpty }
        guard nonEmpty.filter(isListLine).count >= 2 else { return false }
        let prose = nonEmpty.filter { !isListLine($0) }
        guard let intro = prose.first else { return true }
        return prose.count == 1 && nonEmpty.first.map { JS.same($0, intro) } == true
    }

    private static let enumerators = JS.regex(JS.boundary + "(?:" + ["first", "then", "next", "finally"].map(JS.caseless).joined(separator: "|") + ")" + JS.boundary)
    private static let clauseCommas = JS.regex(",\(JS.space)*(?:" + ["i", "we", "you", "let's", "please"].map(JS.caseless).joined(separator: "|") + ")" + JS.boundary)

    /// How many entries the speech implies: the stronger of the enumerator
    /// count and the comma run, with commas that start a clause left out.
    /// When wrong it overcounts, which only falls back to prose.
    private static func impliedEntryCount(_ input: String) -> Int {
        let whole = NSRange(location: 0, length: (input as NSString).length)
        let enums = enumerators.numberOfMatches(in: input, range: whole)
        let commas = input.utf16.filter { $0 == 0x2C }.count
        let itemCommas = max(0, commas - clauseCommas.numberOfMatches(in: input, range: whole))
        return max(enums, itemCommas >= 2 ? itemCommas + 1 : 0)
    }

    /// Whether a cut is a spoken correction: the answer says fewer cues
    /// than the speech, cuts no more than correctionCut allows for the
    /// cues it dropped, and holds only words that were spoken. A cut that
    /// keeps every cue, or adds a word, is content, never a fix.
    static func isCorrection(_ input: String, _ answer: String, cut: Int, rules: PolishRules) -> Bool {
        let spoken = spokenWords(input)
        let kept = spokenWords(answer)
        let dropped = cuesDropped(input, spoken, kept, rules)
        return dropped > 0 && cut <= rules.correctionCut.slack + rules.correctionCut.perCue * dropped && onlySpoken(spoken, kept)
    }

    /// Desktop's spokenWords: lowercased as JavaScript does, curly
    /// apostrophes made straight, split on whitespace, anything but letters
    /// and numbers taken off both ends, empty words dropped. Each word is
    /// its UTF-16 code units, since JavaScript compares those (é written as
    /// one code point is not é written as two).
    static func spokenWords(_ value: String) -> [[UInt16]] {
        let units = JS.lowercase(value).utf16.map { $0 == 0x2018 || $0 == 0x2019 ? 0x27 : $0 }
        return units.split(whereSeparator: JS.isSpace).compactMap { piece in
            let scalars = Array(String(decoding: piece, as: UTF16.self).unicodeScalars)
            guard let first = scalars.firstIndex(where: isLetterOrNumber), let last = scalars.lastIndex(where: isLetterOrNumber) else { return nil }
            return Array(String(String.UnicodeScalarView(scalars[first...last])).utf16)
        }
    }

    /// \p{L} or \p{N}.
    private static func isLetterOrNumber(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter, .decimalNumber, .letterNumber, .otherNumber: true
        default: false
        }
    }

    /// The cues as whole words, each escaped, as desktop builds the pattern.
    private static func cuePattern(_ cues: [String]) -> NSRegularExpression {
        JS.regex(JS.boundary + "(?:" + cues.map(JS.escape).joined(separator: "|") + ")" + JS.boundary)
    }

    /// How many cues the words say, read over the words joined by spaces.
    private static func cueCount(_ words: [[UInt16]], _ cue: NSRegularExpression) -> Int {
        let joined = String(decoding: Array(words.joined(separator: [0x20])), as: UTF16.self)
        return cue.numberOfMatches(in: joined, range: NSRange(location: 0, length: (joined as NSString).length))
    }

    /// Desktop's correctionCuesDropped: the cues the answer dropped. A
    /// paused cue counts only when the listed drop is exactly zero (Sorry,
    /// no, takes back one thing, not two), less every time the answer still
    /// says the cue word: a No kept without its comma took nothing back, and
    /// neither did one kept while an everyday no went.
    private static func cuesDropped(_ input: String, _ spoken: [[UInt16]], _ kept: [[UInt16]], _ rules: PolishRules) -> Int {
        let cue = cuePattern(rules.correctionCues)
        let listed = cueCount(spoken, cue) - cueCount(kept, cue)
        guard listed == 0 else { return listed }
        let cues = rules.pausedCorrectionCues.map { Array($0.utf16) }
        return max(0, pausedCueCount(input, rules) - kept.filter { cues.contains($0) }.count)
    }

    /// Desktop's pausedCueCount: a paused cue is everyday speech (no
    /// problem, Is it done? No, Well, no, he said no.) unless it takes back
    /// what came just before, so it counts only with a pause on both sides:
    /// after a piece (the text lowercased as JavaScript does, curly
    /// apostrophes made straight, split on whitespace) that has a letter or
    /// number, ends in a correctionPause mark, and does not open a sentence,
    /// and once for a run (No, no, no,).
    static func pausedCueCount(_ value: String, _ rules: PolishRules) -> Int {
        let units = JS.lowercase(value).utf16.map { $0 == 0x2018 || $0 == 0x2019 ? 0x27 : $0 }
        let pause = Set(rules.correctionPause.utf16)
        let sentenceEnd = Set(rules.sentenceEnd.utf16)
        let pieces = units.split(whereSeparator: JS.isSpace)
        let paused = pieces.map { isPausedCue($0, rules) }
        var count = 0
        for i in pieces.indices.dropFirst(2) where paused[i] && !paused[i - 1] {
            let before = pieces[i - 1]
            let words = String(decoding: before, as: UTF16.self).unicodeScalars.contains(where: isLetterOrNumber)
            if words, let end = before.last, pause.contains(end), let opener = pieces[i - 2].last, !sentenceEnd.contains(opener) {
                count += 1
            }
        }
        return count
    }

    /// A piece that is anything but letters and numbers, the paused cue, a
    /// correctionPause mark, then anything but letters and numbers: No, and
    /// "No." are, No? and nobody, are not.
    private static func isPausedCue(_ piece: ArraySlice<UInt16>, _ rules: PolishRules) -> Bool {
        let scalars = Array(String(decoding: piece, as: UTF16.self).unicodeScalars)
        guard let start = scalars.firstIndex(where: isLetterOrNumber) else { return false }
        let rest = Array(String(String.UnicodeScalarView(scalars[start...])).utf16)
        let pause = Set(rules.correctionPause.utf16)
        return rules.pausedCorrectionCues.contains { word in
            let cue = Array(word.utf16)
            let after = String(decoding: rest.dropFirst(cue.count + 1), as: UTF16.self)
            return rest.count > cue.count && rest.starts(with: cue) && pause.contains(rest[cue.count])
                && !after.unicodeScalars.contains(where: isLetterOrNumber)
        }
    }

    /// Desktop's isAnswer: a model that answered the dictation instead of
    /// cleaning it up says words the speaker never did, leaves out most of
    /// what they said, turns their question into a statement, or answers
    /// after it. Words are counted as a multiset. Spoken numbers written as
    /// digits count on neither side: each added word holding an ASCII digit
    /// stands for one run of number words the answer dropped whole, taken in
    /// the order said. The live probe set the numbers (IOS-032).
    static func isAnswer(_ input: String, _ answer: String, _ text: String, listFloor: Bool, correctionCut: Bool, rules: PolishRules) -> Bool {
        let said = spokenWords(input)
        let kept = spokenWords(answer)
        let saidCounts = wordCounts(said)
        let keptCounts = wordCounts(kept)
        var added = 0
        var addedDigits = 0
        for (word, count) in keptCounts {
            let extra = count - saidCounts[word, default: 0]
            guard extra > 0 else { continue }
            added += extra
            if word.contains(where: { (0x30...0x39).contains($0) }) { addedDigits += extra }
        }
        var missing: [[UInt16]: Int] = [:]
        var dropped = 0
        for (word, count) in saidCounts {
            let gone = count - keptCounts[word, default: 0]
            guard gone > 0 else { continue }
            missing[word] = gone
            dropped += gone
        }
        let numbers = Set(rules.numberWords.map { Array($0.utf16) })
        for run in numberRuns(said, numbers) where addedDigits > 0 {
            let need = wordCounts(run)
            guard need.allSatisfy({ missing[$0.key, default: 0] >= $0.value }) else { continue }
            for (word, count) in need { missing[word, default: 0] -= count }
            added -= 1
            addedDigits -= 1
            dropped -= run.count
        }
        let slack = Double(rules.answer.slack)
        let addedLimit = max(slack, rules.answer.addedShare * Double(kept.count))
        let droppedLimit = max(slack, rules.answer.droppedShare * Double(said.count))
        if Double(added) > addedLimit { return true }
        if !listFloor && !correctionCut && Double(dropped) > droppedLimit { return true }
        // A take that ends in a question, answered: the question comes back
        // as a statement with a word changed, or something follows the last
        // question. A question mid take may lose its mark to a slip fix.
        guard !correctionCut && endsAsking(input, rules) else { return false }
        let asked = questionMarks(input, rules)
        let answered = questionMarks(text, rules)
        return (asked > answered && added + dropped > 0) || (answered > 0 && !endsAsking(text, rules))
    }

    /// A numberWords word, or one whose hyphen-separated parts all are
    /// (twenty-first), as desktop splits it.
    private static func isNumberWord(_ word: [UInt16], _ numbers: Set<[UInt16]>) -> Bool {
        word.split(separator: 0x2D, omittingEmptySubsequences: false).allSatisfy { numbers.contains(Array($0)) }
    }

    /// Runs of spoken number words, in the order said: two hundred and
    /// fifty holds two runs, two hundred, then fifty.
    private static func numberRuns(_ words: [[UInt16]], _ numbers: Set<[UInt16]>) -> [[[UInt16]]] {
        var runs: [[[UInt16]]] = []
        var run: [[UInt16]] = []
        for word in words {
            if isNumberWord(word, numbers) {
                run.append(word)
            } else if !run.isEmpty {
                runs.append(run)
                run = []
            }
        }
        if !run.isEmpty { runs.append(run) }
        return runs
    }

    private static func wordCounts(_ words: [[UInt16]]) -> [[UInt16]: Int] {
        var counts: [[UInt16]: Int] = [:]
        for word in words { counts[word, default: 0] += 1 }
        return counts
    }

    /// How many questionMarks characters the text holds, counted by code
    /// point as desktop does.
    private static func questionMarks(_ value: String, _ rules: PolishRules) -> Int {
        let marks = Set(rules.questionMarks.unicodeScalars)
        return value.unicodeScalars.filter { marks.contains($0) }.count
    }

    /// Whether the text ends in a question: it holds a questionMarks mark
    /// and no letter or number after the last one.
    private static func endsAsking(_ value: String, _ rules: PolishRules) -> Bool {
        let marks = Set(rules.questionMarks.unicodeScalars)
        let scalars = Array(value.unicodeScalars)
        guard let last = scalars.lastIndex(where: { marks.contains($0) }) else { return false }
        return !scalars[(last + 1)...].contains(where: isLetterOrNumber)
    }

    /// Every answer word was spoken, each no more often than it was.
    private static func onlySpoken(_ spoken: [[UInt16]], _ kept: [[UInt16]]) -> Bool {
        var left: [[UInt16]: Int] = [:]
        for word in spoken { left[word, default: 0] += 1 }
        for word in kept {
            guard let count = left[word], count > 0 else { return false }
            left[word] = count - 1
        }
        return true
    }

    private static let sentenceBreak = JS.regex("(?<=[.!?])\(JS.space)+")

    private static func lastSentence(_ value: String) -> String {
        let trimmed = JS.trim(value)
        let source = trimmed as NSString
        guard let last = sentenceBreak.matches(in: trimmed, range: NSRange(location: 0, length: source.length)).last else { return trimmed }
        return source.substring(from: last.range.location + last.range.length)
    }
}

/// One line of cleanup-model hint text, or nil for an empty dictionary:
/// desktop's dictionaryHint, its opener from shared/polish.json.
public func dictionaryHint(_ entries: [DictionaryEntry], rules: PolishRules) -> String? {
    let usable = entries.filter { !JS.trim($0.from).isEmpty && !JS.trim($0.to).isEmpty }
    guard !usable.isEmpty else { return nil }
    let pairs = usable.map { "\"\(JS.trim($0.from))\" is written \"\(JS.trim($0.to))\"" }.joined(separator: "; ")
    return "\(rules.hintLead) \(pairs)."
}
