// SPDX-License-Identifier: GPL-3.0-only
import AppIntents
import Foundation
import Testing
@testable import murmur

/// Starting and ending a session without opening murmur (IOS-016): the
/// intents Control Center, the Action Button, Shortcuts, and the Live
/// Activity's End run.
@MainActor @Suite(.serialized) struct SessionControlTests {
    let microphone = ScriptedMicrophone(samples: ScriptedMicrophone.tone)
    let shown = ShownStates()

    /// Runs body with the intents pointed at this session, the microphone
    /// and Live Activities allowed unless said otherwise, and a Live
    /// Activity presenter of its own.
    func with(
        _ session: Session?, microphone allowed: Bool = true, liveActivities: Bool = true, _ body: () async throws -> Void
    ) async rethrows {
        let saved = (SessionControl.source, SessionControl.microphoneAllowed, SessionControl.liveActivitiesAllowed, SessionControl.live)
        defer { (SessionControl.source, SessionControl.microphoneAllowed, SessionControl.liveActivitiesAllowed, SessionControl.live) = saved }
        SessionControl.source = { session }
        SessionControl.microphoneAllowed = { allowed }
        SessionControl.liveActivitiesAllowed = { liveActivities }
        SessionControl.live = LiveSession(log: nil, keepAlive: { {} })
        try await body()
    }

    /// The intents start and end the session they are given.
    @Test func theIntentsStartAndEndTheSession() async throws {
        let (session, _) = try scriptedSession(microphone, shown: shown)
        try await with(session) {
            _ = try await StartSessionIntent().perform()
            #expect(session.isOn)
            #expect(microphone.isWarm)
            _ = try await EndSessionIntent().perform()
            #expect(!session.isOn)
            #expect(!microphone.isWarm)
        }
    }

    /// A control has no screen to ask from: with the microphone not
    /// allowed yet it never asks, and starts nothing.
    @Test func aControlNeverAsksForTheMicrophone() async throws {
        let (session, _) = try scriptedSession(microphone, shown: shown)
        await with(session, microphone: false) {
            #expect(await SessionControl.start() == .noMicrophone)
        }
        #expect(microphone.asked == 0)
        #expect(!session.isOn)
    }

    /// Without Live Activities iOS would stop the recording, so a control
    /// starts nothing and says why.
    @Test func liveActivitiesOffStartNothing() async throws {
        let (session, _) = try scriptedSession(microphone, shown: shown)
        await with(session, liveActivities: false) {
            #expect(await SessionControl.start() == .liveActivitiesOff)
        }
        #expect(!session.isOn)
        #expect(!microphone.isWarm)
    }

    /// A microphone that will not start (a call has it) is told apart from
    /// one never allowed.
    @Test func aBusyMicrophoneIsSaid() async throws {
        let (session, _) = try scriptedSession(microphone, shown: shown)
        microphone.allowed = false
        await with(session) {
            #expect(await SessionControl.start() == .microphoneBusy)
        }
        await with(nil) {
            #expect(await SessionControl.start() == .unavailable)
        }
    }

    #if compiler(>=6.4)
    /// On iOS 27 the intents run only in murmur, never in the widget
    /// extension, where there is no session.
    @Test func theIntentsRunOnlyInMurmur() {
        if #available(iOS 27.0, *) {
            #expect(StartSessionIntent.allowedExecutionTargets == .main)
            #expect(EndSessionIntent.allowedExecutionTargets == .main)
            #expect(NewNoteIntent.allowedExecutionTargets == .main)
        }
    }
    #endif

    @Test func whatTheIntentsSayFollowsTheWritingRules() {
        let outcomes: [SessionStart] = [.started, .noMicrophone, .liveActivitiesOff, .microphoneBusy, .unavailable]
        #expect(Set(outcomes.map(SessionIntentCopy.line)).count == outcomes.count)
        for line in outcomes.map(SessionIntentCopy.line) {
            #expect(!line.contains("Murmur") && !line.contains("listening"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}
