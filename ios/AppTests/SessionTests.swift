// SPDX-License-Identifier: GPL-3.0-only
import AVFoundation
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct SessionTests {
    let groq = "https://api.groq.com/openai/v1"
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let file = FileManager.default.temporaryDirectory.appending(path: "session-\(UUID().uuidString).json")
    let announced = Announced()

    @MainActor final class Announced {
        var signals: [Signal] = []
    }

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
        CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    }

    func model(_ provider: FakeProvider) throws -> TakeModel {
        TakeModel(
            microphone: microphone,
            store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "session-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
            rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: provider.send, copy: { _ in }
        )
    }

    /// A session whose every length lasts the given seconds.
    func session(_ model: TakeModel, lasting seconds: TimeInterval = 60) -> Session {
        let session = Session(microphone: microphone, model: model, defaults: defaults, stateFile: file, seconds: { _ in seconds }) { [announced] signal in
            announced.signals.append(signal)
        }
        session.listen()
        return session
    }

    func waitUntil(_ done: @MainActor () -> Bool) async throws {
        for _ in 0..<150 where !done() {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    @Test func aSessionKeepsTheMicrophoneWarmBetweenTakes() async throws {
        let model = try model(.says("One."))
        let session = session(model)
        #expect(await session.begin())
        #expect(microphone.isWarm)
        #expect(SessionState.read(from: file).isOn())
        await model.start()
        await model.stop()
        #expect(model.state == .words("One."))
        #expect(microphone.isWarm)
        #expect(session.isOn)
    }

    @Test func withoutASessionATakeLetsTheMicrophoneGo() async throws {
        let model = try model(.says("One."))
        _ = session(model)
        await model.start()
        await model.stop()
        #expect(!microphone.isWarm)
    }

    @Test func theSessionEndsByItselfAfterItsLength() async throws {
        let session = session(try model(.says("x")), lasting: 0.2)
        #expect(await session.begin())
        try await waitUntil { !session.isOn }
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
        #expect(SessionState.read(from: file) == .off)
        #expect(announced.signals.last == .changed)
    }

    /// The length counts from the end of your last take.
    @Test func eachTakeCountsTheLengthAgain() async throws {
        let model = try model(.says("x"))
        let session = session(model, lasting: 0.5)
        #expect(await session.begin())
        let first = try #require(session.until)
        try await Task.sleep(for: .milliseconds(300))
        await model.start()
        await model.stop()
        try await waitUntil { session.until != first }
        #expect(try #require(session.until) > first.addingTimeInterval(0.2))
        #expect(session.isOn)
    }

    /// A take still recording when the length runs out keeps the session
    /// until it ends.
    @Test func aTakeInProgressHoldsTheSession() async throws {
        let model = try model(.says("A long thought."))
        let session = session(model, lasting: 0.2)
        #expect(await session.begin())
        await model.start()
        try await Task.sleep(for: .milliseconds(400))
        #expect(session.isOn)
        #expect(model.isRecording)
        await model.stop()
        #expect(model.state == .words("A long thought."))
        try await waitUntil { !session.isOn }
        #expect(!session.isOn)
    }

    /// The length running out during work that ends without a new take (a
    /// retry that fails again) still ends the session once the work is done.
    @Test func theSessionEndsAfterAFailedRetry() async throws {
        let rules = try BundledRules.takeRules()
        let store = WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "session-retry-\(UUID().uuidString)", directoryHint: .isDirectory))
        let wav = try #require(TakeAudio.upload(ScriptedMicrophone.tone, gate: rules.gate))
        let id = try store.save(wav, startedAt: .now, failure: TakeFailure(kind: "server", detail: "down"))
        let model = TakeModel(
            microphone: microphone, store: store, rules: rules, catalog: try BundledRules.catalog(),
            connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
            send: { request in
                try await Task.sleep(for: .milliseconds(300))
                return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!)
            },
            copy: { _ in }
        )
        let session = session(model, lasting: 0.2)
        #expect(await session.begin())
        await model.retry([id])
        #expect(model.state == .idle)
        try await waitUntil { !session.isOn }
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// End session finishes a take in progress as if you tapped stop.
    @Test func endSessionProcessesATakeInProgress() async throws {
        let model = try model(.says("Keep these words."))
        let session = session(model)
        #expect(await session.begin())
        await model.start()
        session.end()
        try await waitUntil { model.state == .words("Keep these words.") }
        #expect(model.state == .words("Keep these words."))
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
        #expect(SessionState.read(from: file) == .off)
    }

    /// A call, Siri, or another app taking the microphone ends the session,
    /// and the take in progress is processed.
    @Test func anInterruptionEndsTheSession() async throws {
        let model = try model(.says("Before the call."))
        let session = session(model)
        #expect(await session.begin())
        await model.start()
        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue]
        )
        try await waitUntil { model.state == .words("Before the call.") }
        #expect(model.state == .words("Before the call."))
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// The microphone going away mid take (the route lost its input) ends
    /// the session and processes what the take heard.
    @Test func losingTheMicrophoneEndsTheSession() async throws {
        let model = try model(.says("Before it went."))
        let session = session(model)
        #expect(await session.begin())
        await model.start()
        microphone.lose()
        try await waitUntil { model.state == .words("Before it went.") }
        #expect(model.state == .words("Before it went."))
        #expect(!session.isOn)
        #expect(SessionState.read(from: file) == .off)
    }

    /// Without a session, an interruption still processes the take.
    @Test func anInterruptionStopsATakeWithoutASession() async throws {
        let model = try model(.says("Before the call."))
        let session = session(model)
        await model.start()
        session.interrupted()
        try await waitUntil { model.state == .words("Before the call.") }
        #expect(model.state == .words("Before the call."))
    }

    @Test func theLengthDefaultsToFifteenMinutesAndIsRemembered() throws {
        let model = try model(.says("x"))
        let first = session(model)
        #expect(first.length == .fifteen)
        first.choose(.five)
        #expect(session(model).length == .five)
        #expect(Session.Length.allCases.map(\.seconds) == [300, 900, 3600])
    }

    @Test func aDeniedMicrophoneStartsNoSession() async throws {
        microphone.allowed = false
        let session = session(try model(.says("x")))
        #expect(await session.begin() == false)
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// A session never outlives the app that ran it: a new app says off.
    @Test func aNewAppSaysTheSessionIsOff() throws {
        SessionState(until: .now.addingTimeInterval(600)).write(to: file)
        _ = session(try model(.says("x")))
        #expect(SessionState.read(from: file) == .off)
    }
}
