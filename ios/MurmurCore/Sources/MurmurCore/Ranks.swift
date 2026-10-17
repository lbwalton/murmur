// SPDX-License-Identifier: GPL-3.0-only
// The belt math (ios/prd.json IOS-017), as desktop's src/shared/ranks.ts
// does it, on the ladder in shared/ranks.json: a rank needs BOTH its
// lifetime words and its distinct active days, promotions are dated by the
// take that closed a rank's second gate, and one level comes with every
// hundred thousand words. The tenth degree is the founder's alone, never
// earned by practice. shared/rank-vectors.json keeps both platforms equal.
import Foundation

public struct RankSpec: Decodable, Sendable, Equatable {
    public let id: String
    public let belt: String
    public let stripes: Int
    public let label: String
    public let title: String
    /// Nil only for the founder's rank, which practice never earns.
    public let words: Int?
    public let activeDays: Int?
    public let founderOnly: Bool?

    var earnable: Bool { founderOnly != true && words != nil && activeDays != nil }
}

public struct RanksFile: Decodable, Sendable {
    public let ranks: [RankSpec]
}

/// One take as the belt math sees it: when, how many words, and the local
/// day it was recorded on (stored, so a timezone change never re-buckets).
public struct RankEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let words: Int
    public let day: String

    public init(at: Int64, words: Int, day: String) {
        self.at = at
        self.words = words
        self.day = day
    }
}

public struct GateProgress: Sendable, Equatable {
    public let have: Int
    public let need: Int
    /// 0 to 1; 1 once the gate holds.
    public let pct: Double

    public init(have: Int, need: Int, pct: Double) {
        self.have = have
        self.need = need
        self.pct = pct
    }
}

public struct Promotion: Sendable, Equatable {
    public let id: String
    public let at: Int64

    public init(id: String, at: Int64) {
        self.id = id
        self.at = at
    }
}

/// The rank words and days alone have earned, with the gates to the next.
public struct PracticeReport: Sendable, Equatable {
    public let rank: RankSpec
    public let index: Int
    /// Nil at the top of the earnable ladder.
    public let next: RankSpec?
    public let words: GateProgress?
    public let activeDays: GateProgress?
}

public struct RankTotals: Sendable, Equatable {
    public let words: Int
    public let activeDays: Int
}

public struct ProgressReport: Sendable, Equatable {
    public let rank: RankSpec
    public let index: Int
    /// Nil at the top of the earnable ladder, and for the founder.
    public let next: RankSpec?
    public let words: GateProgress?
    public let activeDays: GateProgress?
    public let totals: RankTotals
    public let promotions: [Promotion]
    public let founder: Bool
    /// The rank and gates practice has earned (the founder's included).
    public let practice: PracticeReport
    public let level: Int
}

public enum Ranks {
    public static let wordsPerLevel = 100_000

    /// 1 at zero words, one more for every hundred thousand.
    public static func level(for words: Int) -> Int {
        max(0, words) / wordsPerLevel + 1
    }

    /// The highest rank whose two gates both hold.
    static func rank(in ladder: [RankSpec], words: Int, activeDays: Int) -> Int {
        var index = 0
        for (i, rank) in ladder.enumerated() where rank.earnable {
            if let need = rank.words, let days = rank.activeDays, words >= need, activeDays >= days { index = i }
        }
        return index
    }

    public static func progress(_ events: [RankEvent], spec: RanksFile, founder: Bool = false) -> ProgressReport {
        let ladder = spec.ranks
        var words = 0
        var days = Set<String>()
        var promotions: [Promotion] = []
        var reached = 0
        for event in events.sorted(by: { $0.at < $1.at }) {
            words += event.words
            days.insert(event.day)
            let now = rank(in: ladder, words: words, activeDays: days.count)
            while reached < now {
                reached += 1
                if ladder[reached].earnable { promotions.append(Promotion(id: ladder[reached].id, at: event.at)) }
            }
        }
        let activeDays = days.count
        let index = rank(in: ladder, words: words, activeDays: activeDays)
        let next = ladder[(index + 1)...].first(where: \.earnable)
        func gate(_ have: Int, _ need: Int?) -> GateProgress? {
            guard let need else { return nil }
            let pct = need == 0 ? 1 : min(1, Double(have) / Double(need))
            return GateProgress(have: have, need: need, pct: pct)
        }
        let practice = PracticeReport(
            rank: ladder[index], index: index, next: next,
            words: next.flatMap { gate(words, $0.words) }, activeDays: next.flatMap { gate(activeDays, $0.activeDays) }
        )
        let level = level(for: words)
        if founder {
            let founderRank = ladder.first { $0.founderOnly == true } ?? ladder[ladder.count - 1]
            return ProgressReport(
                rank: founderRank, index: ladder.firstIndex(of: founderRank) ?? ladder.count - 1, next: nil, words: nil, activeDays: nil,
                totals: RankTotals(words: words, activeDays: activeDays), promotions: promotions, founder: true, practice: practice, level: level
            )
        }
        return ProgressReport(
            rank: practice.rank, index: index, next: next, words: practice.words, activeDays: practice.activeDays,
            totals: RankTotals(words: words, activeDays: activeDays), promotions: promotions, founder: false, practice: practice, level: level
        )
    }
}
