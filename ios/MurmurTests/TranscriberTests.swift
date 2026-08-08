import XCTest
@testable import Murmur

// US-103: readable errors, request-body privacy, and the multipart form,
// all without a network.
final class TranscriberTests: XCTestCase {

    private var spec: FormatSpec!

    override func setUpWithError() throws {
        spec = try FormatSpec.load(from: Bundle(for: TranscriberTests.self))
    }

    // ------------------------------------------------------------- errors

    func testBadKeyMessage() {
        XCTAssertEqual(Transcriber.apiErrorMessage(status: 401, body: nil),
                       "Invalid API key. Check Settings.")
    }

    func testRateLimitMessage() {
        XCTAssertEqual(Transcriber.apiErrorMessage(status: 429, body: nil),
                       "Rate limited by the API. Wait a moment and try again.")
    }

    func testApiBodyMessageSurfaces() {
        let body = try! JSONSerialization.data(withJSONObject:
            ["error": ["message": "model not found"]])
        XCTAssertEqual(Transcriber.apiErrorMessage(status: 404, body: body), "model not found")
    }

    func testTimeoutMessage() {
        let err = URLError(.timedOut)
        XCTAssertEqual(Transcriber.friendlyMessage(for: err),
                       "The transcription request timed out.")
    }

    func testOfflineMessage() {
        let err = URLError(.notConnectedToInternet)
        XCTAssertEqual(Transcriber.friendlyMessage(for: err),
                       "Could not reach the transcription API. Check your internet connection.")
    }

    // ------------------------------------------------------------ privacy

    // Hard constraint: expansion values never reach any API. The format
    // request body is built with expansions present in settings and must
    // not contain the value anywhere.
    func testExpansionValuesNeverInFormatRequest() throws {
        var settings = PipelineSettings()
        settings.expansions = [Expansion(trigger: "my email", value: "lb@example.com")]
        settings.dictionary = ["Murmur"]
        settings.corrections = [CorrectionPair(from: "cloud code", to: "Claude Code")]
        let body = try Transcriber.formatRequestBody(text: "send it to my email", settings: settings, spec: spec)
        let text = String(data: body, encoding: .utf8)!
        XCTAssertFalse(text.contains("lb@example.com"))
        XCTAssertTrue(text.contains("Murmur"), "dictionary terms should ride the prompt")
        XCTAssertTrue(text.contains("Claude Code"), "learned corrections should ride the prompt")
    }

    func testExpansionValuesNeverInTranscriptionRequest() {
        var settings = PipelineSettings()
        settings.expansions = [Expansion(trigger: "my email", value: "lb@example.com")]
        settings.dictionary = ["Groq", "Murmur"]
        let body = Transcriber.transcriptionBody(audio: Data([0x00, 0x01]), settings: settings,
                                                 spec: spec, boundary: "test-boundary")
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertFalse(text.contains("lb@example.com"))
        // US-029: the vocabulary prompt is bare terms now, not an instruction
        // sentence, because the sentence was itself echoable and Whisper spat
        // it into a live transcript. Asserted against the spec rather than a
        // copy of it, so this test cannot go stale the next time it changes.
        XCTAssertTrue(text.contains(fillTemplate(spec.prompt.vocabularyPrompt, ["terms": "Groq, Murmur"])))
    }

    // ---------------------------------------------------------- multipart

    func testTranscriptionBodyCarriesDesktopFields() {
        var settings = PipelineSettings()
        settings.language = "en"
        let body = Transcriber.transcriptionBody(audio: Data([0xFF]), settings: settings,
                                                 spec: spec, boundary: "b")
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"model\"\r\n\r\nwhisper-large-v3-turbo"))
        XCTAssertTrue(text.contains("name=\"temperature\"\r\n\r\n0"))
        XCTAssertTrue(text.contains("name=\"response_format\"\r\n\r\nverbose_json"))
        XCTAssertTrue(text.contains("name=\"language\"\r\n\r\nen"))
        XCTAssertTrue(text.contains("filename=\"dictation.m4a\""))
        XCTAssertTrue(text.hasSuffix("--b--\r\n"))
    }

    func testAutoLanguageOmitted() {
        let body = Transcriber.transcriptionBody(audio: Data(), settings: PipelineSettings(),
                                                 spec: spec, boundary: "b")
        XCTAssertFalse(String(decoding: body, as: UTF8.self).contains("name=\"language\""))
    }

    // -------------------------------------------------------- chat parse

    func testChatContentParses() throws {
        let payload: [String: Any] = ["choices": [["message": ["content": "  Cleaned text. "]]]]
        let data = try JSONSerialization.data(withJSONObject: payload)
        XCTAssertEqual(Transcriber.chatContent(from: data), "Cleaned text.")
    }

    func testChatContentEmptyOnGarbage() {
        XCTAssertEqual(Transcriber.chatContent(from: Data("not json".utf8)), "")
    }
}
