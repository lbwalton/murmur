// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct ConnectionTestTests {
    let key = APIKey("gsk_abcdefgh1234")!

    func answer(_ status: Int, _ body: String = "{}") -> ConnectionTest.Send {
        { request in
            (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    @Test func itAsksForTheModelListWithTheKey() throws {
        let request = try #require(ConnectionTest.request(baseUrl: "https://api.groq.com/openai/v1/", key: key))
        #expect(request.url?.absoluteString == "https://api.groq.com/openai/v1/models")
        #expect(request.httpMethod == "GET")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer gsk_abcdefgh1234")
        #expect(request.timeoutInterval == 10)
    }

    @Test func anAddressTheIPhoneCannotCallMakesNoRequest() {
        #expect(ConnectionTest.request(baseUrl: "http://192.168.1.5:8000/v1", key: key) == nil)
        #expect(ConnectionTest.request(baseUrl: "", key: key) == nil)
    }

    @Test(arguments: [200, 204])
    func aSuccessWorks(_ status: Int) async {
        #expect(await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(status)) == .works)
    }

    @Test(arguments: [401, 403])
    func aRefusalRejectsTheKey(_ status: Int) async {
        let verdict = await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(status, #"{"error":{"message":"Invalid API Key"}}"#))
        #expect(verdict == .keyRejected(status: status))
    }

    @Test func noAnswerIsNoConnection() async {
        let offline: ConnectionTest.Send = { _ in throw URLError(.notConnectedToInternet) }
        #expect(await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: offline) == .noConnection)
    }

    @Test(arguments: [
        (#"{"error":{"message":"Model overloaded"}}"#, "Model overloaded"),
        (#"{"error":"Rate limit reached"}"#, "Rate limit reached"),
        (#"{"message":"Service unavailable"}"#, "Service unavailable"),
        (#"{"detail":"Not Found"}"#, "Not Found"),
        ("<html>Bad gateway</html>", "The provider answered with code 500."),
        (#"{"error":{"message":"  "}}"#, "The provider answered with code 500.")
    ])
    func anyOtherAnswerSpeaksInTheProvidersWords(_ body: String, _ words: String) async {
        let verdict = await ConnectionTest.run(baseUrl: "https://api.groq.com/openai/v1", key: key, send: answer(500, body))
        #expect(verdict == .providerMessage(words))
    }

    @Test func aLongMessageIsCut() {
        let long = String(repeating: "a", count: 300)
        #expect(ConnectionTest.verdict(status: 500, body: Data(#"{"message":"\#(long)"}"#.utf8), key: key) == .providerMessage(String(repeating: "a", count: 200) + "…"))
    }

    /// The key is masked before a long message is cut, so a key that
    /// straddles the cut never shows in part.
    @Test func aKeyAcrossTheCutIsStillMasked() throws {
        let long = try #require(APIKey("gsk_" + String(repeating: "Q", count: 52)))
        let message = String(repeating: "a", count: 185) + " key " + long.secret + " was refused"
        let verdict = ConnectionTest.verdict(status: 429, body: Data(#"{"message":"\#(message)"}"#.utf8), key: long)
        guard case .providerMessage(let words) = verdict else {
            Issue.record("expected the provider's words, got \(verdict)")
            return
        }
        #expect(!words.contains("gsk_Q"), "\(words)")
        #expect(words.contains("••••QQQQ"))
    }

    @Test func aMessageNeverRepeatsTheKey() {
        let verdict = ConnectionTest.verdict(status: 429, body: Data(#"{"error":{"message":"Too many requests for gsk_abcdefgh1234"}}"#.utf8), key: key)
        #expect(verdict == .providerMessage("Too many requests for ••••1234"))
    }
}
