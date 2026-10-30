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
        return "\(who) fixes slips and punctuation after formatting. If it errors, chats, comes back much longer or shorter, or looks like a reply to what you said, murmur keeps the formatted text."
    }

    static let smartLists = "Spoken sequences (first, then, then) become numbered lists, and saying bullet point or next item starts a dash line."

    /// Desktop's line for Apply corrections, without its At Full formatting,
    /// since the switch shows only at Full. It works through polish, so
    /// with Polish off the line says it does nothing (IOS-030).
    static func corrections(polish: Bool) -> String {
        let line = "When you correct yourself (Tuesday, oh wait, I mean Wednesday), only the fix is typed. Off keeps the slip-up in."
        return polish ? line : line + " It works through Polish, so it does nothing while Polish is off."
    }

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
