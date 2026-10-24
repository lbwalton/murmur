// SPDX-License-Identifier: GPL-3.0-only
// Belts and stripes on iPhone (ios/prd.json IOS-017): the same ladder,
// gates, and math as desktop (shared/ranks.json, MurmurCore's Ranks), run
// over the takes this iPhone keeps in history. One Journey across devices
// comes with the murmur account (IOS-029).
import Foundation
import MurmurCore

enum Journey {
    /// Where this iPhone's takes have reached.
    static func report(_ entries: [HistoryEntry], rules: JourneyRules) -> ProgressReport {
        Ranks.progress(entries.map(\.rankEvent), spec: rules.ranks)
    }

    /// The achievements these takes have earned (IOS-018).
    static func earned(_ entries: [HistoryEntry], rules: JourneyRules) -> [EarnedAchievement] {
        Achievements.evaluate(entries.map(\.achievementEvent), spec: rules.achievements)
    }

    /// Where practice stands, for the painter.
    static func standing(_ report: ProgressReport) -> JourneyStanding {
        JourneyStanding(rank: report.practice.rank.id, next: report.practice.next?.id, words: report.totals.words, days: report.totals.activeDays)
    }

    /// What to celebrate as the Journey opens, as desktop decides it: the
    /// newest new belt gets the ceremony, and a stripe on the belt you hold
    /// gets its tape. How high practice stands is remembered either way, so
    /// nothing at or below it plays again.
    static func celebrate(_ report: ProgressReport, rules: JourneyRules, memory: CelebrationMemory, now: Date) -> (ceremony: RankSpec?, tape: RankSpec?) {
        let ms = Int64((now.timeIntervalSince1970 * 1000).rounded())
        let celebration = Celebrations.toCelebrate(report.promotions, ladder: rules.ranks.ranks, seen: memory.seen, now: ms)
        memory.remember(report.practice.index)
        let tape = celebration?.tape.flatMap { $0.id == report.practice.rank.id ? $0 : nil }
        return (celebration?.belt, tape)
    }

    /// A stamp's seed, as desktop seeds it: by its place in the list.
    static func stampSeed(_ index: Int) -> Int {
        1200 + index * 9
    }
}

/// The highest rank already celebrated, by its place on the ladder, kept
/// across launches. It only ever rises, so belts earned again after a
/// cleared history never replay.
struct CelebrationMemory {
    static let key = "murmur-ceremony-rank"
    let defaults: UserDefaults

    var seen: Int? {
        defaults.object(forKey: Self.key) as? Int
    }

    func remember(_ index: Int) {
        defaults.set(max(seen ?? index, index), forKey: Self.key)
    }
}

/// What the Journey says.
enum JourneyCopy {
    static let title = "Journey"
    static let toward = "Toward"
    static let promotions = "Promotions"
    static let top = "You hold the highest belt practice earns."
    static let devices = "Belts count the takes on this iPhone. One Journey across your devices comes with the murmur account."

    static func level(_ level: Int) -> String {
        "Level \(level)"
    }

    /// Words toward the next belt; once the gate holds, what you have and
    /// what it needed.
    static func words(_ gate: GateProgress) -> String {
        gate.have >= gate.need
            ? "\(gate.have.formatted()) words, \(gate.need.formatted()) needed"
            : "\(gate.have.formatted()) of \(gate.need.formatted()) words"
    }

    static func days(_ gate: GateProgress) -> String {
        gate.have >= gate.need
            ? "\(gate.have.formatted()) \(gate.have == 1 ? "day" : "days") you dictated, \(gate.need.formatted()) needed"
            : "\(gate.have.formatted()) of \(gate.need.formatted()) \(gate.need == 1 ? "day" : "days") you dictated"
    }

    /// What earns the first belt, while there are no promotions yet.
    static func firstBelt(_ next: RankSpec?) -> String {
        guard let next, let words = next.words else { return "Your takes earn belts here." }
        return "Your first \(words.formatted()) words earn the \(next.label)."
    }

    static func promoted(_ at: Date) -> String {
        at.formatted(date: .abbreviated, time: .omitted)
    }

    static let road = "The road"
    static let roadNote = "Every rank from white belt to red, left to right, painted as far as your words and days have taken you. The gold ring is your next promotion."
    static let bothGates = "Both gates must close. Words come from dictating; days only from showing up."
    static let achievements = "Achievements"

    /// Where you stand on the road, for VoiceOver.
    static func roadPlace(_ place: Int, of count: Int) -> String {
        place <= 0 ? "Before the first belt, \(count) ranks ahead" : "Rank \(place) of \(count)"
    }

    /// Your words over your spot on the road, as desktop labels it.
    static func youWords(_ words: Int) -> String {
        "you, \(words.formatted()) \(words == 1 ? "word" : "words")"
    }

    static func stamp(_ name: String, earned: Bool, hint: String) -> String {
        earned ? "\(name), earned" : "\(name), not yet earned. \(hint)"
    }

    /// What the ceremony says under the rank.
    static func earnedWith(_ rank: RankSpec) -> String? {
        guard let words = rank.words, let days = rank.activeDays else { return nil }
        return "\(words.formatted()) words, \(days.formatted()) \(days == 1 ? "day" : "days") on the mat"
    }

    static let continueHint = "Tap to continue"
}
