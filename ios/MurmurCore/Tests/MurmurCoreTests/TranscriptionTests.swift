// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Synchronization
import Testing
@testable import MurmurCore

@Suite struct TranscriptionTests {
    let key = APIKey("gsk_abcdefgh1234")!
    let groq = "https://api.groq.com/openai/v1"
    let wav = Wav.encodePcm16([0.1, -0.1, 0.2], sampleRate: 16_000)

    func answer(_ status: Int, _ body: String = #"{"text":"send the invoice"}"#) -> ConnectionTest.Send {
        { request in
            (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    /// Counts calls, failing with each status in turn, then the last.
    final class Script: Sendable {
        let statuses: [Int]
        let calls = Mutex(0)
        init(_ statuses: [Int]) { self.statuses = statuses }

        var send: ConnectionTest.Send {
            { request in
                let index = self.calls.withLock { calls in
                    defer { calls += 1 }
                    return calls
                }
                let status = self.statuses[min(index, self.statuses.count - 1)]
                let body = status == 200 ? #"{"text":"recovered"}"# : "{}"
                return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        }
    }

    @Test func itPostsOneWavWithTheModelAndKey() throws {
        let request = try #require(Transcription.request(wav: wav, baseUrl: groq + "/", model: "whisper-large-v3-turbo", key: key, boundary: "b"))
        #expect(request.url?.absoluteString == "https://api.groq.com/openai/v1/audio/transcriptions")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer gsk_abcdefgh1234")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "multipart/form-data; boundary=b")
        #expect(request.timeoutInterval == 30)
        let body = try #require(request.httpBody)
        let text = String(decoding: body, as: UTF8.self)
        #expect(text.contains(#"name="file"; filename="audio.wav""#))
        #expect(text.contains("Content-Type: audio/wav"))
        #expect(text.contains("name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n"))
        #expect(text.contains("name=\"response_format\"\r\n\r\njson\r\n"))
        #expect(text.hasSuffix("--b--\r\n"))
        #expect(body.range(of: wav) != nil)
        #expect(!text.contains("name=\"prompt\""))
    }

    /// The dictionary's spellings ride along as a prompt (IOS-013); an empty
    /// one sends none.
    @Test func theSpellingHintRidesAlongAsAPrompt() throws {
        let hinted = try #require(Transcription.request(wav: wav, baseUrl: groq, model: "m", key: key, prompt: "LaBroi, Eze Media.", boundary: "b"))
        let text = String(decoding: try #require(hinted.httpBody), as: UTF8.self)
        #expect(text.contains("name=\"prompt\"\r\n\r\nLaBroi, Eze Media.\r\n"))
        let blank = try #require(Transcription.request(wav: wav, baseUrl: groq, model: "m", key: key, prompt: "  ", boundary: "b"))
        #expect(!String(decoding: try #require(blank.httpBody), as: UTF8.self).contains("name=\"prompt\""))
    }

    /// Answers each request with the next reply, then the last, and notes
    /// whether each request carried a prompt.
    final class Replies: Sendable {
        let replies: [(Int, String)]
        let prompted = Mutex<[Bool]>([])
        init(_ replies: [(Int, String)]) { self.replies = replies }

        var send: ConnectionTest.Send {
            { request in
                let body = String(decoding: request.httpBody ?? Data(), as: UTF8.self)
                let index = self.prompted.withLock { prompted in
                    prompted.append(body.contains("name=\"prompt\""))
                    return prompted.count - 1
                }
                let (status, text) = self.replies[min(index, self.replies.count - 1)]
                return (Data(text.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
        }
    }

    /// A provider that refuses the hint still hears the take: it is sent
    /// once more without it. A take refused with no hint is not.
    @Test func aRefusedHintIsDroppedAndTheTakeSentAgain() async {
        let refused = Replies([(400, "{}"), (200, #"{"text":"la broy called"}"#)])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, prompt: "LaBroi.", send: refused.send) == .words("la broy called"))
        #expect(refused.prompted.withLock { $0 } == [true, false])
        let plain = Replies([(400, "{}"), (200, #"{"text":"never"}"#)])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: plain.send) == .failed(.badrequest, detail: "http 400"))
        #expect(plain.prompted.withLock { $0 } == [false])
    }

    /// Whisper can say a prompt back on near silence. Words that are only
    /// the hint's own spellings are heard again without it, so the hint is
    /// never typed in your place, and a take of only your word still gets it.
    @Test func anEchoedHintIsHeardAgainWithoutIt() async {
        let hint = "LaBroi, Eze Media, murmur."
        let echoed = Replies([(200, #"{"text":"LaBroi, Eze Media, murmur."}"#), (200, #"{"text":""}"#)])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, prompt: hint, send: echoed.send) == .words(""))
        #expect(echoed.prompted.withLock { $0 } == [true, false])
        let alone = Replies([(200, #"{"text":"LaBroi."}"#), (200, #"{"text":"La Broy."}"#)])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, prompt: hint, send: alone.send) == .words("La Broy."))
        let spoken = Replies([(200, #"{"text":"LaBroi called Eze Media."}"#)])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, prompt: hint, send: spoken.send) == .words("LaBroi called Eze Media."))
        #expect(spoken.prompted.withLock { $0 } == [true])
    }

    @Test func anAddressTheIPhoneCannotCallSendsNothing() async {
        #expect(Transcription.request(wav: wav, baseUrl: "http://192.168.1.5:8000/v1", model: "m", key: key) == nil)
        let script = Script([200])
        let result = await Transcription.run(wav: wav, baseUrl: "", model: "m", key: key, send: script.send)
        #expect(result == .failed(.network, detail: "not an address murmur can call"))
        #expect(script.calls.withLock { $0 } == 0)
    }

    @Test func aSuccessReadsTheWords() async {
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: answer(200)) == .words("send the invoice"))
    }

    @Test func aSuccessWithoutTextIsTheServer() async {
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: answer(200, "{}")) == .failed(.server, detail: "response missing text"))
    }

    @Test(arguments: [(401, TranscriptionFailure.auth), (403, .auth), (400, .badrequest), (404, .badrequest), (413, .badrequest), (429, .badrequest)])
    func aRefusalIsSortedAndNeverRetried(_ status: Int, _ kind: TranscriptionFailure) async {
        let script = Script([status])
        let result = await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send)
        #expect(result == .failed(kind, detail: "http \(status)"))
        #expect(script.calls.withLock { $0 } == 1)
    }

    @Test func aServerFailureGetsOneMoreTry() async {
        let script = Script([500, 200])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send) == .words("recovered"))
        #expect(script.calls.withLock { $0 } == 2)
    }

    @Test func twoServerFailuresGiveUp() async {
        let script = Script([503])
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: script.send) == .failed(.server, detail: "http 503"))
        #expect(script.calls.withLock { $0 } == 2)
    }

    @Test func noAnswerInTimeIsATimeout() async {
        let slow: ConnectionTest.Send = { _ in throw URLError(.timedOut) }
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: slow) == .failed(.timeout, detail: "no response in 30 s"))
    }

    @Test func noConnectionIsTheNetwork() async {
        let offline: ConnectionTest.Send = { _ in throw URLError(.notConnectedToInternet) }
        #expect(await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: offline) == .failed(.network, detail: "url error -1009"))
    }

    /// The kinds are desktop's, word for word, since a waiting take's
    /// record names one.
    @Test func theKindsAreDesktops() {
        #expect(TranscriptionFailure.allCases.map(\.rawValue) == ["auth", "badrequest", "server", "network", "timeout"])
    }

    /// A failure's detail never carries the key, even when the provider
    /// echoes it.
    @Test func aDetailNeverHoldsTheKey() async {
        let echo = answer(500, #"{"error":{"message":"bad key gsk_abcdefgh1234"}}"#)
        let result = await Transcription.run(wav: wav, baseUrl: groq, model: "m", key: key, send: echo)
        #expect(!"\(result)".contains(key.secret))
    }
}
