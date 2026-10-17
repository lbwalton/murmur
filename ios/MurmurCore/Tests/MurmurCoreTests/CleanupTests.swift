// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Synchronization
import Testing
@testable import MurmurCore


/// A cleanup model that answers with the next of its replies, then the
/// last, and remembers what it was asked.
final class FakeChat: Sendable {
    let replies: Mutex<[(Int, String)]>
    let asked = Mutex<[URLRequest]>([])

    init(_ replies: [(Int, String)]) { self.replies = Mutex(replies) }

    static func says(_ content: String) -> FakeChat {
        let body = (try? JSONSerialization.data(withJSONObject: ["choices": [["message": ["content": content]]]])) ?? Data()
        return FakeChat([(200, String(decoding: body, as: UTF8.self))])
    }

    var count: Int { asked.withLock { $0.count } }

    var send: ConnectionTest.Send {
        { request in
            self.asked.withLock { $0.append(request) }
            let (status, body) = self.replies.withLock { replies in replies.count > 1 ? replies.removeFirst() : replies[0] }
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }
}

@Suite struct CleanupTests {
    let groq = PolishConnection(baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", key: APIKey("gsk_abcdefgh1234")!)
    let heard = "um send the report tomorrow and copy the whole team on it please"

    func rules() throws -> CleanupRules {
        CleanupRules(format: formatSpec, polish: try #require(polishRules), hallucinations: try #require(hallucinationList))
    }

    func formatted(_ text: String, _ settings: CleanupSettings) throws -> String {
        formatTranscript(text, options: settings.options, spec: formatSpec)
    }

    func finish(_ settings: CleanupSettings = CleanupSettings(), connection: PolishConnection?, chat: FakeChat, text: String? = nil) async throws -> String {
        await Cleanup.finish(text ?? heard, settings: settings, rules: try rules(), connection: connection, send: chat.send)
    }

    @Test func theDefaultsAreDesktops() {
        let settings = CleanupSettings()
        #expect(settings.level == .full && settings.numbers == .auto && !settings.smartLists && settings.polish)
        #expect(settings.dictionary.isEmpty && settings.expansions.isEmpty)
    }

    /// Settings saved by an older build, missing newer fields, still read.
    @Test func savedSettingsMissingAFieldStillRead() throws {
        let saved = try JSONDecoder().decode(CleanupSettings.self, from: Data(#"{"level":"light"}"#.utf8))
        #expect(saved == CleanupSettings(level: .light))
        #expect(try JSONDecoder().decode(CleanupSettings.self, from: Data("{}".utf8)) == CleanupSettings())
        let full = CleanupSettings(level: .off, numbers: .digits, smartLists: true, polish: false, dictionary: [DictionaryEntry(from: "a", to: "b")], expansions: [ExpansionEntry(trigger: "c", text: "d")])
        #expect(try JSONDecoder().decode(CleanupSettings.self, from: JSONEncoder().encode(full)) == full)
    }

    @Test func fullPolishesTheFormattedText() async throws {
        let chat = FakeChat.says("Send the report tomorrow and copy the whole team on it, please.")
        #expect(try await finish(connection: groq, chat: chat) == "Send the report tomorrow and copy the whole team on it, please.")
        #expect(chat.count == 1)
        let sent = try JSONSerialization.jsonObject(with: try #require(chat.asked.withLock { $0[0].httpBody })) as? [String: Any]
        let user = ((sent?["messages"] as? [[String: String]])?.last)?["content"]
        #expect(user == (try formatted(heard, CleanupSettings())))
    }

    /// A failed or rejected polish keeps the formatted text, and says why.
    @Test(arguments: [(500, "{}"), (200, #"{"choices":[{"message":{"content":"Here is the cleaned text: hi."}}]}"#)])
    func aPolishThatFailsKeepsTheFormattedText(_ status: Int, _ body: String) async throws {
        let reasons = Mutex<[String]>([])
        let text = await Cleanup.finish(heard, settings: CleanupSettings(), rules: try rules(), connection: groq, send: FakeChat([(status, body)]).send) { reason in
            reasons.withLock { $0.append(reason) }
        }
        #expect(text == (try formatted(heard, CleanupSettings())))
        #expect(reasons.withLock { $0 }.count == 1)
    }

    @Test(arguments: [FormatOptions.Level.off, .light])
    func belowFullNothingIsSent(_ level: FormatOptions.Level) async throws {
        let chat = FakeChat.says("anything")
        let settings = CleanupSettings(level: level)
        #expect(try await finish(settings, connection: groq, chat: chat) == (try formatted(heard, settings)))
        #expect(chat.count == 0)
    }

    @Test func polishOffSendsNothing() async throws {
        let chat = FakeChat.says("anything")
        #expect(try await finish(CleanupSettings(polish: false), connection: groq, chat: chat) == (try formatted(heard, CleanupSettings())))
        #expect(chat.count == 0)
    }

    /// A take of only filler formats to nothing, and nothing is polished.
    @Test func textTheFormatterEmptiedIsNotSent() async throws {
        let chat = FakeChat.says("Um.")
        #expect(try await finish(connection: groq, chat: chat, text: "um uh") == "")
        #expect(chat.count == 0)
    }

    @Test func noConnectionSendsNothing() async throws {
        let chat = FakeChat.says("anything")
        #expect(try await finish(connection: nil, chat: chat) == (try formatted(heard, CleanupSettings())))
        #expect(chat.count == 0)
    }

    /// The dictionary corrects the words as heard, rides to polish as a
    /// hint, and its casing wins over whatever polish returned; expansions
    /// run last.
    @Test func theDictionaryAndExpansionsWrapPolish() async throws {
        let settings = CleanupSettings(dictionary: [DictionaryEntry(from: "labroy", to: "LaBroi")], expansions: [ExpansionEntry(trigger: "my email", text: "user@example.com")])
        let chat = FakeChat.says("Tell labroi the plan and send it to my email.")
        let text = try await finish(settings, connection: groq, chat: chat, text: "tell labroy the plan and send it to my email")
        #expect(text == "Tell LaBroi the plan and send it to user@example.com.")
        let system = try JSONSerialization.jsonObject(with: try #require(chat.asked.withLock { $0[0].httpBody })) as? [String: Any]
        let prompt = ((system?["messages"] as? [[String: String]])?.first)?["content"] ?? ""
        #expect(prompt.hasSuffix(#""labroy" is written "LaBroi"."#))
    }

    @Test func aSeparateCleanupProviderNeedsItsOwnKey() throws {
        var settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        settings.cleanup.separate = true
        settings.cleanup.baseUrl = "https://api.deepseek.com"
        settings.cleanup.llmModel = "deepseek-flash"
        let keys: [String: APIKey] = ["https://api.groq.com/openai/v1": APIKey("gsk_groqgroq1111")!, "https://api.deepseek.com": APIKey("sk-deepdeep2222")!]
        #expect(settings.polishConnection { keys[$0] }?.model == "deepseek-flash")
        // Without its own key, cleanup rides the transcription provider.
        #expect(settings.polishConnection { $0 == "https://api.deepseek.com" ? nil : keys[$0] } == PolishConnection(baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", key: APIKey("gsk_groqgroq1111")!))
        #expect(settings.polishConnection { _ in nil } == nil)
        settings.cleanup.separate = false
        #expect(settings.polishConnection { keys[$0] }?.baseUrl == "https://api.groq.com/openai/v1")
    }
}
