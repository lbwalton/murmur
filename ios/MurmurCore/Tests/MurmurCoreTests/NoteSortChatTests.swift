// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// The sort's chat sends what desktop's askModel sends and fails with its
/// reasons (src/main/notes/sorter.ts).
@Suite struct NoteSortChatTests {
    let connection = PolishConnection(baseUrl: "https://api.example.com/v1/", model: "sort-model", key: APIKey("sk-test")!)
    let rules = NotesVectors.rules!

    func reply(_ body: String, status: Int = 200) -> ConnectionTest.Send {
        { request in (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!) }
    }

    func failing(_ error: Error) -> ConnectionTest.Send {
        { _ in throw error }
    }

    @Test func theRequestIsDesktops() throws {
        let request = try #require(NoteSort.chatRequest(system: "Label each sentence.", user: "Buy milk.", connection: connection, rules: rules))
        #expect(request.url?.absoluteString == "https://api.example.com/v1/chat/completions")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer sk-test")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.timeoutInterval == 12)
        let body = try #require(request.httpBody.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        #expect(body["model"] as? String == "sort-model")
        #expect(body["temperature"] as? Int == 0)
        let messages = try #require(body["messages"] as? [[String: String]])
        #expect(messages == [["role": "system", "content": "Label each sentence."], ["role": "user", "content": "Buy milk."]])
    }

    @Test func theModelsWordsComeBack() async {
        let ask = NoteSort.chat(connection, rules: rules, send: reply(#"{"choices":[{"message":{"content":"[\"task\"]"}}]}"#))
        #expect(await ask("system", "user") == .content(#"["task"]"#))
    }

    @Test(arguments: [
        ("{}", 500, "http 500"),
        ("<html>", 200, "response not json"),
        ("null", 200, "response missing text"),
        (#"{"choices":[]}"#, 200, "response missing text"),
        (#"{"choices":[{"message":{"content":7}}]}"#, 200, "response missing text")
    ])
    func aBadReplyGivesDesktopsReason(body: String, status: Int, reason: String) async {
        let ask = NoteSort.chat(connection, rules: rules, send: reply(body, status: status))
        #expect(await ask("system", "user") == .failed(reason))
    }

    @Test func aSlowOrMissingNetworkGivesItsReason() async {
        #expect(await NoteSort.chat(connection, rules: rules, send: failing(URLError(.timedOut)))("s", "u") == .failed("timeout"))
        #expect(await NoteSort.chat(connection, rules: rules, send: failing(URLError(.notConnectedToInternet)))("s", "u") == .failed("network"))
    }

    @Test func anAddressTheIPhoneCannotCallIsNeverSent() async {
        let plain = PolishConnection(baseUrl: "http://api.example.com/v1", model: "m", key: APIKey("sk-test")!)
        #expect(NoteSort.chatRequest(system: "s", user: "u", connection: plain, rules: rules) == nil)
        #expect(await NoteSort.chat(plain, rules: rules, send: failing(URLError(.badURL)))("s", "u") == .failed("network"))
    }
}
