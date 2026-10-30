// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// Every state a session asked its Live Activity to show.
@MainActor final class ShownStates {
    var states: [SessionActivity.ContentState?] = []

    /// Recording or not, nil when off, with repeats folded.
    var steps: [Bool?] {
        states.map { $0?.recording }.reduce(into: []) { steps, step in
            if steps.last != step { steps.append(step) }
        }
    }
}

/// A listening session on a scripted microphone and a provider that says
/// One., whose Live Activity states land in shown (IOS-016).
@MainActor func scriptedSession(_ microphone: ScriptedMicrophone, shown: ShownStates) throws -> (Session, TakeModel) {
    let groq = "https://api.groq.com/openai/v1"
    let defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    let ring = MemoryKeyRing()
    try ring.save(try #require(APIKey("gsk_groqgroq1111")), for: groq)
    CleanupStore(defaults: defaults).save(CleanupSettings(polish: false))
    let model = TakeModel(
        microphone: microphone,
        store: WaitingStore(directory: FileManager.default.temporaryDirectory.appending(path: "live-takes-\(UUID().uuidString)", directoryHint: .isDirectory)),
        rules: try BundledRules.takeRules(), catalog: try BundledRules.catalog(),
        connections: ConnectionStore(defaults: defaults), cleanup: CleanupStore(defaults: defaults), ring: ring,
        send: FakeProvider.says("One.").send, copy: { _ in }
    )
    let session = Session(
        microphone: microphone, model: model, defaults: defaults,
        stateFile: FileManager.default.temporaryDirectory.appending(path: "live-\(UUID().uuidString).json"),
        announce: { _ in }, present: { state in shown.states.append(state) }
    )
    session.listen()
    return (session, model)
}

/// The session's Live Activity (IOS-016) follows the session.
@MainActor @Suite struct SessionActivityTests {
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let shown = ShownStates()

    func waitUntil(_ done: @MainActor () -> Bool) async throws {
        for _ in 0..<150 where !done() {
            try await Task.sleep(for: .milliseconds(20))
        }
    }

    /// It says Ready while the session waits, Recording while a take
    /// records, Ready again with a new end time after it, and goes when the
    /// session ends.
    @Test func theLiveActivityFollowsTheSession() async throws {
        let (session, model) = try scriptedSession(microphone, shown: shown)
        #expect(shown.states == [nil])
        #expect(await session.begin())
        let first = try #require(shown.states.last??.until)
        await model.start()
        try await waitUntil { shown.states.last??.recording == true }
        await model.stop()
        try await waitUntil { (shown.states.last??.until ?? first) > first }
        session.end()
        #expect(shown.steps == [nil, false, true, false, nil])
        #expect(shown.states.last == .some(nil))
    }

    @Test func itsWordsFollowTheWritingRules() {
        let lines = [
            SessionActivityCopy.ready, SessionActivityCopy.recording, SessionActivityCopy.ended, SessionActivityCopy.end,
            SessionActivityCopy.title, SessionActivityCopy.timeLeft
        ]
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
        #expect(SessionActivityCopy.state(true) == "Recording" && SessionActivityCopy.state(false) == "Ready")
    }

    /// One left on screen after murmur closed, its end time passed, says
    /// Ended, whatever it last said.
    @Test func aStaleOneSaysEnded() {
        #expect(SessionActivityCopy.state(true, stale: true) == "Ended")
        #expect(SessionActivityCopy.state(false, stale: true) == "Ended")
    }
}
