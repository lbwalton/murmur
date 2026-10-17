// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/celebrate-vectors.json: promotions desktop ran through its
/// toCelebrate.
struct CelebrateVectors: Decodable {
    struct Moment: Decodable {
        let id: String
        let at: Int64
    }

    struct Expected: Decodable, Equatable {
        let belt: String?
        let tape: String?
        let reached: String
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let promotions: [Moment]
        let seen: String?
        let now: Int64
        let expect: Expected?

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: CelebrateVectors? = try? SharedData(directory: repoShared).decode(CelebrateVectors.self, from: "celebrate-vectors.json")
    static let ladder: [RankSpec]? = (try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json"))?.ranks
}

@Suite struct CelebrateVectorTests {
    @Test func theVectorsLoad() throws {
        #expect(try #require(CelebrateVectors.file).cases.count >= 10)
    }

    @Test(arguments: CelebrateVectors.file?.cases ?? [])
    func eachCelebratesAsOnDesktop(_ vector: CelebrateVectors.Case) throws {
        let ladder = try #require(CelebrateVectors.ladder)
        let seen = vector.seen.flatMap { id in ladder.firstIndex { $0.id == id } }
        let got = Celebrations.toCelebrate(vector.promotions.map { Promotion(id: $0.id, at: $0.at) }, ladder: ladder, seen: seen, now: vector.now)
        let shown = got.map { CelebrateVectors.Expected(belt: $0.belt?.id, tape: $0.tape?.id, reached: ladder[$0.reached].id) }
        #expect(shown == vector.expect)
    }
}
