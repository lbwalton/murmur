// SPDX-License-Identifier: GPL-3.0-only
// Speak an edit (ios/prd.json IOS-024): desktop's transform
// (src/main/formatter/transform.ts) in Swift. The spoken words are the
// instruction and the selected text is data that is never obeyed; the two
// travel in separate messages, the selection fenced so nothing inside it
// can close the fence, and a reply that is empty, chatty, or refused is
// rejected so the selection stays as it was. The prompt, phrases, and
// numbers come from shared/transform.json; shared/transform-vectors.json
// keeps this answering as desktop does.
import Foundation

/// shared/transform.json.
public struct TransformRules: Decodable, Sendable, Equatable {
    public let systemPrompt: [String]
    public let tag: String
    public let selectionHead: String
    public let instructionHead: String
    public let preambleOpeners: [String]
    public let refusalApologies: [String]
    public let refusalCannots: [String]
    public let refusalActions: [String]
    public let refusalAnywhere: [String]
    public let refusalWindow: Int
    public let maxChars: Int
    public let temperature: Double
    public let timeoutMs: Int
}

/// What a transform gave: the text to put in place of the selection, or
/// why the selection stays, in desktop's words for it.
public enum TransformResult: Equatable, Sendable {
    case rewritten(String)
    case kept(String)
}

/// One chat message, as desktop's buildTransformMessages makes it.
public struct TransformMessage: Codable, Equatable, Sendable {
    public let role: String
    public let content: String
}

public enum Transform {
    /// The selection as it travels: fenced, with any fence-like tag inside
    /// it defanged so the data can never end its own fence early.
    public static func fence(_ selection: String, rules: TransformRules) -> String {
        let tag = JS.regex("<\(JS.space)*(/?)\(JS.space)*\(JS.caseless(rules.tag))\(JS.boundary)")
        let defanged = JS.replace(selection, tag) { match, source in
            "‹" + source.substring(with: match.range(at: 1)) + rules.tag
        }
        return "\(rules.selectionHead)\n<\(rules.tag)>\n\(defanged)\n</\(rules.tag)>"
    }

    /// The chat messages for one transform: the selection never reaches the
    /// system or instruction slots.
    public static func messages(instruction: String, selection: String, rules: TransformRules) -> [TransformMessage] {
        [
            TransformMessage(role: "system", content: rules.systemPrompt.joined(separator: " ")),
            TransformMessage(role: "user", content: fence(selection, rules: rules)),
            TransformMessage(role: "user", content: "\(rules.instructionHead)\n\(JS.trim(instruction))")
        ]
    }

    /// Whether a model's reply can replace the selection. A transform
    /// rewrites on purpose, so nothing here keeps words; this only turns
    /// away replies that are plainly not the result.
    public static func validate(_ candidate: String, rules: TransformRules) -> TransformResult {
        var text = JS.trim(candidate)
        // One code fence around the whole reply is wrapping, not content.
        let whole = NSRange(location: 0, length: (text as NSString).length)
        if let fenced = codeFence.firstMatch(in: text, range: whole) {
            text = JS.trim((text as NSString).substring(with: fenced.range(at: 1)))
        }
        if text.isEmpty { return .kept("empty") }
        let source = text as NSString
        if source.range(of: "<\(rules.tag)>", options: .literal).location != NSNotFound
            || source.range(of: "</\(rules.tag)>", options: .literal).location != NSNotFound {
            return .kept("echoed fence")
        }
        let lines = source.components(separatedBy: "\n")
        if matches(preamble(rules), JS.trim(lines[0])) {
            // A lone "Here you go:" with nothing after is still nothing.
            if JS.trim(lines.dropFirst().joined(separator: "\n")).isEmpty { return .kept("empty") }
            return .kept("preamble line")
        }
        // The refusal is looked for only near the start, as a slice that
        // ends there: nothing past it is seen.
        let window = NSRange(location: 0, length: min(rules.refusalWindow, source.length))
        if refusal(rules).firstMatch(in: text, range: window) != nil { return .kept("refusal") }
        return .rewritten(text)
    }

    /// The request, or nil when the address is not one the iPhone can call.
    public static func request(instruction: String, selection: String, connection: PolishConnection, rules: TransformRules) -> URLRequest? {
        guard BaseURL.problem(connection.baseUrl) == nil,
              let url = URL(string: BaseURL.normalized(connection.baseUrl.trimmingCharacters(in: .whitespaces)) + "/chat/completions")
        else { return nil }
        let body = Chat(model: connection.model, temperature: rules.temperature, messages: messages(instruction: instruction, selection: selection, rules: rules))
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: Double(rules.timeoutMs) / 1000)
        request.httpMethod = "POST"
        request.setValue("Bearer \(connection.key.secret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        request.httpBody = try? encoder.encode(body)
        return request
    }

    /// One transform. Never throws and never retries, as desktop's.
    public static func run(instruction: String, selection: String, connection: PolishConnection, rules: TransformRules, send: ConnectionTest.Send) async -> TransformResult {
        if JS.trim(instruction).isEmpty { return .kept("no instruction") }
        if selection.utf16.count > rules.maxChars { return .kept("selection too long") }
        guard let request = request(instruction: instruction, selection: selection, connection: connection, rules: rules) else { return .kept("network") }
        let body: Data
        let response: URLResponse
        do {
            (body, response) = try await send(request)
        } catch let error as URLError where error.code == .timedOut {
            return .kept("timeout")
        } catch {
            return .kept("network")
        }
        guard let http = response as? HTTPURLResponse else { return .kept("network") }
        guard (200..<300).contains(http.statusCode) else { return .kept("http \(http.statusCode)") }
        // Desktop's response.json() reads any JSON value and throws on
        // anything else; reading a field of null throws too.
        guard let object = try? JSONSerialization.jsonObject(with: body, options: [.fragmentsAllowed]), !(object is NSNull) else {
            return .kept("network")
        }
        guard let content = (((object as? [String: Any])?["choices"] as? [Any])?.first as? [String: Any])
            .flatMap({ ($0["message"] as? [String: Any])?["content"] as? String })
        else { return .kept("response missing text") }
        return validate(content, rules: rules)
    }

    private static let codeFence = JS.regex("^```[A-Za-z0-9_-]*\\n([\\s\\S]*?)\\n```\(JS.end)")

    private static func anyOf(_ phrases: [String]) -> String {
        "(?:" + phrases.map(JS.caseless).joined(separator: "|") + ")"
    }

    /// A preamble line that announces the payload ("Here is the list:").
    private static func preamble(_ rules: TransformRules) -> NSRegularExpression {
        JS.regex("^\(anyOf(rules.preambleOpeners))\(JS.boundary)[^\\n]*:\(JS.space)*\(JS.end)")
    }

    /// Assistant refusals, kept to phrasings about helping, so a rewrite
    /// that says "I'm sorry, I can't make Thursday" survives.
    private static func refusal(_ rules: TransformRules) -> NSRegularExpression {
        let opening = "^\(anyOf(rules.refusalApologies))?\(anyOf(rules.refusalCannots)) \(anyOf(rules.refusalActions))\(JS.boundary)"
        return JS.regex("\(opening)|\(JS.boundary)\(anyOf(rules.refusalAnywhere))\(JS.boundary)")
    }

    private static func matches(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    private struct Chat: Encodable {
        let model: String
        let temperature: Double
        let messages: [TransformMessage]
    }
}
