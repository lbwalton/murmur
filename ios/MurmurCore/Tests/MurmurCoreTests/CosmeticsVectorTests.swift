// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/cosmetics-vectors.json: what desktop unlocks for fixed takes, and
/// the color each accent resolves to.
struct CosmeticsVectors: Decodable {
    struct Take: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
        let day: String
        let hour: Int
    }

    struct Expect: Decodable {
        let rank: String
        let earned: [String]
        let styles: [String]
        let accents: [String]
        let beltColor: String
        let colors: [String: String]
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let takes: [Take]
        let expect: Expect

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: CosmeticsVectors? = try? SharedData(directory: repoShared).decode(CosmeticsVectors.self, from: "cosmetics-vectors.json")
    static let cosmetics: CosmeticsFile? = try? SharedData(directory: repoShared).decode(CosmeticsFile.self, from: "cosmetics.json")
    static let ranks: RanksFile? = try? SharedData(directory: repoShared).decode(RanksFile.self, from: "ranks.json")
    static let achievements: AchievementsFile? = try? SharedData(directory: repoShared).decode(AchievementsFile.self, from: "achievements.json")
}

@Suite struct CosmeticsVectorTests {
    @Test func theVectorsAndTheCosmeticsLoad() throws {
        #expect(try #require(CosmeticsVectors.file).cases.count >= 7)
        let spec = try #require(CosmeticsVectors.cosmetics)
        #expect(spec.overlayStyles.map(\.id) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings", "ribbon"])
        #expect(spec.accents.first?.id == "amber")
    }

    @Test(arguments: CosmeticsVectors.file?.cases ?? [])
    func eachHistoryUnlocksAsOnDesktop(_ vector: CosmeticsVectors.Case) throws {
        let spec = try #require(CosmeticsVectors.cosmetics)
        let progress = Ranks.progress(vector.takes.map { RankEvent(at: $0.at, words: $0.words, day: $0.day) }, spec: try #require(CosmeticsVectors.ranks))
        let earned = Achievements.evaluate(vector.takes.map { AchievementEvent(at: $0.at, words: $0.words, durationMs: $0.durationMs, day: $0.day, hour: $0.hour) }, spec: try #require(CosmeticsVectors.achievements))
        #expect(progress.rank.id == vector.expect.rank)
        #expect(earned.map(\.id) == vector.expect.earned)
        #expect(spec.overlayStyles.filter { Cosmetics.isUnlocked($0, progress: progress, earned: earned) }.map(\.id) == vector.expect.styles)
        #expect(spec.accents.filter { Cosmetics.isUnlocked($0, progress: progress, earned: earned) }.map(\.id) == vector.expect.accents)
        #expect(Cosmetics.beltColor(spec, progress: progress) == vector.expect.beltColor)
        for (id, color) in vector.expect.colors {
            #expect(Cosmetics.accentColor(id, spec: spec, progress: progress, earned: earned) == color, "\(id)")
        }
    }
}
