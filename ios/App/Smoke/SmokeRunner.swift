// SPDX-License-Identifier: GPL-3.0-only
// The headless smoke (npm run ios:smoke): launched with --smoke, the app
// runs every subsystem check, prints one SMOKE_RESULT line, and exits.
// The same contract as desktop's smoke: {"ok": Bool, "checks": {name: Bool}},
// and a failed check explains itself on a line starting "smoke <name>:".
import Foundation
import UIKit
import MurmurCore
import Synchronization

struct SmokeRequest: Equatable {
    /// How many shared rule files the build bundled; -1 when not given,
    /// which no real count matches.
    let sharedCount: Int
    /// ios/murmur.storekit on the Mac, which the simulator can read (IOS-025).
    let storeKitFile: URL?

    /// Nil unless the app was launched with --smoke.
    init?(arguments: [String]) {
        guard arguments.contains("--smoke") else { return nil }
        let prefix = "--shared-count="
        sharedCount = arguments.lazy
            .filter { $0.hasPrefix(prefix) }
            .compactMap { Int($0.dropFirst(prefix.count)) }
            .first ?? -1
        let file = "--storekit="
        storeKitFile = arguments.first { $0.hasPrefix(file) }.map { URL(fileURLWithPath: String($0.dropFirst(file.count))) }
    }
}

struct SmokeFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

enum SmokeRunner {
    static func runAndExit(_ request: SmokeRequest) -> Never {
        let checks: [(name: String, run: () throws -> Void)] = [
            ("appGroup", checkAppGroup),
            ("keychain", checkKeychain),
            ("keyRing", checkKeyRing),
            ("connectionTest", checkConnectionTest),
            ("speechGate", checkSpeechGate),
            ("transcription", checkTranscription),
            ("waitingTakes", checkWaitingTakes),
            ("polish", checkPolish),
            ("corrections", checkCorrections),
            ("mailbox", checkMailbox),
            ("session", checkSession),
            ("pill", checkPill),
            ("takePill", checkTakePill),
            ("firstRun", checkFirstRun),
            ("history", checkHistory),
            ("dictionary", checkDictionary),
            ("diagnostics", checkDiagnostics),
            ("sessionIntents", checkSessionIntents),
            ("journey", checkJourney),
            ("achievements", checkAchievements),
            ("journeyPage", checkJourneyPage),
            ("paintingDay", checkPaintingDay),
            ("look", checkLook),
            ("shareCard", checkShareCard),
            ("analytics", checkAnalytics),
            ("notes", checkNotes),
            ("transform", checkTransform),
            ("pro", { try checkPro(request.storeKitFile) }),
            ("sharedJson", { try checkSharedJson(expected: request.sharedCount) })
        ]
        var results: [String: Bool] = [:]
        for check in checks {
            let started = Date.now
            do {
                try check.run()
                results[check.name] = true
            } catch {
                results[check.name] = false
                emit("smoke \(check.name): \(error)")
            }
            // Each check's time, so a smoke that runs out of time shows
            // where it went.
            emit("smoke \(check.name) took \(Int(Date.now.timeIntervalSince(started) * 1000)) ms")
        }
        let ok = results.values.allSatisfy { $0 }
        let payload: [String: Any] = ["ok": ok, "checks": results]
        let json = (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])) ?? Data()
        emit("SMOKE_RESULT " + String(decoding: json, as: UTF8.self))
        exit(ok ? 0 : 1)
    }

    /// Unbuffered, so nothing is lost when the app exits right after.
    private static func emit(_ line: String) {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    static func checkAppGroup() throws {
        guard let container = AppGroup.containerURL else {
            throw SmokeFailure("no container for \(AppGroup.identifier)")
        }
        let probe = container.appendingPathComponent("smoke-\(UUID().uuidString).txt")
        defer { try? FileManager.default.removeItem(at: probe) }
        try Data("murmur smoke".utf8).write(to: probe)
        let back = try String(contentsOf: probe, encoding: .utf8)
        guard back == "murmur smoke" else { throw SmokeFailure("read back \(back)") }
    }

    static func checkKeychain() throws {
        let store = KeychainStore(service: "com.lbwalton.murmur.ios.smoke")
        let account = "smoke"
        defer { try? store.delete(account: account) }
        try store.save("not-a-real-key", account: account)
        guard try store.read(account: account) == "not-a-real-key" else {
            throw SmokeFailure("read back a different value")
        }
        try store.delete(account: account)
        guard try store.read(account: account) == nil else {
            throw SmokeFailure("delete left the item behind")
        }
    }

    /// A dummy key through the key ring: saved, read back, filed in the
    /// app's own Keychain access group (never the app group, which the
    /// keyboard can read), kept out of the app's defaults, and deleted.
    static func checkKeyRing() throws {
        let ring = KeychainKeyRing()
        let url = "https://smoke.invalid/v1/"
        defer { try? ring.remove(for: url) }
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        try ring.save(key, for: url)
        guard try ring.key(for: "https://smoke.invalid/v1") == key else {
            throw SmokeFailure("read back a different key")
        }
        let group = try ring.store.accessGroup(account: BaseURL.normalized(url)) ?? ""
        guard group != AppGroup.identifier, group.hasSuffix("." + (Bundle.main.bundleIdentifier ?? "?")) else {
            throw SmokeFailure("the key sits in access group \(group)")
        }
        guard !"\(UserDefaults.standard.dictionaryRepresentation())".contains(key.secret) else {
            throw SmokeFailure("the key reached the app's defaults")
        }
        try ring.remove(for: url)
        guard try ring.key(for: url) == nil else { throw SmokeFailure("remove left the key behind") }
    }

    /// Test connection against the local stand-in, once for each answer.
    static func checkConnectionTest() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let session = StubProtocol.session()
        for answer in StubProtocol.Answer.allCases {
            let verdict = waitFor { await ConnectionTest.run(baseUrl: answer.baseUrl, key: key, send: { try await session.data(for: $0) }) }
            guard verdict == answer.expected else {
                throw SmokeFailure("\(answer.rawValue) gave \(verdict), expected \(answer.expected)")
            }
        }
    }

    /// A generated tone passes the speech gate and a generated silence
    /// does not; a phrase models invent on silence is heard as nothing.
    static func checkSpeechGate() throws {
        let rules = try BundledRules.takeRules()
        guard TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) != nil else {
            throw SmokeFailure("the tone did not pass the gate")
        }
        guard TakeAudio.upload(ScriptedMicrophone.silence, gate: rules.gate) == nil else {
            throw SmokeFailure("silence passed the gate")
        }
        guard TakeAudio.heard("Thank you.", list: rules.hallucinations) == nil,
              TakeAudio.heard("Send the invoice tomorrow.", list: rules.hallucinations) != nil
        else { throw SmokeFailure("the hallucination filter misjudged a transcript") }
    }

    /// A take, gated and encoded, goes to the local stand-in through the
    /// real URLSession, and its words come back.
    static func checkTranscription() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let result = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .words(let text) = result, TakeAudio.heard(text, list: rules.hallucinations) == StubProtocol.words else {
            throw SmokeFailure("the stand-in gave \(result)")
        }
    }

    /// A take that fails waits in a scratch folder with protection that
    /// allows writing after first unlock, then a retry delivers it and its
    /// audio goes.
    static func checkWaitingTakes() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "smoke-waiting-\(UUID().uuidString)", directoryHint: .isDirectory))
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let rules = try BundledRules.takeRules()
        guard let wav = TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate) else { throw SmokeFailure("the tone did not pass the gate") }
        let session = StubProtocol.session()
        let down = waitFor { await Transcription.run(wav: wav, baseUrl: StubProtocol.downBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard case .failed(let kind, let detail) = down, kind == .server else { throw SmokeFailure("the down host gave \(down)") }
        let id = try store.save(wav, startedAt: .now, failure: TakeFailure(kind: kind.rawValue, detail: detail))
        guard store.list().map(\.id) == [id], store.take(id)?.failure?.kind == "server" else { throw SmokeFailure("the failed take did not list") }
        let protection = try store.directory.appending(path: "\(id).wav").resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        guard protection == .completeUntilFirstUserAuthentication else { throw SmokeFailure("the audio has protection \(String(describing: protection))") }
        let audio = try store.audio(id)
        let retried = waitFor { await Transcription.run(wav: audio, baseUrl: StubProtocol.wordsBaseUrl, model: "smoke-model", key: key, send: { try await session.data(for: $0) }) }
        guard retried == .words(StubProtocol.words) else { throw SmokeFailure("the retry gave \(retried)") }
        try store.remove(id)
        guard store.list().isEmpty else { throw SmokeFailure("the delivered take is still waiting") }
    }

    /// Polish pointed at a stand-in that errors, then at one that chats:
    /// both give back the formatted text unchanged, and say why.
    static func checkPolish() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        let heard = "um send the report tomorrow and copy the whole team on it please"
        let formatted = formatTranscript(heard, options: FormatOptions(), spec: rules.format)
        let session = StubProtocol.session()
        for baseUrl in [StubProtocol.chatErrorBaseUrl, StubProtocol.chattyBaseUrl] {
            let connection = PolishConnection(baseUrl: baseUrl, model: "smoke-model", key: key)
            let reasons = Reasons()
            let text = waitFor {
                await Cleanup.finish(heard, settings: CleanupSettings(), rules: rules.cleanup, connection: connection, send: { try await session.data(for: $0) }) { reason in
                    reasons.list.withLock { $0.append(reason) }
                }
            }
            guard text == formatted else { throw SmokeFailure("\(baseUrl) changed the text to \(text)") }
            guard reasons.list.withLock({ $0.count }) == 1 else { throw SmokeFailure("polish at \(baseUrl) did not fall back") }
        }
    }

    /// Apply corrections (IOS-030): desktop's check sentence through a
    /// stand-in that answers the fix. On, the fix comes back; off, the cut is
    /// too deep, so the formatted text comes back unchanged, and says why.
    static func checkCorrections() throws {
        guard let key = APIKey(StubProtocol.key) else { throw SmokeFailure("the dummy key did not parse") }
        let rules = try BundledRules.takeRules()
        let session = StubProtocol.session()
        let connection = PolishConnection(baseUrl: StubProtocol.fixerBaseUrl, model: "smoke-model", key: key)
        for on in [true, false] {
            let settings = CleanupSettings(corrections: on)
            let reasons = Reasons()
            let text = waitFor {
                await Cleanup.finish(StubProtocol.slip, settings: settings, rules: rules.cleanup, connection: connection, send: { try await session.data(for: $0) }) { reason in
                    reasons.list.withLock { $0.append(reason) }
                }
            }
            let formatted = formatTranscript(StubProtocol.slip, options: settings.options, spec: rules.format)
            let fellBack = reasons.list.withLock { $0 }
            if on {
                guard text == StubProtocol.fix, fellBack.isEmpty else { throw SmokeFailure("with corrections on, polish gave \(text) and \(fellBack)") }
            } else {
                guard text == formatted, fellBack == ["validate: length ratio"] else { throw SmokeFailure("with corrections off, polish gave \(text) and \(fellBack)") }
            }
        }
    }

    /// A mailbox round trip in the app group: the app posts a take, a
    /// simulated keyboard reads it once, and a second read gets nothing.
    static func checkMailbox() throws {
        guard let container = AppGroup.containerURL else { throw SmokeFailure("no container for \(AppGroup.identifier)") }
        let mailbox = Mailbox(file: container.appending(path: "smoke-mailbox-\(UUID().uuidString).json"))
        defer { try? FileManager.default.removeItem(at: mailbox.file) }
        let take = UUID()
        mailbox.write(MailboxEntry(take: take, phase: .ready, words: "smoke words for the keyboard", at: .now))
        guard mailbox.claim(take) == "smoke words for the keyboard" else { throw SmokeFailure("the keyboard did not get the words") }
        guard mailbox.claim(take) == nil, mailbox.claim() == nil else { throw SmokeFailure("a second read got the words again") }
    }

    /// A session at a shortened length, through the device microphone's own
    /// gate with sound handed in instead of heard: it starts warm, a take
    /// holds only what was said during it (a steady sound before and after
    /// never reaches it), and with no further take the session ends by
    /// itself and lets the microphone go. No audio file exists anywhere
    /// from between takes.
    static func checkSession() throws {
        if let failure = onMain({ await sessionFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func sessionFailure() async -> String? {
        guard let microphone = FedMicrophone(rate: Double(Wav.targetSampleRate)), let key = APIKey(StubProtocol.key),
              let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-session-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        cleanup.save(CleanupSettings(polish: false))
        let model = TakeModel(
            microphone: microphone, store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"smoke session words"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        let file = scratch.appending(path: "session.json")
        try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let session = Session(microphone: microphone, model: model, defaults: defaults, stateFile: file, seconds: { _ in 0.5 }, announce: { _ in })
        session.listen()
        guard await session.begin(), microphone.isWarm, SessionState.read(from: file).isOn() else { return "the session did not start warm" }
        let steady = [Float](repeating: 0.5, count: Wav.targetSampleRate / 2)
        microphone.hear(steady)
        await model.start()
        microphone.hear(ScriptedMicrophone.tone)
        await model.stop()
        microphone.hear(steady)
        guard case .words = model.state else { return "the take gave \(model.state)" }
        let take = microphone.lastTake
        guard abs(take.count - ScriptedMicrophone.tone.count) < 200, take.allSatisfy({ abs($0) < 0.35 }) else {
            return "the take held \(take.count) samples, peak \(take.map(abs).max() ?? 0)"
        }
        guard session.isOn, microphone.isWarm else { return "the session let go after a take" }
        for _ in 0..<150 where session.isOn {
            try? await Task.sleep(for: .milliseconds(20))
        }
        guard !session.isOn, !microphone.isWarm, SessionState.read(from: file) == .off else { return "the session did not end by itself" }
        var places = [scratch]
        if let container = AppGroup.containerURL { places.append(container) }
        for place in places {
            let audio = (FileManager.default.subpaths(atPath: place.path) ?? []).filter { $0.hasSuffix(".wav") }
            guard audio.isEmpty else { return "audio exists in \(place.lastPathComponent): \(audio)" }
        }
        return nil
    }

    /// The pill draws every stage of both styles (IOS-010), and the level
    /// file the keyboard reads round trips in the app group.
    static func checkPill() throws {
        guard let container = AppGroup.containerURL else { throw SmokeFailure("no container for \(AppGroup.identifier)") }
        let levels = LevelFile(url: container.appending(path: "smoke-level-\(UUID().uuidString)"))
        defer { levels.url.map { try? FileManager.default.removeItem(at: $0) } }
        levels.write(0.5, count: 3)
        guard let read = levels.read(), read.level == 0.5, read.count == 3 else { throw SmokeFailure("the level file read back \(String(describing: levels.read()))") }
        let blank = PillShots.shots.filter { (PillShots.image($0.frame).pngData()?.count ?? 0) < 1_000 }.map(\.name)
        guard blank.isEmpty else { throw SmokeFailure("these stages drew nothing: \(blank)") }
    }

    /// The pill on Dictate and New note hears the take (IOS-031): a tone
    /// through the device microphone's own gate raises its level while
    /// recording, and the level falls to nothing once the take stops.
    static func checkTakePill() throws {
        if let failure = onMain({ await takePillFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func takePillFailure() async -> String? {
        guard let microphone = FedMicrophone(rate: Double(Wav.targetSampleRate)), let key = APIKey(StubProtocol.key),
              let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-take-pill-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        cleanup.save(CleanupSettings(polish: false))
        let model = TakeModel(
            microphone: microphone, store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"smoke pill words"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        guard model.pillStage == .idle else { return "the pill began at \(model.pillStage)" }
        await model.start()
        microphone.hear(ScriptedMicrophone.tone)
        guard model.pillStage == .recording else { return "the pill showed \(model.pillStage) while recording" }
        guard model.level > 0 else { return "the pill heard \(model.level) while a tone played" }
        await model.stop()
        guard model.level == 0 else { return "the pill still heard \(model.level) after the stop" }
        guard model.pillStage == .inserted else { return "the pill showed \(model.pillStage) once the words landed, the take gave \(model.state)" }
        return nil
    }

    /// First run walks its steps with each permission granted and refused
    /// (IOS-011): the microphone allowed or not, and Full Access on (the
    /// keyboard reports itself) or off (it cannot, so the keyboard step
    /// waits). Whatever was refused says so and waits on Home while the rest
    /// go on.
    static func checkFirstRun() throws {
        if let failure = onMain({ await firstRunFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func firstRunFailure() async -> String? {
        for allowed in [true, false] {
            for fullAccess in [true, false] {
                guard let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)") else { return "no scratch defaults" }
                let report = Cell<KeyboardReport?>(nil)
                let key = Cell(false)
                let setup = Setup(microphone: ScriptedAccess(answer: allowed), report: { report.value }, hasKey: { key.value }, defaults: defaults)
                let walk = "microphone \(allowed ? "allowed" : "refused"), Full Access \(fullAccess ? "on" : "off")"
                guard setup.next == .microphone else { return "\(walk): first run did not start with the microphone" }
                await setup.allowMicrophone()
                guard setup.status(.microphone) == (allowed ? .done : .denied) else { return "\(walk): the microphone read \(setup.status(.microphone))" }
                if fullAccess {
                    report.value = KeyboardReport(fullAccess: true, at: .now)
                    setup.refresh()
                    guard setup.status(.keyboard) == .done else { return "\(walk): the report did not do the keyboard step" }
                } else {
                    setup.refresh()
                    guard setup.status(.keyboard) == .todo else { return "\(walk): the keyboard step read \(setup.status(.keyboard)) without a report" }
                }
                key.value = true
                setup.refresh()
                setup.practiced()
                let left = (allowed ? [] : [Setup.Step.microphone]) + (fullAccess ? [] : [Setup.Step.keyboard])
                guard setup.remaining == left else { return "\(walk): left \(setup.remaining)" }
            }
        }
        return nil
    }

    /// History in a scratch folder (IOS-012): three takes written read back
    /// newest first, one deletes, Clear all empties it, and the folder is
    /// out of backups with the file writable after first unlock.
    static func checkHistory() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "smoke-history-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = HistoryStore(file: folder.appending(path: "history.jsonl"))
        let takes = ["The first smoke take.", "The second smoke take.", "The third smoke take."].enumerated().map { index, words in
            HistoryEntry(at: Date(timeIntervalSince1970: 1_790_000_000 + Double(index) * 60), durationMs: 1_500, words: words)
        }
        for take in takes { try store.append(take) }
        guard store.list() == takes.reversed() else { throw SmokeFailure("history read back \(store.list().map(\.words))") }
        try store.remove(takes[1].id)
        guard store.list() == [takes[2], takes[0]] else { throw SmokeFailure("deleting one left \(store.list().map(\.words))") }
        guard try folder.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true else { throw SmokeFailure("history is in backups") }
        let protection = try store.file.resourceValues(forKeys: [.fileProtectionKey]).fileProtection
        guard protection == .completeUntilFirstUserAuthentication else { throw SmokeFailure("history has protection \(String(describing: protection))") }
        try store.clear()
        guard store.list().isEmpty else { throw SmokeFailure("Clear all left takes") }
    }

    /// The dictionary and expansions (IOS-013): an entry added to each list
    /// is kept, a take's text runs through both, and the dictionary rides
    /// along to transcription as a spelling hint.
    static func checkDictionary() throws {
        if let failure = onMain({ await dictionaryFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func dictionaryFailure() async -> String? {
        guard let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"), let rules = try? BundledRules.takeRules() else { return "no scratch defaults or rules" }
        let words = WordsModel(store: CleanupStore(defaults: defaults))
        guard words.saveWord(DictionaryEntry(from: "la broy", to: "LaBroi")),
              words.saveExpansion(ExpansionEntry(trigger: "my address", text: "1 Main Street, Springfield"))
        else { return "an entry would not save" }
        var settings = CleanupStore(defaults: defaults).load()
        guard settings.dictionary.count == 1, settings.expansions.count == 1 else { return "the entries were not kept" }
        settings.polish = false
        let finished = await Cleanup.finish("la broy lives at my address", settings: settings, rules: rules.cleanup, connection: nil, send: { _ in throw URLError(.notConnectedToInternet) })
        guard finished.contains("LaBroi lives at 1 Main Street, Springfield") else { return "the take came out as \(finished)" }
        guard transcriptionHint(settings.dictionary) == "LaBroi." else { return "the spelling hint was \(String(describing: transcriptionHint(settings.dictionary)))" }
        return nil
    }

    /// Diagnostics (IOS-014): a take with a canary word and a canary key in
    /// it is logged, and the report built after it says what happened while
    /// holding neither canary.
    static func checkDiagnostics() throws {
        if let failure = onMain({ await diagnosticsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func diagnosticsFailure() async -> String? {
        let canaryWord = "Smokeberry"
        let canaryKey = "gsk_smokecanary4321"
        guard let key = APIKey(canaryKey), let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-diagnostics-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        var settings = CleanupSettings(polish: false)
        settings.dictionary = [DictionaryEntry(from: "smoke berry", to: canaryWord)]
        cleanup.save(settings)
        let log = ActivityLog(file: scratch.appending(path: "logs", directoryHint: .isDirectory).appending(path: "activity.log"))
        let history = HistoryStore(file: scratch.appending(path: "history.jsonl"))
        let waiting = WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory))
        let model = TakeModel(
            microphone: ScriptedMicrophone(samples: ScriptedMicrophone.tone), store: waiting,
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"smoke berry spoken"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }, record: { try? history.append($0) }, note: { log.write($0) }
        )
        await model.start()
        await model.stop()
        guard case .words(let words) = model.state, words.contains(canaryWord) else { return "the take gave \(model.state)" }
        let report = DiagnosticsReport.text(DiagnosticsReport.facts(
            catalog: catalog, connections: connections, cleanup: cleanup, ring: ring, log: log, waiting: waiting,
            history: history, defaults: defaults, keyboard: nil, session: .off, mailbox: nil, pill: PillLook(style: .bars)
        ))
        guard report.contains("murmur diagnostics report"), report.contains("dictionaryEntries: 1"), report.contains("take captured"),
              report.contains("take words count=")
        else { return "the report missed the take: \(report)" }
        let logged = (try? String(contentsOf: log.file, encoding: .utf8)) ?? ""
        for text in [report, logged] where text.localizedCaseInsensitiveContains("smokeberry") || text.localizedCaseInsensitiveContains("smoke berry") || text.contains(canaryKey) {
            return "a canary reached the log or the report"
        }
        return nil
    }

    /// Starting without opening murmur (IOS-016): the Start murmur intent,
    /// as Control Center and the Action Button run it, starts a session with
    /// the microphone warm and its Live Activity up before it returns; the
    /// End intent, as the Live Activity's End runs it, ends both before it
    /// returns.
    static func checkSessionIntents() throws {
        if let failure = onMain({ await sessionIntentsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func sessionIntentsFailure() async -> String? {
        guard let microphone = FedMicrophone(rate: Double(Wav.targetSampleRate)), let key = APIKey(StubProtocol.key),
              let defaults = UserDefaults(suiteName: "murmur.smoke.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-intents-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let model = TakeModel(
            microphone: microphone, store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in (Data(#"{"text":"smoke intent words"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        let session = Session(
            microphone: microphone, model: model, defaults: defaults, stateFile: scratch.appending(path: "session.json"),
            announce: { _ in }, present: { LiveSession.shared.show($0) }
        )
        session.listen()
        let before = (SessionControl.source, SessionControl.microphoneAllowed)
        defer { (SessionControl.source, SessionControl.microphoneAllowed) = before }
        SessionControl.source = { session }
        // The stand-in microphone is allowed, as first run leaves the real one.
        SessionControl.microphoneAllowed = { true }
        guard (try? await StartSessionIntent().perform()) != nil, session.isOn, microphone.isWarm else { return "Start murmur did not start a warm session" }
        guard LiveSession.shared.isShowing else { return "Start murmur showed no Live Activity" }
        guard (try? await EndSessionIntent().perform()) != nil, !session.isOn, !microphone.isWarm else { return "End did not end the session" }
        guard !LiveSession.shared.isShowing else { return "the Live Activity outlived the session" }
        return nil
    }

    /// Belts and stripes (IOS-017): histories from shared/rank-vectors.json
    /// go through the history store and back, then the belt math, and come
    /// out where desktop's math put them.
    static func checkJourney() throws {
        guard let rules = try? BundledRules.journey(),
              let directory = Bundle.main.url(forResource: "shared", withExtension: nil),
              let vectors = try? SharedData(directory: directory).decode(SmokeRankVectors.self, from: "rank-vectors.json")
        else { throw SmokeFailure("the ladder or the rank vectors did not load") }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let wanted = ["steady practice earns blue with a dated trail", "takes out of order are walked in time order", "several takes in one day count one day"]
        let cases = vectors.cases.filter { wanted.contains($0.name) }
        guard cases.count == wanted.count else { throw SmokeFailure("the rank vectors lack a case the smoke runs") }
        for vector in cases {
            let file = FileManager.default.temporaryDirectory.appending(path: "smoke-journey-\(UUID().uuidString).jsonl")
            defer { try? FileManager.default.removeItem(at: file) }
            let store = HistoryStore(file: file)
            for event in vector.events {
                let words = Array(repeating: "word", count: event.words).joined(separator: " ")
                try store.append(HistoryEntry(at: Date(timeIntervalSince1970: TimeInterval(event.at) / 1000), durationMs: 1000, words: words, calendar: utc))
            }
            let report = Journey.report(store.list(), rules: rules)
            guard report.rank.id == vector.expect.rank, report.totals.words == vector.expect.totals.words,
                  report.totals.activeDays == vector.expect.totals.activeDays,
                  report.promotions.map(\.id) == vector.expect.promotions.map(\.id),
                  report.promotions.map(\.at) == vector.expect.promotions.map(\.at)
            else { throw SmokeFailure("\(vector.name): the iPhone reached \(report.rank.id), desktop \(vector.expect.rank)") }
        }
    }

    /// Achievements (IOS-018): histories from shared/achievement-vectors.json
    /// go through the history store and back, then the achievements, and
    /// earn what desktop's achievements earned, when they earned it.
    static func checkAchievements() throws {
        guard let rules = try? BundledRules.journey(),
              let directory = Bundle.main.url(forResource: "shared", withExtension: nil),
              let vectors = try? SharedData(directory: directory).decode(SmokeAchievementVectors.self, from: "achievement-vectors.json")
        else { throw SmokeFailure("the achievements or their vectors did not load") }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let wanted = ["seven days in a row", "a five minute take is a marathon", "a week away and back is a comeback"]
        let cases = vectors.cases.filter { wanted.contains($0.name) }
        guard cases.count == wanted.count else { throw SmokeFailure("the achievement vectors lack a case the smoke runs") }
        for vector in cases {
            let file = FileManager.default.temporaryDirectory.appending(path: "smoke-achievements-\(UUID().uuidString).jsonl")
            defer { try? FileManager.default.removeItem(at: file) }
            let store = HistoryStore(file: file)
            for event in vector.events {
                let words = Array(repeating: "word", count: event.words).joined(separator: " ")
                try store.append(HistoryEntry(at: Date(timeIntervalSince1970: TimeInterval(event.at) / 1000), durationMs: event.durationMs, words: words, calendar: utc))
            }
            let earned = Journey.earned(store.list(), rules: rules)
            guard earned.map(\.id) == vector.expect.map(\.id), earned.map(\.at) == vector.expect.map(\.at)
            else { throw SmokeFailure("\(vector.name): the iPhone earned \(earned.map(\.id)), desktop \(vector.expect.map(\.id))") }
        }
    }

    /// The painted Journey (IOS-018): the painter page in the app bundle
    /// loads in its web view, says it is ready, and paints a stamp and the
    /// road.
    static func checkJourneyPage() throws {
        if let failure = onMain({ await journeyPageFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func journeyPageFailure() async -> String? {
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let stamp = try? await painter.picture(.stamp(id: "first-words", got: true, seed: Journey.stampSeed(0), size: 76), scale: 2),
              stamp.image.size == CGSize(width: 76, height: 76)
        else { return "the page painted no stamp" }
        let standing = JourneyStanding(rank: "white", next: "white-1", words: 300, days: 1)
        guard let road = try? await painter.picture(.road(standing), scale: 1), road.groups.first?.name == "white", road.you != nil
        else { return "the page painted no road" }
        return nil
    }

    /// A painting a day (IOS-019): a seeded history goes into a scratch
    /// book, and the painter page paints the day and its card, neither blank.
    static func checkPaintingDay() throws {
        if let failure = onMain({ await paintingDayFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func paintingDayFailure() async -> String? {
        guard let ladder = JourneyRules.live?.ranks.ranks else { return "the ladder did not load" }
        let folder = FileManager.default.temporaryDirectory.appending(path: "smoke-paintings-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = PaintingStore(file: folder.appending(path: "paintings.json"), ladder: ladder)
        // Three days of takes at noon, in UTC, so no hour of the day and no
        // clock change splits a day.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let noon = utc.date(bySettingHour: 12, minute: 0, second: 0, of: Date.now.addingTimeInterval(-3 * 86_400)) ?? Date.now
        let takes = (0..<12).map { i in
            HistoryEntry(at: noon.addingTimeInterval(Double(i / 4) * 86_400 + Double(i % 4) * 900), durationMs: 20_000, words: Array(repeating: "word", count: 40 + i * 5).joined(separator: " "), calendar: utc)
        }
        store.sync(takes)
        guard store.book.count == 3, let day = store.book.keys.sorted().last, let record = store.book[day] else { return "the book has \(store.book.count) days, not 3" }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let picture = try? await painter.picture(.painting(record, width: 120, height: 90), scale: 2) else { return "the page painted no day" }
        guard inked(picture.image) > 100 else { return "the day's painting is blank" }
        guard let card = try? await painter.png(.card(day: day, record: record, longestMs: 20_000), scale: 2), let image = UIImage(data: card.data),
              image.size == CGSize(width: 1080, height: 1350), inked(image) > 10_000
        else { return "the card is missing or blank" }
        return nil
    }

    /// How many pixels hold paint.
    @MainActor private static func inked(_ image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 0 }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        guard drawn else { return 0 }
        return stride(from: 3, to: bytes.count, by: 4).reduce(0) { $0 + (bytes[$1] > 20 ? 1 : 0) }
    }

    /// The look (IOS-020): every style and accent in shared/cosmetics.json
    /// is set in the app group as the Look screen sets it, for a seeded
    /// purple belt, and read back as the keyboard reads it, with the paint
    /// the keyboard draws: unlocked accents in their own color, locked ones
    /// in signal amber. Every style paints its recording stage.
    static func checkLook() throws {
        if let failure = onMain({ lookFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func lookFailure() -> String? {
        guard let container = AppGroup.containerURL else { return "no container for \(AppGroup.identifier)" }
        guard let rules = LookRules.live else { return "the cosmetics did not load" }
        let file = container.appending(path: "smoke-pill-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        // Days kept in UTC, so no clock change puts two takes on one day.
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let start = Date.now.addingTimeInterval(-45 * 86_400)
        let takes = (0..<45).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(i) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: 1700).joined(separator: " "), calendar: utc)
        }
        let standing = rules.standing(takes)
        guard standing.progress.rank.belt == "purple" else { return "the seeded takes reached \(standing.progress.rank.id), not purple" }
        let amber = rules.cosmetics.accents.first { $0.unlock == nil }?.color
        for item in rules.cosmetics.overlayStyles {
            guard let style = PillStyle(rawValue: item.id) else { return "no pill style for \(item.id)" }
            for accent in rules.cosmetics.accents {
                let look = standing.resolved(PillLook(style: style, accent: accent.id))
                let expected = standing.unlocked(accent) ? accent.color ?? rules.cosmetics.beltColors["purple"] : amber
                guard look.color == expected else { return "\(accent.id) resolved to \(look.color ?? "nothing"), not \(expected ?? "nothing")" }
                look.write(to: file)
                let read = PillLook.read(from: file)
                guard read == look else { return "\(style.rawValue) with \(accent.id) read back as \(read)" }
                guard read.palette == PillPalette(accent: expected.flatMap(RGBA.init(hex:))) else { return "\(accent.id) gave the keyboard the wrong paint" }
            }
            let frame = PillFrame(style: style, stage: .recording, levels: DemoVoice.levels, time: 0.5, still: false, palette: PillLook(style: style, color: rules.cosmetics.beltColors["purple"]).palette)
            let size = CGSize(width: 180, height: 28)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 2
            format.opaque = false
            let image = UIGraphicsImageRenderer(size: size, format: format).image { Pill.paint(frame, in: CGRect(origin: .zero, size: size), context: $0.cgContext) }
            guard inked(image) > 100 else { return "\(style.rawValue) painted nothing" }
        }
        return nil
    }

    /// The belt share card (IOS-021): a seeded month (in UTC, so no clock
    /// change moves a take) is totaled as desktop totals it, and the painter
    /// page paints desktop's card from it at 1680 by 880, not blank.
    static func checkShareCard() throws {
        if let failure = onMain({ await shareCardFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func shareCardFailure() async -> String? {
        guard let rules = JourneyRules.live else { return "the ladder did not load" }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let today = HistoryEntry.dayKey(.now, calendar: utc)
        let takes = (0..<12).map { i in
            HistoryEntry(at: Date.now.addingTimeInterval(Double(-i * 2) * 86_400), durationMs: 30_000, words: Array(repeating: "word", count: 60 + i * 40).joined(separator: " "), calendar: utc)
        }
        let card = ShareCard.from(takes, rules: rules, today: today)
        guard card.days.count == 30, card.days.last?.day == today, card.activeDays == 12, card.words == takes.reduce(0, { $0 + $1.wordCount }) else {
            return "the month totaled \(card.activeDays) days and \(card.words) words"
        }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        guard let png = try? await painter.png(card.artwork, scale: 2), let image = UIImage(data: png.data) else { return "the page painted no card" }
        guard image.size == CGSize(width: 1680, height: 880) else { return "the card is \(image.size), not 1680 by 880" }
        guard lit(image) > 20_000 else { return "the card is blank" }
        // Right of desktop's fade (560 of 840) only the month's strokes land.
        guard lit(image, fromX: 560.0 / 840) > 2_000 else { return "the card painted no strokes" }
        return nil
    }

    /// How many pixels stand clear of the ink, paint and words, from
    /// `fromX` (a share of the width) to the right edge.
    @MainActor private static func lit(_ image: UIImage, fromX: Double = 0) -> Int {
        guard let cg = image.cgImage else { return 0 }
        var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            return true
        }
        guard drawn else { return 0 }
        let start: Int = Int((Double(cg.width) * fromX).rounded(.down))
        var count = 0
        for i in stride(from: 0, to: bytes.count, by: 4) {
            let column: Int = (i / 4) % cg.width
            guard column >= start else { continue }
            let red = Int(bytes[i])
            let green = Int(bytes[i + 1])
            let blue = Int(bytes[i + 2])
            let lift: Int = red + green + blue
            if lift > 136 { count += 1 }
        }
        return count
    }

    /// Your numbers (IOS-022): a seeded history (in UTC, so no clock change
    /// moves a take) gives the time back thumbs earn (100 words in a minute
    /// at 36 words a minute is 1.8 minutes back), a typical day once three
    /// days have takes, the month and lifetime, the wall, and a recap plan
    /// that says today's takes; the page paints the fourteen days.
    static func checkAnalytics() throws {
        if let failure = onMain({ await analyticsFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func analyticsFailure() async -> String? {
        guard let rules = NumbersRules.live else { return "the catalog did not load" }
        guard let defaults = UserDefaults(suiteName: "murmur.smoke.numbers.\(UUID().uuidString)") else { return "no scratch defaults" }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let noon = utc.date(bySettingHour: 12, minute: 0, second: 0, of: .now) ?? .now
        let today = HistoryEntry.dayKey(noon, calendar: utc)
        func take(_ days: Int, _ words: Int, _ seconds: Int) -> HistoryEntry {
            HistoryEntry(at: noon.addingTimeInterval(Double(days) * 86_400), durationMs: seconds * 1000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: utc)
        }
        let entries = [take(0, 100, 60), take(-1, 360, 120), take(-2, 720, 300), take(-3, 180, 60), take(-40, 50, 10)]
        let settings = NumbersSettings.load(defaults)
        guard settings.typingWpm == TimeBack.thumbWpm else { return "the typing speed starts at \(settings.typingWpm), not \(TimeBack.thumbWpm)" }
        let summary = Numbers.summary(entries, rules: rules, settings: settings, today: today, defaults: defaults)
        guard summary.today.minutesBack == 1.8 else { return "100 words in a minute gave \(summary.today.minutesBack) minutes back, not 1.8" }
        guard summary.typicalBack == 8 else { return "the typical day is \(String(describing: summary.typicalBack)), not 8" }
        guard summary.lifetime.sessions == 5, summary.lifetime.words == 1410, summary.days.count == 14 else { return "the lifetime or the chart is off" }
        let wall = Analytics.heatmap(Numbers.usage(entries), today: today, year: nil)
        guard wall.days.last?.day == today, wall.totalWords == 1410 else { return "the wall ends on \(wall.days.last?.day ?? "nothing") with \(wall.totalWords) words" }
        var on = settings
        on.recapOn = true
        let morning = utc.date(bySettingHour: 6, minute: 0, second: 0, of: noon) ?? noon
        let plan = RecapPlan.plan(entries, rules: rules, settings: on, now: morning, calendar: utc, locale: Locale(identifier: "en_US"), defaults: defaults)
        guard plan.items.count == RecapPlan.days, plan.items.first?.body == "1 take, 1 minute, 100 words today. 2 minutes back." else {
            return "the recap plan reads \(plan.items.first?.body ?? "nothing")"
        }
        let painter = JourneyPainter()
        do {
            try await painter.waitUntilReady(seconds: 30)
        } catch {
            return "the painter page never said it was ready"
        }
        let days = summary.days.map { HeatDay(day: $0.day, words: $0.words) }
        guard let dabs = try? await painter.picture(.dabs(days: days, width: 300), scale: 2), inked(dabs.image) > 200 else { return "the page painted no dabs" }
        return nil
    }

    /// Runs main-actor work to the end from the smoke's synchronous start
    /// on the main thread, turning the run loop so the work gets to run.
    private static func onMain<T: Sendable>(_ work: @escaping @MainActor () async -> T) -> T {
        let outcome = Mutex<(done: Bool, value: T?)>((false, nil))
        Task { @MainActor in
            let value = await work()
            outcome.withLock { $0 = (true, value) }
        }
        while !outcome.withLock({ $0.done }) {
            RunLoop.main.run(mode: .default, before: .now.addingTimeInterval(0.01))
        }
        guard let value = outcome.withLock({ $0.value }) else { preconditionFailure("the work finished without a value") }
        return value
    }

    /// Fallback reasons, collected across the smoke's async bridge.
    private final class Reasons: Sendable {
        let list = Mutex<[String]>([])
    }

    /// Runs async work to the end from the smoke's synchronous start.
    private static func waitFor<T: Sendable>(_ work: @escaping @Sendable () async -> T) -> T {
        let result = Mutex<T?>(nil)
        let done = DispatchSemaphore(value: 0)
        Task.detached {
            let value = await work()
            result.withLock { $0 = value }
            done.signal()
        }
        done.wait()
        guard let value = result.withLock({ $0 }) else { preconditionFailure("the work signaled without a value") }
        return value
    }

    /// Notes (IOS-023): desktop's sort scenarios through the real path. Each
    /// note is saved by Notes into a folder picked as a vault is, and sorted
    /// by a chat through the real URLSession to the stand-in, which answers
    /// with the replies desktop's model gave; the requests, the files, and
    /// the reports must be the ones desktop's sorter left on the same notes.
    static func checkNotes() throws {
        if let failure = onMain({ await notesFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func notesFailure() async -> String? {
        guard let rules = try? BundledRules.sorter(), let key = APIKey(StubProtocol.key),
              let directory = Bundle.main.url(forResource: "shared", withExtension: nil),
              let file = try? SharedData(directory: directory).decode(SortScenarioFile.self, from: "sort-scenarios.json")
        else { return "the sorter's rules or desktop's scenarios did not load" }
        guard let defaults = UserDefaults(suiteName: "murmur.smoke.notes.\(UUID().uuidString)") else { return "no scratch defaults" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-notes-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: scratch) }
        let vault = scratch.appending(path: "vault", directoryHint: .isDirectory)
        let choice = NotesFolderChoice(defaults)
        do {
            try FileManager.default.createDirectory(at: vault, withIntermediateDirectories: true)
            try choice.pick(vault)
        } catch {
            return "the scratch vault could not be picked: \(error)"
        }
        let folder = choice.store()
        guard folder.picked, !folder.lost else { return "the picked vault did not open again" }
        let day = file.when.date.split(separator: "-").compactMap { Int($0) }
        let clock = file.when.time.split(separator: ":").compactMap { Int($0) }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        guard day.count == 3, clock.count == 2,
              let when = utc.date(from: DateComponents(year: day[0], month: day[1], day: day[2], hour: clock[0], minute: clock[1]))
        else { return "the scenarios' moment did not read" }
        let session = StubProtocol.session()
        let connection = PolishConnection(baseUrl: StubProtocol.sortBaseUrl, model: "smoke-model", key: key)
        func same(_ got: SortReport?, _ want: SortScenarioFile.Report?) -> Bool {
            guard let got, let want else { return got == nil && want == nil }
            return got.outcome.rawValue == want.outcome && got.tasks == want.tasks && got.ideas == want.ideas && got.notes == want.notes
                && got.held == want.held && got.reason == want.reason && got.places == want.places.map(\.relative)
        }
        let utf16: (String?) -> [UInt16]? = { $0.map { Array($0.utf16) } }
        for scenario in file.scenarios {
            try? FileManager.default.removeItem(at: vault.appending(path: "murmur", directoryHint: .isDirectory))
            if let todo = scenario.todoBefore { try? folder.replace(rules.layout.tasks, todo) }
            if let ideas = scenario.ideasBefore { try? folder.replace(rules.layout.ideas, ideas) }
            StubProtocol.script(scenario.calls.map(\.reply))
            let notes = Notes(
                folder: folder, rules: rules, stateFile: NotesStateFile(file: scratch.appending(path: "state-\(UUID().uuidString).json")),
                sortOn: { true }, ask: { NoteSort.chat(connection, rules: rules, send: { try await session.data(for: $0) }) }, timeZone: { .gmt }
            )
            guard notes.save(scenario.text, at: when) != nil else { return "\(scenario.name): the note was not saved" }
            await notes.settle()
            let first = notes.state.report
            if scenario.again != nil { await notes.sortAgain() }
            let asked = StubProtocol.sortAsked()
            guard asked == scenario.calls.map({ [$0.system, $0.user] }) else { return "\(scenario.name): the requests are not desktop's" }
            guard utf16(folder.read(rules.layout.tasks)) == utf16(scenario.todo), utf16(folder.read(rules.layout.ideas)) == utf16(scenario.ideas) else {
                return "\(scenario.name): the files are not desktop's"
            }
            guard same(first, scenario.report) else { return "\(scenario.name): the report is \(String(describing: first))" }
            if let again = scenario.again, !same(notes.state.report, again) { return "\(scenario.name): Sort again reported \(String(describing: notes.state.report))" }
        }
        return nil
    }

    /// A transform through the keyboard's mailbox in the app group (IOS-024):
    /// the take is heard as an instruction, the selection and instruction go
    /// through the real URLSession to a stand-in that rewrites, and the
    /// keyboard gets the rewrite and then the original; a stand-in that
    /// fails leaves the selection as it was and says so.
    static func checkTransform() throws {
        if let failure = onMain({ await transformFailure() }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func transformFailure() async -> String? {
        guard let key = APIKey(StubProtocol.key), let container = AppGroup.containerURL,
              let defaults = UserDefaults(suiteName: "murmur.smoke.transform.\(UUID().uuidString)"),
              let catalog = try? BundledRules.catalog(), let rules = try? BundledRules.takeRules(), let transform = try? BundledRules.transform()
        else { return "the stand-ins did not build" }
        let scratch = FileManager.default.temporaryDirectory.appending(path: "smoke-transform-\(UUID().uuidString)", directoryHint: .isDirectory)
        let mailbox = Mailbox(file: container.appending(path: "smoke-transform-\(UUID().uuidString).json"))
        defer {
            for place in [scratch, mailbox.file, mailbox.requestFile] { try? FileManager.default.removeItem(at: place) }
        }
        let connections = ConnectionStore(defaults: defaults)
        let ring = MemoryKeyRing()
        try? ring.save(key, for: connections.load(catalog: catalog).transcription.baseUrl)
        let cleanup = CleanupStore(defaults: defaults)
        cleanup.save(CleanupSettings(polish: false))
        let model = TakeModel(
            microphone: ScriptedMicrophone(samples: ScriptedMicrophone.tone), store: WaitingStore(directory: scratch.appending(path: "takes", directoryHint: .isDirectory)),
            rules: rules, catalog: catalog, connections: connections, cleanup: cleanup, ring: ring,
            send: { request in (Data(#"{"text":"make this shorter"}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!) },
            copy: { _ in }
        )
        let session = StubProtocol.session()
        let selection = "The meeting ran long, and nobody could say why it had been called."
        for baseUrl in [StubProtocol.rewriteBaseUrl, StubProtocol.chatErrorBaseUrl] {
            let connection = PolishConnection(baseUrl: baseUrl, model: "smoke-model", key: key)
            let rewriter = Rewriter(rules: transform, connection: { connection }, send: { try await session.data(for: $0) })
            let bridge = KeyboardBridge(model: model, mailbox: mailbox, announce: { _ in }, rewriter: rewriter)
            bridge.listen()
            let take = UUID()
            mailbox.ask(take, selection: selection)
            bridge.hear(.start)
            for _ in 0..<100 where !model.isRecording {
                try? await Task.sleep(for: .milliseconds(20))
            }
            guard model.isRecording else { return "\(baseUrl): the instruction was not heard" }
            bridge.hear(.stop)
            var entry = mailbox.read()
            for _ in 0..<250 where ![.ready, .failed].contains(entry?.phase) {
                try? await Task.sleep(for: .milliseconds(20))
                entry = mailbox.read()
            }
            guard let entry, entry.take == take else { return "\(baseUrl): the keyboard heard nothing back" }
            if baseUrl == StubProtocol.rewriteBaseUrl {
                guard entry.phase == .ready, entry.words == StubProtocol.rewritten, entry.original == selection else { return "the rewrite came back as \(entry.phase)" }
                guard mailbox.claim(take) == StubProtocol.rewritten, mailbox.claim() == selection, mailbox.claim() == nil else {
                    return "the rewrite, then the original, did not come back once each"
                }
            } else {
                guard entry.phase == .failed, entry.line == TransformCopy.kept, entry.words == nil, mailbox.claim() == nil else {
                    return "the failing stand-in gave \(entry.phase) with words"
                }
            }
        }
        return nil
    }

    /// murmur Pro played out from ios/murmur.storekit (IOS-025): the app's
    /// product and the founders code are in the file; Pro starts free with
    /// the file's price, a purchase makes it Pro, a new phone restores it,
    /// a refund ends it, and a founders code makes a founding member.
    static func checkPro(_ url: URL?) throws {
        guard let url else { throw SmokeFailure("no --storekit file given") }
        let file = try StoreKitFile.read(url)
        if let failure = onMain({ await proFailure(file) }) { throw SmokeFailure(failure) }
    }

    @MainActor private static func proFailure(_ file: StoreKitFile) async -> String? {
        let product = ProRules.productId
        guard let item = file.products.first(where: { $0.productID == product }), item.type == "NonConsumable" else {
            return "the StoreKit file has no non-consumable \(product)"
        }
        guard (item.offerCodes ?? []).contains(where: { $0.referenceName == ProRules.foundersCode }) else { return "the StoreKit file has no founders code" }
        let shop = ScriptedShop(file)
        let store = ProStore(shop: shop, product: product)
        await store.start()
        guard store.status == .free, store.price == "$" + item.displayPrice else { return "Pro did not start free at the file's price" }
        await store.buy()
        guard store.status.isPro, !store.status.isFounder else { return "a purchase gave \(store.status)" }
        let phone = ProStore(shop: ScriptedShop(file, bought: shop.bought), product: product)
        await phone.start()
        await phone.restore()
        guard phone.status.isPro else { return "a new phone did not restore Pro" }
        shop.refund(product)
        for _ in 0..<50 where store.status.isPro {
            try? await Task.sleep(for: .milliseconds(20))
        }
        guard store.status == .free else { return "a refund left Pro on" }
        shop.buy(product, code: ProRules.foundersCode)
        for _ in 0..<50 where !store.status.isFounder {
            try? await Task.sleep(for: .milliseconds(20))
        }
        guard store.status.isFounder else { return "a founders code gave \(store.status)" }
        return nil
    }

    static func checkSharedJson(expected: Int) throws {
        guard let directory = Bundle.main.url(forResource: "shared", withExtension: nil) else {
            throw SmokeFailure("no shared folder in the app bundle")
        }
        let names = try SharedData(directory: directory).validateAll()
        guard names.count == expected else {
            throw SmokeFailure("bundled \(names.count) shared rules, expected \(expected)")
        }
    }
}

/// The parts of shared/rank-vectors.json the smoke reads.
private struct SmokeRankVectors: Decodable {
    struct Case: Decodable {
        let name: String
        let events: [Event]
        let expect: Expect
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
    }

    struct Expect: Decodable {
        let rank: String
        let totals: Totals
        let promotions: [Step]
    }

    struct Totals: Decodable {
        let words: Int
        let activeDays: Int
    }

    struct Step: Decodable {
        let id: String
        let at: Int64
    }

    let cases: [Case]
}

/// The parts of shared/achievement-vectors.json the smoke reads.
private struct SmokeAchievementVectors: Decodable {
    struct Case: Decodable {
        let name: String
        let events: [Event]
        let expect: [Earned]
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
    }

    struct Earned: Decodable {
        let id: String
        let at: Int64
    }

    let cases: [Case]
}
