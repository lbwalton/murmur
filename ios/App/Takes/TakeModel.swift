// SPDX-License-Identifier: GPL-3.0-only
// One take in the app (ios/prd.json IOS-006): record, keep silence from
// typing, send one WAV to the chosen provider, clean up the words
// (IOS-007), and show them, Heard nothing, or why it failed. A failed
// take waits with its audio for a retry, as on desktop (src/main/retry.ts):
// one thing runs at a time, and a take's audio goes only once its words
// are safe.
import Foundation
import MurmurCore

/// A note take's words and where they landed, or no place when the note
/// could not be saved (IOS-023).
struct KeptNote: Equatable, Sendable {
    let words: String
    let place: String?
}

/// The shared rules a take runs on, read once from the app bundle.
struct TakeRules: Sendable {
    let gate: SpeechGateSpec
    let hallucinations: HallucinationList
    let format: FormatSpec
    let polish: PolishRules

    var cleanup: CleanupRules { CleanupRules(format: format, polish: polish, hallucinations: hallucinations) }
}

@Observable @MainActor final class TakeModel {
    enum State: Equatable {
        case idle
        case recording(since: Date)
        case transcribing
        case words(String)
        /// sent is false when the gate stopped it before upload.
        case heardNothing(sent: Bool)
        /// saved is false when even the audio could not be kept.
        case failed(TakeFailure, saved: Bool)
        case micOff
        case micFailed
    }

    /// What a take is for (IOS-023): words to show and copy, or a note to
    /// keep. Only New note starts a note take; the keyboard and Dictate
    /// share this model and their takes are never kept as notes. An
    /// instruction (IOS-024) says how to change selected text: only the
    /// dictionary touches its words, as on desktop, and like desktop's
    /// transforms it counts toward nothing, so it stays out of history.
    enum Purpose: Sendable {
        case words, note, instruction
    }

    /// Two taps closer together than this are one double tap.
    static let doubleTap: TimeInterval = 0.5

    private(set) var state: State = .idle
    private(set) var waiting: [WaitingTake] = []
    /// The waiting takes a retry is running through, or empty.
    private(set) var retrying: [String] = []
    /// The waiting take whose Discard now asks delete audio?
    private(set) var armed: String?
    private(set) var message: String?
    /// The note the last note take kept, until the next take starts.
    private(set) var kept: KeptNote?

    @ObservationIgnored private var starting = false
    /// What the take recording now is for.
    @ObservationIgnored private var purpose = Purpose.words
    @ObservationIgnored private var armedAt = Date.distantPast
    @ObservationIgnored private let microphone: any Microphone
    @ObservationIgnored private let store: WaitingStore
    @ObservationIgnored private let rules: TakeRules
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let connections: ConnectionStore
    @ObservationIgnored private let cleanup: CleanupStore
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send
    @ObservationIgnored private let copy: @MainActor (String) -> Void
    @ObservationIgnored private let now: @MainActor () -> Date
    /// Holds background time; the closure it returns lets it go.
    @ObservationIgnored private let keepAlive: @MainActor () -> @MainActor () -> Void
    /// Keeps a take that came back as words in history (IOS-012).
    @ObservationIgnored private let record: @MainActor (HistoryEntry) -> Void
    /// Notes what happened to each take in the activity log (IOS-014).
    @ObservationIgnored private let note: @MainActor (ActivityEvent) -> Void
    /// Saves a note take's words, spoken at the given time; returns where
    /// they landed, or nil when they could not be saved (IOS-023).
    @ObservationIgnored private let keepNote: @MainActor (String, Date) -> String?

    init(
        microphone: any Microphone, store: WaitingStore, rules: TakeRules, catalog: ProviderCatalog,
        connections: ConnectionStore, cleanup: CleanupStore, ring: any KeyRing, send: @escaping ConnectionTest.Send,
        copy: @escaping @MainActor (String) -> Void, now: @escaping @MainActor () -> Date = { .now },
        keepAlive: @escaping @MainActor () -> @MainActor () -> Void = { {} },
        record: @escaping @MainActor (HistoryEntry) -> Void = { _ in },
        note: @escaping @MainActor (ActivityEvent) -> Void = { _ in },
        keepNote: @escaping @MainActor (String, Date) -> String? = { _, _ in nil }
    ) {
        self.microphone = microphone
        self.store = store
        self.rules = rules
        self.catalog = catalog
        self.connections = connections
        self.cleanup = cleanup
        self.ring = ring
        self.send = send
        self.copy = copy
        self.now = now
        self.keepAlive = keepAlive
        self.record = record
        self.note = note
        self.keepNote = keepNote
        waiting = store.list()
    }

    var isRecording: Bool {
        state.isRecording
    }

    /// How loud the take is right now, 0 to 1, for the live waveform.
    var level: Float {
        microphone.level
    }

    /// Transcribing or retrying: one thing at a time.
    var isBusy: Bool {
        state == .transcribing || !retrying.isEmpty
    }

    func toggle(as purpose: Purpose = .words) async {
        if isRecording { await stop() } else { await start(as: purpose) }
    }

    func start(as purpose: Purpose = .words) async {
        guard !starting, !isRecording, !isBusy else { return }
        starting = true
        defer { starting = false }
        message = nil
        armed = nil
        guard await microphone.allow() else {
            state = .micOff
            note(.micOff)
            return
        }
        do {
            try microphone.start()
            self.purpose = purpose
            kept = nil
            state = .recording(since: now())
        } catch {
            state = .micFailed
            note(.micFailed)
        }
    }

    func stop() async {
        guard case .recording(let since) = state else { return }
        let purpose = self.purpose
        self.purpose = .words
        // Asked before the microphone lets go: when a session has just ended,
        // the microphone was all that kept murmur running in the background.
        let release = keepAlive()
        defer { release() }
        let samples = microphone.stop()
        let length = Int(now().timeIntervalSince(since) * 1000)
        let peak = SpeechGate.peakLevel(samples)
        let voiced = Int(SpeechGate.voicedMs(samples, sampleRate: Wav.targetSampleRate, spec: rules.gate))
        guard let wav = TakeAudio.upload(samples, gate: rules.gate) else {
            state = .heardNothing(sent: false)
            note(.heardNothing(durationMs: length, peak: peak, voicedMs: voiced, sent: false))
            return
        }
        note(.captured(durationMs: length, peak: peak, voicedMs: voiced))
        state = .transcribing
        switch await words(for: wav, cleanedUp: purpose != .instruction) {
        case .success(let words):
            state = words.map(State.words) ?? .heardNothing(sent: true)
            if let words {
                // A note take is kept once, here, under the time it was spoken.
                if purpose == .note { kept = KeptNote(words: words, place: keepNote(words, since)) }
                let entry = HistoryEntry(at: since, durationMs: length, words: words)
                if purpose != .instruction { record(entry) }
                note(.words(count: entry.wordCount, retried: false))
            } else {
                note(.heardNothing(durationMs: length, peak: peak, voicedMs: voiced, sent: true))
            }
        case .failure(let failure):
            let saved = (try? store.save(wav, startedAt: since, failure: failure, now: now())) != nil
            waiting = store.list()
            state = .failed(failure, saved: saved)
            note(.failed(failure, saved: saved, retried: false))
        }
    }

    /// Takes words you deleted in murmur off the Dictate screen (IOS-012):
    /// the ones given, or any with nil.
    func forget(_ words: Set<String>?) {
        guard case .words(let shown) = state else { return }
        if let words, !words.contains(where: { shown.contains($0) }) { return }
        state = .idle
    }

    /// Leaving the screen mid-take drops the take: nothing is kept or sent,
    /// and the activity log notes it (IOS-014).
    func cancel() {
        guard case .recording(let since) = state else { return }
        purpose = .words
        _ = microphone.stop()
        state = .idle
        note(.cancelled(durationMs: Int(now().timeIntervalSince(since) * 1000)))
    }

    /// Drops the take only when it was started for this purpose: leaving
    /// New note never drops a keyboard take (IOS-023).
    func cancel(ifFor purpose: Purpose) {
        guard isRecording, self.purpose == purpose else { return }
        cancel()
    }

    /// Runs the waiting takes one at a time through today's provider, in
    /// the order they were spoken (ids sort by time). Their words show
    /// here and go to the clipboard, so a retried take is safe before its
    /// audio is deleted.
    func retry(_ ids: [String]) async {
        guard !ids.isEmpty, !isRecording, !isBusy else { return }
        let release = keepAlive()
        defer { release() }
        retrying = ids
        message = nil
        armed = nil
        defer { retrying = [] }
        var delivered: [String] = []
        var failed = 0
        for id in ids.sorted() {
            guard let audio = try? store.audio(id) else { continue }
            let spoken = store.take(id)?.startedAt ?? now()
            switch await words(for: audio) {
            case .success(.some(let words)):
                delivered.append(words)
                let entry = HistoryEntry(at: spoken, durationMs: Wav.durationMs(audio), words: words, retried: true)
                record(entry)
                note(.words(count: entry.wordCount, retried: true))
                copy(delivered.joined(separator: "\n\n"))
                try? store.remove(id)
            case .success(.none):
                try? store.markFailed(id, .noSpeech)
                note(.failed(.noSpeech, saved: true, retried: true))
                failed += 1
            case .failure(let failure):
                try? store.markFailed(id, failure)
                note(.failed(failure, saved: true, retried: true))
                failed += 1
            }
            waiting = store.list()
        }
        if !delivered.isEmpty { state = .words(delivered.joined(separator: "\n\n")) }
        message = TakeCopy.retried(delivered: delivered.count, failed: failed)
    }

    /// The first tap asks delete audio?, and a later tap deletes. The
    /// second tap of a quick double tap is ignored.
    func discard(_ id: String) {
        guard !isBusy else { return }
        guard armed == id else {
            armed = id
            armedAt = now()
            message = nil
            return
        }
        guard now().timeIntervalSince(armedAt) >= Self.doubleTap else { return }
        armed = nil
        do {
            try store.remove(id)
        } catch {
            message = "murmur could not delete that recording. Try again."
        }
        waiting = store.list()
    }

    /// The cleaned-up words; nil when the provider heard only silence or
    /// cleanup left nothing (a take of only um); or why it failed. An
    /// instruction gets the dictionary only, as desktop's transform does.
    private func words(for wav: Data, cleanedUp: Bool = true) async -> Result<String?, TakeFailure> {
        let settings = connections.load(catalog: catalog)
        let baseUrl = settings.transcription.baseUrl
        guard let key = (try? ring.key(for: baseUrl)) ?? nil else { return .failure(.noKey) }
        // The dictionary's spellings go to transcription as a hint, and to
        // polish (IOS-013).
        let cleanupSettings = cleanup.load()
        let hint = transcriptionHint(cleanupSettings.dictionary)
        switch await Transcription.run(wav: wav, baseUrl: baseUrl, model: settings.transcription.sttModel, key: key, prompt: hint, send: send) {
        case .words(let text):
            guard let heard = TakeAudio.heard(text, list: rules.hallucinations) else { return .success(nil) }
            guard cleanedUp else {
                let instruction = applyDictionary(heard, cleanupSettings.dictionary).trimmingCharacters(in: .whitespacesAndNewlines)
                return .success(instruction.isEmpty ? nil : instruction)
            }
            let connection = settings.polishConnection { [ring] in (try? ring.key(for: $0)) ?? nil }
            let finished = await Cleanup.finish(heard, settings: cleanupSettings, rules: rules.cleanup, connection: connection, send: send)
            return .success(finished.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : finished)
        case .failed(let kind, let detail):
            return .failure(TakeFailure(kind: kind.rawValue, detail: detail))
        }
    }
}

extension TakeModel.State {
    var isRecording: Bool {
        if case .recording = self { true } else { false }
    }

    /// Something to show under the button: words, Heard nothing, or a failure.
    var hasResult: Bool {
        switch self {
        case .idle, .recording, .transcribing: false
        default: true
        }
    }
}
