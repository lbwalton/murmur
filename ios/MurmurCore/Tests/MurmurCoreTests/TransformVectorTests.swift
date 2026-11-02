// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// MurmurCore's transform gives desktop's answers (shared/transform-vectors.json,
/// written by src/main/formatter/transform-vectors.test.ts).
@Suite struct TransformVectorTests {
    let file = TransformVectors.file!
    let rules = TransformVectors.rules!

    @Test func theRulesAndVectorsLoad() {
        #expect(file.messages.count >= 7)
        #expect(file.replies.count >= 50)
        #expect(file.runs.count >= 20)
    }

    @Test(arguments: TransformVectors.file?.messages ?? [])
    func messagesAreDesktops(_ c: TransformVectors.MessageCase) {
        let got = Transform.messages(instruction: c.instruction, selection: c.selection, rules: rules)
        #expect(got.map { Array($0.content.utf16) } == c.messages.map { Array($0.content.utf16) })
        #expect(got.map(\.role) == c.messages.map(\.role))
    }

    @Test(arguments: TransformVectors.file?.replies ?? [])
    func repliesAreJudgedAsDesktopJudgesThem(_ c: TransformVectors.ReplyCase) {
        let got = Transform.validate(c.candidate, rules: rules)
        switch (got, c.verdict.result) {
        case (.rewritten(let text), .rewritten(let want)): #expect(Array(text.utf16) == Array(want.utf16))
        default: #expect(got == c.verdict.result)
        }
    }

    @Test(arguments: TransformVectors.file?.runs ?? [])
    func callsAreDesktops(_ c: TransformVectors.RunCase) async throws {
        let sent = Sent()
        let connection = PolishConnection(baseUrl: "https://edit.example/v1/", model: "edit-model", key: try #require(APIKey("sk-test")))
        let send: ConnectionTest.Send = { request in
            sent.request = request
            switch c.failure {
            case "network": throw URLError(.notConnectedToInternet)
            case "timeout": throw URLError(.timedOut)
            default: return (Data((c.body ?? "").utf8), HTTPURLResponse(url: request.url!, statusCode: c.status ?? 200, httpVersion: nil, headerFields: nil)!)
            }
        }
        let selection = c.selection ?? String(repeating: "a", count: c.selectionLength ?? 0)
        let got = await Transform.run(instruction: c.instruction, selection: selection, connection: connection, rules: rules, send: send)
        #expect(got == c.result.result)
        guard let want = c.sent else {
            #expect(sent.request == nil)
            return
        }
        let request = try #require(sent.request)
        #expect(request.url?.absoluteString == want.url)
        let body = try #require(request.httpBody.flatMap { try? JSONDecoder().decode(TransformVectors.Sent.Body.self, from: $0) })
        #expect(body == want.body)
    }

    /// The request carries the key and gives up after the shared time.
    @Test func theRequestIsAuthorizedAndTimed() throws {
        let connection = PolishConnection(baseUrl: "https://edit.example/v1", model: "m", key: try #require(APIKey("sk-test")))
        let request = try #require(Transform.request(instruction: "a", selection: "b", connection: connection, rules: rules))
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer sk-test")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.timeoutInterval == 30)
    }

    /// An address the iPhone cannot call sends nothing.
    @Test func anHttpAddressSendsNothing() async throws {
        let connection = PolishConnection(baseUrl: "http://edit.example/v1", model: "m", key: try #require(APIKey("sk-test")))
        let got = await Transform.run(instruction: "a", selection: "b", connection: connection, rules: rules) { _ in
            Issue.record("sent a request")
            throw URLError(.badURL)
        }
        #expect(got == .kept("network"))
    }

    final class Sent: @unchecked Sendable {
        var request: URLRequest?
    }
}

struct TransformVectors: Decodable {
    struct Verdict: Decodable {
        let ok: Bool
        let text: String?
        let reason: String?

        var result: TransformResult { ok ? .rewritten(text ?? "") : .kept(reason ?? "") }
    }

    struct MessageCase: Decodable, Sendable, CustomTestStringConvertible {
        let instruction: String
        let selection: String
        let messages: [TransformMessage]

        var testDescription: String { "\(instruction) / \(selection.prefix(30))" }
    }

    struct ReplyCase: Decodable, Sendable, CustomTestStringConvertible {
        let candidate: String
        let verdict: Verdict

        var testDescription: String { String(candidate.prefix(40)) }
    }

    struct Sent: Decodable, Sendable {
        struct Body: Decodable, Equatable, Sendable {
            let model: String
            let temperature: Double
            let messages: [TransformMessage]
        }

        let url: String
        let body: Body
    }

    struct RunCase: Decodable, Sendable, CustomTestStringConvertible {
        let name: String
        let instruction: String
        let selection: String?
        let selectionLength: Int?
        let status: Int?
        let body: String?
        let failure: String?
        let sent: Sent?
        let result: Verdict

        var testDescription: String { name }
    }

    let messages: [MessageCase]
    let replies: [ReplyCase]
    let runs: [RunCase]

    static let file: TransformVectors? = try? SharedData(directory: repoShared).decode(TransformVectors.self, from: "transform-vectors.json")
    static let rules: TransformRules? = try? SharedData(directory: repoShared).decode(TransformRules.self, from: "transform.json")
}

extension TransformVectors.Verdict: Sendable {}
