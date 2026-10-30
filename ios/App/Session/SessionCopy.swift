// SPDX-License-Identifier: GPL-3.0-only
// What the session screens say (ios/prd.json IOS-009).
import Foundation

enum SessionCopy {
    static func name(_ length: Session.Length) -> String {
        switch length {
        case .five: "5 minutes"
        case .fifteen: "15 minutes"
        case .hour: "1 hour"
        }
    }

    static func status(until: Date?) -> String {
        guard let until else { return "No session is running." }
        return "Listening until \(until.formatted(date: .omitted, time: .shortened))."
    }

    static let explain = "Your first tap on the pill opens murmur and starts a session. Until it ends, a tap starts a take without leaving your app. murmur keeps nothing it hears between takes."
    static let length = "Keep listening for"
    static let lengthFooter = "Counted from your last take."
    static let end = "End session"
    static let start = "Start session"
    static let startFooter = "Starts listening now, so a tap on the pill in any app starts a take at once."

    static let recording = "Recording"
    static let starting = "Starting"
    static let stop = "Stop"
    static let guide = "Swipe right along the bottom edge to go back to your app. Keep talking; it all counts."
    static let guideStill = "Swipe right along the bottom edge to go back to your app."
    static let micOff = "murmur needs the microphone. Open Settings, then murmur, and turn on Microphone."
    static let close = "Close"
}
