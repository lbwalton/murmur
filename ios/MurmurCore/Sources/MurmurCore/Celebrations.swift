// SPDX-License-Identifier: GPL-3.0-only
// What the Journey celebrates when it opens (ios/prd.json IOS-018), as
// desktop's src/renderer/settings/celebrate.ts decides it: every rank
// climbed past the highest one already celebrated. A new belt among them
// gets the ceremony (the newest one); a stripe or degree on the current
// belt gets its tape, after the ceremony if both.
// shared/celebrate-vectors.json keeps both platforms equal.
import Foundation

public struct Celebration: Sendable, Equatable {
    /// The new belt to hold the ceremony for, if one was earned.
    public let belt: RankSpec?
    /// The current rank, when it is a stripe or degree earned since.
    public let tape: RankSpec?
    /// The ladder index of the highest rank now reached: remember it.
    public let reached: Int
}

public enum Celebrations {
    /// A promotion this fresh is celebrated even with no record yet (the
    /// first open after the very first belt), in milliseconds.
    public static let freshMs: Int64 = 24 * 60 * 60 * 1000

    /// Celebrates by height, not by date: promotions are recomputed from
    /// the history that remains, so the same ranks can carry newer dates;
    /// a rank at or below the highest already celebrated (`seen`) never
    /// plays again. With no record, only promotions from the last day
    /// count, so a long history never replays its old belts.
    public static func toCelebrate(_ promotions: [Promotion], ladder: [RankSpec], seen: Int?, now: Int64) -> Celebration? {
        let indexed = promotions.compactMap { promotion in
            ladder.firstIndex { $0.id == promotion.id }.map { (promotion: promotion, index: $0) }
        }
        guard let latest = indexed.last else { return nil }
        let fresh = indexed.filter { item in
            if let seen { return item.index > seen }
            return now - item.promotion.at <= freshMs
        }
        guard let top = fresh.last else { return nil }
        func newBelt(_ index: Int) -> Bool {
            index == 0 || ladder[index - 1].belt != ladder[index].belt
        }
        let belt = fresh.last { newBelt($0.index) }
        let tape = !newBelt(top.index) && (belt.map { top.index > $0.index } ?? true) ? ladder[top.index] : nil
        return Celebration(belt: belt.map { ladder[$0.index] }, tape: tape, reached: latest.index)
    }
}
