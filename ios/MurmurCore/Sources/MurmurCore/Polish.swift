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

    public let systemPrompt: [String]
    public let smartListsPrompt: [String]
    public let metaOpeners: [String]
    public let refusals: [String]
    public let hintLead: String
    public let hintSentinel: String
    public let length: Length
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
    public static func validate(_ input: String, _ candidate: String, smartLists: Bool, rules: PolishRules, hallucinations: HallucinationList) -> PolishVerdict {
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
        if inputWords >= rules.length.ratioFromWords {
            let ratio = Double(outputWords) / Double(inputWords)
            let floor = earnedListFloor ? rules.length.listFloor : rules.length.floor
            if ratio < floor || ratio > rules.length.ceiling { return .reject("length ratio") }
        } else if abs(outputWords - inputWords) > rules.length.shortDelta {
            return .reject("length delta")
        }

        // A polite closing the speaker never said is injected, not cleaned.
        if SpeechGate.isHallucination(lastSentence(text), phrases: hallucinations.phrases),
           !SpeechGate.isHallucination(lastSentence(input), phrases: hallucinations.phrases) {
            return .reject("appended chatter")
        }
        return .keep(text)
    }

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(_ text: String, baseUrl: String, model: String, key: APIKey, smartLists: Bool, hints: [String], rules: PolishRules) -> URLRequest? {
        guard BaseURL.problem(baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(baseUrl.trimmingCharacters(in: .whitespaces)) + "/chat/completions")
        else { return nil }
        let system = (rules.systemPrompt + (smartLists ? rules.smartListsPrompt : []) + hints).joined(separator: " ")
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
    public static func run(_ text: String, baseUrl: String, model: String, key: APIKey, smartLists: Bool, hints: [String], rules: PolishRules, hallucinations: HallucinationList, send: ConnectionTest.Send) async -> PolishResult {
        guard let request = request(text, baseUrl: baseUrl, model: model, key: key, smartLists: smartLists, hints: hints, rules: rules) else {
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
        switch validate(text, content, smartLists: smartLists, rules: rules, hallucinations: hallucinations) {
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
