// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/rank-vectors.json: histories desktop ran through its belt math.
struct RankVectors: Decodable {
    struct Gate: Decodable, Equatable {
        let have: Int
        let need: Int
        let pct: Double
    }

    struct Practice: Decodable {
        let rank: String
        let next: String?
        let words: Gate?
        let activeDays: Gate?
    }

    struct Expect: Decodable {
        let rank: String
        let index: Int
        let next: String?
        let words: Gate?
        let activeDays: Gate?
        let totals: Totals
        let promotions: [Step]
        let level: Int
        let practice: Practice
    }

    struct Totals: Decodable {
        let words: Int
        let activeDays: Int
    }

    struct Step: Decodable {
        let id: String
        let at: Int64
    }

    struct Event: Decodable {
        let at: Int64
        let words: Int
        let day: String
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let founder: Bool?
        let events: [Event]
        let expect: Expect

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: RankVectors? = try? SharedData(directory: repoShared).decode(RankVectors.self, from: "rank-vectors.json")
    static let ranks: RanksFile? = try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json")
}

@Suite struct RankVectorTests {
    @Test func theVectorsAndTheLadderLoad() throws {
        #expect(try #require(RankVectors.file).cases.count >= 10)
        #expect(try #require(RankVectors.ranks).ranks.first?.id == "none")
    }

    @Test(arguments: RankVectors.file?.cases ?? [])
    func eachHistoryRanksAsOnDesktop(_ vector: RankVectors.Case) throws {
        let spec = try #require(RankVectors.ranks)
        let events = vector.events.map { RankEvent(at: $0.at, words: $0.words, day: $0.day) }
        let report = Ranks.progress(events, spec: spec, founder: vector.founder ?? false)
        func gate(_ g: GateProgress?) -> RankVectors.Gate? { g.map { RankVectors.Gate(have: $0.have, need: $0.need, pct: $0.pct) } }
        let want = vector.expect
        #expect(report.rank.id == want.rank)
        #expect(report.index == want.index)
        #expect(report.next?.id == want.next)
        #expect(gate(report.words) == want.words)
        #expect(gate(report.activeDays) == want.activeDays)
        #expect(report.totals.words == want.totals.words && report.totals.activeDays == want.totals.activeDays)
        #expect(report.promotions.map(\.id) == want.promotions.map(\.id))
        #expect(report.promotions.map(\.at) == want.promotions.map(\.at))
        #expect(report.level == want.level)
        #expect(report.practice.rank.id == want.practice.rank)
        #expect(report.practice.next?.id == want.practice.next)
        #expect(gate(report.practice.words) == want.practice.words)
        #expect(gate(report.practice.activeDays) == want.practice.activeDays)
    }
}
