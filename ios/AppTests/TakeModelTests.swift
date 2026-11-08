// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Synchronization
import Testing
@testable import murmur

/// A provider that answers each request with the next of its replies,
/// then the last, and remembers what it was sent.
final class FakeProvider: Sendable {
    let replies: Mutex<[(Int, String)]>
    let sent = Mutex<[URLRequest]>([])

    init(_ replies: [(Int, String)]) {
        self.replies = Mutex(replies)
    }

    static func says(_ words: String) -> FakeProvider { FakeProvider([(200, #"{"text":"\#(words)"}"#)]) }

    var requests: [URLRequest] { sent.withLock { $0 } }

    func answer(_ replies: [(Int, String)]) { self.replies.withLock { $0 = replies } }

    var send: ConnectionTest.Send {
        { request in
            self.sent.withLock { $0.append(request) }
            let (status, body) = self.replies.withLock { replies in replies.count > 1 ? replies.removeFirst() : replies[0] }
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }
}

@MainActor @Suite struct TakeModelTests {
    let groq = "https://api.groq.com/openai/v1"
    let catalog: ProviderCatalog
    let rules: TakeRules
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "murmur-takes-\(UUID().uuidString)", directoryHint: .isDirectory))
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let sink = Sink()

    /// What a take copied, what it kept in history, what it noted, and the
    /// time it reads.
    @MainActor final class Sink {
        var copied: [String] = []
        var kept: [HistoryEntry] = []
        var noted: [ActivityEvent] = []
        var now = Date(timeIntervalSince1970: 1_790_000_000)
    }

    init() throws {
        catalog = try BundledRules.catalog()
        rules = try BundledRules.takeRules()
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        // These tests are about the take; cleanup's own tests turn polish on.
        CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    }

    func model(_ provider: FakeProvider) -> TakeModel {
        model(send: provider.send)
    }

    func model(send: @escaping ConnectionTest.Send) -> TakeModel {
        TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring, send: send,
            copy: { [sink] text in sink.copied.append(text) },
            now: { [sink] in sink.now },
            record: { [sink] entry in sink.kept.append(entry) },
            note: { [sink] event in sink.noted.append(event) }
        )
    }

    func pass(_ seconds: TimeInterval) {
        sink.now = sink.now.addingTimeInterval(seconds)
    }

    func take(_ model: TakeModel) async {
        await model.start()
        pass(2)
        await model.stop()
    }

    /// Background time held by takes: how many are held now, and how many
    /// were held while the provider was being asked.
    final class Held: Sendable {
        let now = Mutex(0)
        let whileSending = Mutex<[Int]>([])
    }

    /// A take holds background time from stop until its words are safe, and
    /// so does a retry, so the words land even when the session that kept
    /// murmur running has just ended.
    @Test func takesHoldBackgroundTimeUntilTheirWordsAreSafe() async throws {
        let held = Held()
        let provider = FakeProvider([(500, "down"), (500, "down"), (200, #"{"text":"Kept."}"#)])
        let model = TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: catalog,
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in
                held.whileSending.withLock { $0.append(held.now.withLock { $0 }) }
                return try await provider.send(request)
            },
            copy: { _ in },
            keepAlive: {
                held.now.withLock { $0 += 1 }
                return { held.now.withLock { $0 -= 1 } }
            }
        )
        await model.start()
        await model.stop()
        #expect(model.waiting.count == 1)
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("Kept."))
        #expect(held.now.withLock { $0 } == 0)
        #expect(held.whileSending.withLock { $0 } == [1, 1, 1])
    }

    @Test func theFirstTakeAsksForTheMicrophone() async {
        let model = model(.says("hello"))
        await model.start()
        #expect(microphone.asked == 1)
        #expect(model.state == .recording(since: Date(timeIntervalSince1970: 1_790_000_000)))
    }

    @Test func noMicrophoneSaysHowToTurnItOn() async {
        microphone.allowed = false
        let model = model(.says("hello"))
        await model.start()
        #expect(model.state == .micOff)
        #expect(microphone.started == 0)
    }

    @Test func aMicrophoneThatWillNotStartSaysSo() async {
        microphone.startError = MicrophoneError.noInput
        let model = model(.says("hello"))
        await model.start()
        #expect(model.state == .micFailed)
    }

    @Test func aSpokenTakeComesBackAsWords() async throws {
        let provider = FakeProvider.says("Send the invoice tomorrow.")
        let model = model(provider)
        await take(model)
        #expect(model.state == .words("Send the invoice tomorrow."))
        let request = try #require(provider.requests.first)
        #expect(provider.requests.count == 1)
        #expect(request.url?.absoluteString == groq + "/audio/transcriptions")
        #expect(String(decoding: try #require(request.httpBody), as: UTF8.self).contains("whisper-large-v3-turbo"))
        #expect(model.waiting.isEmpty)
    }

    /// The dictionary's spellings go to transcription as a hint (IOS-013);
    /// without a dictionary, no hint goes.
    @Test func theDictionaryHintsTheSpellings() async throws {
        let provider = FakeProvider.says("LaBroi called.")
        let model = model(provider)
        await take(model)
        #expect(!String(decoding: try #require(provider.requests.last?.httpBody), as: UTF8.self).contains("name=\"prompt\""))
        var settings = CleanupStore(defaults: defaults).load()
        settings.dictionary = [DictionaryEntry(from: "la broy", to: "LaBroi")]
        CleanupStore(defaults: defaults).save(settings)
        await take(model)
        #expect(String(decoding: try #require(provider.requests.last?.httpBody), as: UTF8.self).contains("name=\"prompt\"\r\n\r\nLaBroi.\r\n"))
    }

    /// Each take notes what happened to it (IOS-014): captured with its
    /// level, then its words as a count; silence with its level; a failure
    /// with its kind; the microphone being off.
    @Test func eachTakeNotesWhatHappened() async throws {
        let provider = FakeProvider.says("Send the invoice tomorrow.")
        let model = model(provider)
        await take(model)
        #expect(sink.noted.count == 2)
        guard case .captured(let ms, let peak, let voiced) = sink.noted.first else { throw TakeModelTestsError.unexpected }
        #expect(ms == 2000)
        #expect(peak > 0.1 && voiced > 0)
        #expect(sink.noted.last == .words(count: 4, retried: false))
        microphone.samples = ScriptedMicrophone.silence
        await take(model)
        guard case .heardNothing(_, let quiet, 0, false) = sink.noted.last else { throw TakeModelTestsError.unexpected }
        #expect(quiet == 0)
        microphone.samples = ScriptedMicrophone.tone
        provider.answer([(401, "{}")])
        await take(model)
        #expect(sink.noted.last == .failed(TakeFailure(kind: "auth", detail: "http 401"), saved: true, retried: false))
        provider.answer([(200, #"{"text":"Kept."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(sink.noted.last == .words(count: 1, retried: true))
        microphone.allowed = false
        await model.start()
        #expect(sink.noted.last == .micOff)
    }

    enum TakeModelTestsError: Error { case unexpected }

    /// A take dropped before it was sent (you left the screen, the keyboard
    /// went away, or it ran to its limit) still leaves a line, with how long
    /// it recorded.
    @Test func aCancelledTakeIsNoted() async {
        let model = model(.says("never sent"))
        await model.start()
        pass(1.5)
        model.cancel()
        #expect(model.state == .idle)
        #expect(sink.noted == [.cancelled(durationMs: 1500)])
        #expect(ActivityEvent.cancelled(durationMs: 1500).line == "take cancelled ms=1500")
        model.cancel()
        #expect(sink.noted.count == 1)
    }

    @Test func silenceIsNeverSent() async {
        microphone.samples = ScriptedMicrophone.silence
        let provider = FakeProvider.says("Thank you.")
        let model = model(provider)
        await take(model)
        #expect(model.state == .heardNothing(sent: false))
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.isEmpty)
    }

    @Test func aPhraseInventedOnSilenceIsHeardNothing() async {
        let model = model(.says("Thank you."))
        await take(model)
        #expect(model.state == .heardNothing(sent: true))
        #expect(model.waiting.isEmpty)
    }

    @Test func aFailedTakeWaitsWithItsAudio() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        let failure = TakeFailure(kind: "server", detail: "http 503")
        #expect(model.state == .failed(failure, saved: true))
        let waiting = try #require(model.waiting.first)
        #expect(model.waiting.count == 1)
        #expect(waiting.failure == failure)
        #expect(waiting.startedAt == Date(timeIntervalSince1970: 1_790_000_000))
        #expect(try store.audio(waiting.id) == TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate))
    }

    @Test func noKeyWaitsWithoutSending() async {
        try? ring.remove(for: groq)
        let provider = FakeProvider.says("hello")
        let model = model(provider)
        await take(model)
        #expect(model.state == .failed(.noKey, saved: true))
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.first?.failure == .noKey)
    }

    /// A take that comes back as words is kept in history (IOS-012), with
    /// when it was spoken and how long it recorded.
    @Test func aTakeThatLandsIsKeptInHistory() async {
        let model = model(.says("Send the invoice tomorrow."))
        let spoken = sink.now
        await take(model)
        #expect(sink.kept.count == 1)
        #expect(sink.kept.first?.words == "Send the invoice tomorrow.")
        #expect(sink.kept.first?.at == spoken)
        #expect(sink.kept.first?.durationMs == 2_000)
        #expect(sink.kept.first?.retried == false)
    }

    /// Silence and failures keep nothing; a retried take is kept at the
    /// time it was spoken, marked retried.
    @Test func onlyWordsAreKeptAndRetriesKeepTheirTime() async {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        let spoken = sink.now
        await take(model)
        #expect(sink.kept.isEmpty)
        microphone.samples = ScriptedMicrophone.silence
        await take(model)
        #expect(sink.kept.isEmpty)
        provider.answer([(200, #"{"text":"Late words."}"#)])
        pass(60)
        await model.retry(model.waiting.map(\.id))
        #expect(sink.kept.map(\.words) == ["Late words."])
        #expect(sink.kept.first?.retried == true)
        #expect(sink.kept.first?.at == spoken)
    }

    /// Deleting a take in murmur takes its words off the Dictate screen too.
    @Test func forgottenWordsLeaveTheScreen() async {
        let model = model(.says("Private words."))
        await take(model)
        model.forget(["Other words."])
        #expect(model.state == .words("Private words."))
        model.forget(["Private words."])
        #expect(model.state == .idle)
        await take(model)
        model.forget(nil)
        #expect(model.state == .idle)
    }

    @Test func aRetryDeliversTheWordsThenDeletesTheAudio() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(200, #"{"text":"Send the invoice tomorrow."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("Send the invoice tomorrow."))
        #expect(sink.copied == ["Send the invoice tomorrow."])
        #expect(model.waiting.isEmpty)
        #expect(store.list().isEmpty)
        #expect(model.message == "Done: the words are above and on your clipboard.")
    }

    /// Retry all keeps every take's words, not only the last.
    @Test func retryAllKeepsEveryTakesWords() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        pass(5)
        await take(model)
        #expect(model.waiting.count == 2)
        provider.answer([(200, #"{"text":"First."}"#), (200, #"{"text":"Second."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("First.\n\nSecond."))
        #expect(sink.copied.last == "First.\n\nSecond.")
        #expect(model.waiting.isEmpty)
        #expect(model.message == "Done: 2 takes. Their words are above and on your clipboard.")
    }

    /// Retry all delivers in the order the takes were spoken, so a message
    /// dictated in parts pastes back in order.
    @Test func retryAllKeepsTheOrderSpoken() async throws {
        await take(model(FakeProvider([(503, "{}")])))
        pass(5)
        microphone.samples = ScriptedMicrophone.tone + ScriptedMicrophone.tone
        await take(model(FakeProvider([(503, "{}")])))
        let older = try store.audio(try #require(store.list().last?.id))
        let answersByTake: ConnectionTest.Send = { request in
            let words = request.httpBody?.range(of: older) != nil ? "Older." : "Newer."
            return (Data(#"{"text":"\#(words)"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let model = model(send: answersByTake)
        await model.retry(model.waiting.map(\.id))
        #expect(model.state == .words("Older.\n\nNewer."))
        #expect(sink.copied.last == "Older.\n\nNewer.")
    }

    /// The app keeps one take model, so a take still transcribing when you
    /// leave Dictate is there when you come back, and two visits can never
    /// retry the same take at once.
    @Test func dictateKeepsOneModelAcrossVisits() throws {
        let first = try #require(TakeModel.live())
        #expect(TakeModel.live() === first)
    }

    /// The words are cleaned up before they show: formatted, then polished
    /// by the cleanup model (IOS-007).
    @Test func aTakeIsCleanedUpBeforeItShows() async throws {
        CleanupStore(defaults: defaults).save(CleanupSettings())
        let provider = FakeProvider([(200, #"{"text":"um send the invoice tomorrow"}"#), (200, #"{"choices":[{"message":{"content":"Send the invoice tomorrow."}}]}"#)])
        let model = model(provider)
        await take(model)
        #expect(model.state == .words("Send the invoice tomorrow."))
        #expect(provider.requests.map { $0.url?.lastPathComponent } == ["transcriptions", "completions"])
    }

    /// A polish that fails keeps the formatted words, and the take is
    /// delivered, not left waiting.
    @Test func aPolishThatFailsKeepsTheFormattedWords() async throws {
        CleanupStore(defaults: defaults).save(CleanupSettings())
        let model = model(FakeProvider([(200, #"{"text":"um send the invoice tomorrow"}"#), (500, "{}")]))
        await take(model)
        #expect(model.state == .words(formatTranscript("um send the invoice tomorrow", options: FormatOptions(), spec: rules.format)))
        #expect(model.waiting.isEmpty)
    }

    @Test func wordsThatCleanUpToNothingAreHeardNothing() async {
        let model = model(.says("um uh"))
        await take(model)
        #expect(model.state == .heardNothing(sent: true))
    }

    @Test func aRetriedTakeIsCleanedUpToo() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(200, #"{"text":"um send it to dana"}"#)])
        await model.retry(model.waiting.map(\.id))
        let cleaned = formatTranscript("um send it to dana", options: FormatOptions(), spec: rules.format)
        #expect(model.state == .words(cleaned))
        #expect(sink.copied == [cleaned])
    }

    @Test func aRetryThatFailsAgainUpdatesTheReason() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(401, "{}")])
        await model.retry(model.waiting.map(\.id))
        #expect(model.waiting.first?.failure == TakeFailure(kind: "auth", detail: "http 401"))
        #expect(model.message == "Still could not transcribe. The reason is updated below; the audio stays until you retry or discard it.")
        #expect(sink.copied.isEmpty)
    }

    @Test func aRetryThatHearsNothingSaysSo() async throws {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        provider.answer([(200, #"{"text":"Thank you."}"#)])
        await model.retry(model.waiting.map(\.id))
        #expect(model.waiting.first?.failure == .noSpeech)
    }

    /// Discard turns into delete audio?, and the second tap of a quick
    /// double tap never deletes.
    @Test func discardAsksFirstAndIgnoresADoubleTap() async throws {
        let model = model(FakeProvider([(503, "{}")]))
        await take(model)
        let id = try #require(model.waiting.first?.id)
        model.discard(id)
        #expect(model.armed == id)
        pass(0.2)
        model.discard(id)
        #expect(model.waiting.count == 1)
        pass(0.4)
        model.discard(id)
        #expect(model.waiting.isEmpty)
        #expect(model.armed == nil)
    }

    @Test func leavingMidTakeKeepsAndSendsNothing() async {
        let provider = FakeProvider.says("hello")
        let model = model(provider)
        await model.start()
        model.cancel()
        #expect(model.state == .idle)
        #expect(provider.requests.isEmpty)
        #expect(model.waiting.isEmpty)
    }

    @Test func aRetryWaitsWhileATakeRecords() async {
        let provider = FakeProvider([(503, "{}")])
        let model = model(provider)
        await take(model)
        await model.start()
        await model.retry(model.waiting.map(\.id))
        #expect(provider.requests.count == 2)
        #expect(model.isRecording)
    }

    /// The take reads today's provider choice each time.
    @Test func aTakeUsesTheChosenProvider() async throws {
        var settings = ConnectionStore(defaults: defaults).load(catalog: catalog)
        settings.transcription.baseUrl = "https://api.openai.com/v1"
        settings.transcription.sttModel = "gpt-transcribe"
        ConnectionStore(defaults: defaults).save(settings)
        try ring.save(try #require(APIKey("sk-openaiopenai2222")), for: "https://api.openai.com/v1")
        let provider = FakeProvider.says("hello there")
        let model = model(provider)
        await take(model)
        let request = try #require(provider.requests.first)
        #expect(request.url?.absoluteString == "https://api.openai.com/v1/audio/transcriptions")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer sk-openaiopenai2222")
    }
}
