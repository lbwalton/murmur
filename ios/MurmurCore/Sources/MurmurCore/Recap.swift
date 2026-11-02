// SPDX-License-Identifier: GPL-3.0-only
// The daily recap's sentence (ios/prd.json IOS-022): desktop's recapBody
// (src/shared/recap.ts), held to it by shared/analytics-vectors.json. The
// iPhone says takes where desktop says sessions (a session on iPhone is the
// listening window), one minute where desktop says 1 minutes, and its quiet
// day misses the pill, not a hotkey.
import Foundation

/// A day as the recap reads it.
public struct RecapSummary: Sendable, Equatable {
    public let sessions: Int
    public let words: Int
    /// Minutes spoken, to a tenth.
    public let minutes: Double
    /// Time back, already floored for display.
    public let minutesBack: Double

    public init(sessions: Int, words: Int, minutes: Double, minutesBack: Double) {
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.minutesBack = minutesBack
    }

    /// Today's line of the numbers.
    public init(_ totals: UsageTotals) {
        self.init(sessions: totals.sessions, words: totals.words, minutes: totals.minutes, minutesBack: totals.minutesBack)
    }
}

/// The words a platform's recap uses for its takes, its minutes, and its
/// quiet day.
public struct RecapWords: Sendable, Equatable {
    public let one: String
    public let many: String
    /// Exactly one minute spoken.
    public let minute: String
    public let quiet: String

    public static let desktop = RecapWords(one: "session", many: "sessions", minute: "minutes", quiet: "A quiet day: no dictations. Your hotkey misses you.")
    public static let iPhone = RecapWords(one: "take", many: "takes", minute: "minute", quiet: "A quiet day: no dictations. The pill misses you.")
}

public enum Recap {
    /// The notification's sentence. The time back clause joins once the day
    /// has at least a minute back, so a quiet day keeps its sentence.
    public static func body(_ day: RecapSummary, words: RecapWords = .iPhone, locale: Locale = .current) -> String {
        guard day.sessions > 0 else { return words.quiet }
        let noun = day.sessions == 1 ? words.one : words.many
        let minutes = day.minutes == 1 ? words.minute : "minutes"
        let base = "\(day.sessions) \(noun), \(number(day.minutes)) \(minutes), \(day.words.formatted(.number.locale(locale))) words today."
        return day.minutesBack >= 1 ? "\(base) \(TimeBack.formatWords(day.minutesBack)) back." : base
    }

    /// A number as JavaScript writes it: whole numbers without a point,
    /// others in their shortest form.
    public static func number(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : "\(value)"
    }
}
