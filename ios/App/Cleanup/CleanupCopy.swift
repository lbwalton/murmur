// SPDX-License-Identifier: GPL-3.0-only
// The Cleanup screen's words: one plain line for each setting, saying
// what it does (ios/prd.json IOS-007), following desktop's wording.
import Foundation
import MurmurCore

enum CleanupCopy {
    static func level(_ level: FormatOptions.Level) -> String {
        switch level {
        case .off: "Your words exactly as heard."
        case .light: "Removes fillers like um, and fixes capitals and spacing."
        case .full: "Light, plus spoken punctuation, scratch that, numbers, and polish."
        }
    }

    static func polish(model: String) -> String {
        let who = model.isEmpty ? "Your cleanup model" : "Your cleanup model (\(model))"
        return "\(who) fixes slips and punctuation after formatting. If it errors, chats, or answers much longer or shorter than what you said, murmur keeps the formatted text."
    }

    static let smartLists = "Spoken sequences (first, then, then) become numbered lists, and saying bullet point or next item starts a dash line."

    static func numbers(_ numbers: FormatOptions.Numbers) -> String {
        switch numbers {
        case .auto: "Numbers stay as your provider wrote them."
        case .digits: "Spoken numbers up to ninety-nine become digits."
        case .words: "Numbers from zero to twenty are spelled out."
        }
    }

    static func name(_ level: FormatOptions.Level) -> String {
        switch level {
        case .off: "Off"
        case .light: "Light"
        case .full: "Full"
        }
    }

    static func name(_ numbers: FormatOptions.Numbers) -> String {
        switch numbers {
        case .auto: "Auto"
        case .digits: "Digits"
        case .words: "Words"
        }
    }
}
