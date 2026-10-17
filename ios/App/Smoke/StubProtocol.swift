// SPDX-License-Identifier: GPL-3.0-only
// A local stand-in provider for the smoke (ios/prd.json IOS-005, IOS-006,
// IOS-007): it answers Test connection, transcriptions, polish, the notes'
// sort (IOS-023), and transforms (IOS-024) inside the app, through the real
// URLSession, without a network or a server.
import Foundation
import MurmurCore
import Synchronization

final class StubProtocol: URLProtocol {
    /// One stand-in host for each answer Test connection can give.
    enum Answer: String, CaseIterable {
        case works, rejected, offline, message

        var baseUrl: String { "https://\(rawValue).stub.invalid/v1" }

        var expected: ConnectionVerdict {
            switch self {
            case .works: .works
            case .rejected: .keyRejected(status: 401)
            case .offline: .noConnection
            case .message: .providerMessage("Model overloaded")
            }
        }
    }

    /// The transcription stand-ins: one that hears words, one that is down.
    static let wordsBaseUrl = "https://words.stub.invalid/v1"
    static let downBaseUrl = "https://down.stub.invalid/v1"

    /// What the words host hears when a whole take reaches it.
    static let words = "smoke words from the stand-in"

    /// The cleanup stand-ins (IOS-007): one that errors, one that chats.
    static let chatErrorBaseUrl = "https://chaterror.stub.invalid/v1"
    static let chattyBaseUrl = "https://chatty.stub.invalid/v1"

    /// The note sorter's stand-in (IOS-023): it answers with the replies the
    /// smoke scripted, in order, and keeps what it was asked.
    static let sortBaseUrl = "https://sort.stub.invalid/v1"

    struct SortReply: Decodable, Sendable {
        let content: String?
        let status: Int?
    }

    private static let sort = Mutex<(replies: [SortReply], asked: [[String]])>(([], []))

    /// The transform's stand-in (IOS-024): it rewrites a request shaped as
    /// desktop's transform, the selection fenced in its own message and the
    /// instruction in the last, and turns away anything else.
    static let rewriteBaseUrl = "https://rewrite.stub.invalid/v1"
    static let rewritten = "smoke rewrite from the stand-in"

    static func script(_ replies: [SortReply]) {
        sort.withLock { $0 = (replies, []) }
    }

    /// Each request's system and user prompts, in order.
    static func sortAsked() -> [[String]] {
        sort.withLock { $0.asked }
    }

    /// The only key the stand-ins accept, so a missing header fails.
    static let key = "smoke-not-a-real-key-1234"

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host?.hasSuffix(".stub.invalid") == true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let name = url.host?.split(separator: ".").first.map(String.init) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let authorized = request.value(forHTTPHeaderField: "Authorization") == "Bearer \(Self.key)"
        let (status, body): (Int, String)
        switch (name, Answer(rawValue: name)) {
        case ("words", _):
            (status, body) = !authorized ? (401, "{}") : Self.isWholeTake(request) ? (200, #"{"text":"\#(Self.words)"}"#) : (400, "{}")
        case ("down", _):
            (status, body) = (503, #"{"error":{"message":"Service unavailable"}}"#)
        case ("chaterror", _):
            (status, body) = (500, #"{"error":{"message":"Internal error"}}"#)
        case ("sort", _):
            (status, body) = authorized ? Self.sortAnswer(request) : (401, "{}")
        case ("rewrite", _):
            (status, body) = authorized ? Self.rewriteAnswer(request) : (401, "{}")
        case ("chatty", _):
            (status, body) = (200, #"{"choices":[{"message":{"content":"Sure! Here is the cleaned text: send the report."}}]}"#)
        case (_, .offline?):
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        case (_, .works?):
            (status, body) = authorized ? (200, #"{"data":[]}"#) : (401, "{}")
        case (_, .rejected?):
            (status, body) = (401, #"{"error":{"message":"Invalid API Key"}}"#)
        case (_, .message?):
            (status, body) = (503, #"{"error":{"message":"Model overloaded"}}"#)
        case (_, nil):
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])
        if let response { client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed) }
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// The next scripted reply to a sort request, as a chat completion.
    private static func sortAnswer(_ request: URLRequest) -> (Int, String) {
        let body = request.httpBody ?? request.httpBodyStream.map(read) ?? Data()
        let messages = ((try? JSONSerialization.jsonObject(with: body)) as? [String: Any])?["messages"] as? [[String: String]] ?? []
        let reply: SortReply? = sort.withLock { state in
            state.asked.append(messages.compactMap { $0["content"] })
            return state.replies.isEmpty ? nil : state.replies.removeFirst()
        }
        guard let reply else { return (599, "{}") }
        guard let content = reply.content else { return (reply.status ?? 500, "{}") }
        let completion: [String: Any] = ["choices": [["message": ["content": content]]]]
        let data = (try? JSONSerialization.data(withJSONObject: completion)) ?? Data()
        return (200, String(decoding: data, as: UTF8.self))
    }

    /// The rewrite, for a request with a system message, the fenced
    /// selection, and the instruction, in that order.
    private static func rewriteAnswer(_ request: URLRequest) -> (Int, String) {
        let body = request.httpBody ?? request.httpBodyStream.map(read) ?? Data()
        let messages = ((try? JSONSerialization.jsonObject(with: body)) as? [String: Any])?["messages"] as? [[String: String]] ?? []
        guard messages.map({ $0["role"] ?? "" }) == ["system", "user", "user"],
              messages[1]["content"]?.hasPrefix("SELECTION\n<selection>\n") == true, messages[1]["content"]?.hasSuffix("\n</selection>") == true,
              messages[2]["content"]?.hasPrefix("INSTRUCTION\n") == true
        else { return (400, "{}") }
        return (200, #"{"choices":[{"message":{"content":"\#(rewritten)"}}]}"#)
    }

    /// A take reached us whole: a form with a WAV file and a model in it.
    /// URLSession hands a protocol the body as a stream.
    private static func isWholeTake(_ request: URLRequest) -> Bool {
        guard let body = request.httpBody ?? request.httpBodyStream.map(read) else { return false }
        let text = String(decoding: body, as: UTF8.self)
        return body.range(of: Data("RIFF".utf8)) != nil && body.range(of: Data("WAVE".utf8)) != nil
            && text.contains(#"filename="audio.wav""#) && text.contains(#"name="model""#)
    }

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 16_384)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
