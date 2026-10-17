// SPDX-License-Identifier: GPL-3.0-only
// The app's side of the session intents (ios/prd.json IOS-016). iOS runs
// them in murmur's process, maybe with no screen open, so starting brings
// up what the first screen would: the keyboard's bridge and the one
// session. Apple's rule for recording from an intent is that the Live
// Activity starts, and ends, before the intent returns, so both wait for it.
import ActivityKit
import AVFoundation
import Foundation

@MainActor enum SessionControl {
    /// The session the intents start and end: the app's one session, with
    /// the keyboard's bridge listening, as the first screen would bring up.
    /// The smoke and the tests give their own.
    static var source: @MainActor () -> Session? = {
        _ = KeyboardBridge.live()
        return Session.live()
    }

    /// Whether murmur may use the microphone. A control has no screen to
    /// ask from, so it never asks: murmur's first run does.
    static var microphoneAllowed: @MainActor () -> Bool = {
        AVAudioApplication.shared.recordPermission == .granted
    }

    /// Whether murmur may show Live Activities, without which iOS stops a
    /// recording an intent started.
    static var liveActivitiesAllowed: @MainActor () -> Bool = {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Where the Live Activity is shown.
    static var live: LiveSession = .shared

    /// Starts the session, or counts its length again from now, with its
    /// Live Activity up before this returns.
    static func start() async -> SessionStart {
        guard microphoneAllowed() else { return .noMicrophone }
        guard liveActivitiesAllowed() else { return .liveActivitiesOff }
        guard let session = source() else { return .unavailable }
        guard await session.begin() else { return .microphoneBusy }
        await live.settle()
        return .started
    }

    /// Ends the session and its Live Activity before this returns. From a
    /// Live Activity left over after murmur closed, with no session to end,
    /// the activity still goes.
    static func end() async {
        source()?.end()
        live.show(nil)
        await live.settle()
    }
}
