// SPDX-License-Identifier: GPL-3.0-only
// Time back (ios/prd.json IOS-022): the minutes a dictation did not spend
// typing, desktop's src/shared/timeback.ts held to it by
// shared/analytics-vectors.json. Nothing is stored per take; the number
// derives from words and duration at the typing speed, so a speed edit
// restates every day honestly. On iPhone the speed is thumbs on glass.
import Foundation

public enum TimeBack {
    public static let minWpm = 10.0
    public static let maxWpm = 200.0

    /// Typing on a phone: 36.17 words a minute on average across 37,370
    /// people (Palin, Feit, Kim, Kristensson, and Oulasvirta, "How do People
    /// Type on Mobile Devices? Observations from a Study with 37,000
    /// Volunteers", MobileHCI 2019, https://doi.org/10.1145/3338286.3340120;
    /// checked 2026-10-13). Desktop measures against 40 at a keyboard.
    public static let thumbWpm = 36.0

    /// A usable typing speed: the fallback for nothing or anything not
    /// finite, otherwise clamped into the band, so a corrupt setting can
    /// never divide by zero or invent hours.
    public static func clamp(_ wpm: Double?, fallback: Double = thumbWpm) -> Double {
        guard let wpm, wpm.isFinite else { return fallback }
        return min(maxWpm, max(minWpm, wpm))
    }

    /// Minutes back for one take: typing time at the speed minus the time
    /// spoken. Negative when speaking cost more than typing would have;
    /// callers floor the display, never the arithmetic.
    public static func minutesBack(words: Int, durationMs: Int, wpm: Double) -> Double {
        let typing: Double = Double(words) / clamp(wpm)
        let spoken: Double = Double(durationMs) / 60_000
        return typing - spoken
    }

    /// The whole minutes a surface shows for a raw total: floored at zero,
    /// rounded to a tenth the way the analytics are, then to the minute.
    public static func shownMinutes(_ raw: Double) -> Double {
        guard raw.isFinite else { return 0 }
        return JS.round(JS.round(max(0, raw) * 10) / 10)
    }

    /// "0 min", "under a minute", "12 min", "1 h 5 min", "2 h".
    public static func format(_ minutes: Double) -> String {
        guard minutes.isFinite, minutes > 0 else { return "0 min" }
        let whole = Int(JS.round(minutes))
        if whole == 0 { return "under a minute" }
        if whole < 60 { return "\(whole) min" }
        let hours = whole / 60
        let rest = whole % 60
        return rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
    }

    /// "30 minutes", "1 hour 5 minutes", "2 hours": the spoken form, for a
    /// notification's sentence.
    public static func formatWords(_ minutes: Double) -> String {
        guard minutes.isFinite, minutes > 0 else { return "0 minutes" }
        let whole = Int(JS.round(minutes))
        if whole == 0 { return "under a minute" }
        let hours = whole / 60
        let rest = whole % 60
        var parts: [String] = []
        if hours > 0 { parts.append("\(hours) \(hours == 1 ? "hour" : "hours")") }
        if rest > 0 { parts.append("\(rest) \(rest == 1 ? "minute" : "minutes")") }
        return parts.joined(separator: " ")
    }

    /// Today in words against a typical day. Past double, the percentage
    /// stops meaning much, so it says so instead.
    public static func typicalLine(share: Double, typical: Double) -> String {
        let of = "your typical day (\(format(typical)))"
        let percent = Int(JS.round(share * 100))
        return share > 2 ? "More than double \(of)" : "\(percent)% of \(of)"
    }
}
