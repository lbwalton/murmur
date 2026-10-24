// SPDX-License-Identifier: GPL-3.0-only
// Starting and ending a session without opening murmur (ios/prd.json
// IOS-016): the Control Center control, the Action Button, Shortcuts, and
// the Live Activity's End run these. As audio recording and Live Activity
// intents, iOS runs them in murmur's own process even when murmur is not
// open, so the session is the app's one session. This file is built into
// the widget extension too, which only shows the control; there,
// SessionControl does nothing and is never reached.
import AppIntents
import Foundation

struct StartSessionIntent: AudioRecordingIntent, LiveActivityIntent {
    static let title: LocalizedStringResource = "Start a murmur session"
    static let description = IntentDescription("Keeps the microphone ready so a tap on the murmur keyboard's pill starts a take at once.")

    #if compiler(>=6.4)
    /// iOS 27 may run a control's intent in the widget extension, where
    /// there is no session: murmur's runs only in murmur.
    @available(iOS 27.0, *)
    static var allowedExecutionTargets: IntentExecutionTargets { .main }
    #endif

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let outcome = await SessionControl.start()
        return .result(dialog: IntentDialog(stringLiteral: SessionIntentCopy.line(outcome)))
    }
}

struct EndSessionIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "End the murmur session"
    static let description = IntentDescription("Lets the microphone go.")

    #if compiler(>=6.4)
    @available(iOS 27.0, *)
    static var allowedExecutionTargets: IntentExecutionTargets { .main }
    #endif

    func perform() async throws -> some IntentResult {
        await SessionControl.end()
        return .result()
    }
}

/// How a start went.
enum SessionStart: Sendable, Equatable {
    case started
    /// murmur may not use the microphone yet; it can only be allowed in murmur.
    case noMicrophone
    /// Live Activities are off for murmur, and iOS stops a recording an
    /// intent started without one.
    case liveActivitiesOff
    /// The microphone would not start: a call or another app has it.
    case microphoneBusy
    /// murmur's own files could not be read.
    case unavailable
}

/// What the intents say. Shortcuts and Siri show it; a control may not.
enum SessionIntentCopy {
    static let started = "murmur is ready for your next take."
    static let noMicrophone = "Open murmur once to allow the microphone, then try again."
    static let liveActivitiesOff = "Turn on Live Activities for murmur in Settings, then try again."
    static let microphoneBusy = "The microphone is in use. Try again in a moment."
    static let unavailable = "murmur could not start. Open murmur and try again."

    static func line(_ outcome: SessionStart) -> String {
        switch outcome {
        case .started: started
        case .noMicrophone: noMicrophone
        case .liveActivitiesOff: liveActivitiesOff
        case .microphoneBusy: microphoneBusy
        case .unavailable: unavailable
        }
    }
}
