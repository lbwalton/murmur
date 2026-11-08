// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/achievement-vectors.json: histories desktop ran through its
/// achievements.
struct AchievementVectors: Decodable {
    struct Event: Decodable {
        let at: Int64
        let words: Int
        let durationMs: Int
        let day: String
        let hour: Int
    }

    struct Earned: Decodable, Equatable {
        let id: String
        let at: Int64
    }

    struct Case: Decodable, CustomTestStringConvertible {
        let name: String
        let events: [Event]
        let expect: [Earned]

        var testDescription: String { name }
    }

    let cases: [Case]

    static let file: AchievementVectors? = try? SharedData(directory: repoShared).decode(AchievementVectors.self, from: "achievement-vectors.json")
    static let spec: AchievementsFile? = try? SharedData(directory: repoShared).decode(AchievementsFile.self, from: "achievements.json")
}

@Suite struct AchievementVectorTests {
    @Test func theVectorsAndTheAchievementsLoad() throws {
        #expect(try #require(AchievementVectors.file).cases.count >= 10)
        let spec = try #require(AchievementVectors.spec)
        #expect(spec.achievements.count == 14)
        #expect(!spec.achievements.contains { $0.condition == .unknown })
    }

    @Test(arguments: AchievementVectors.file?.cases ?? [])
    func eachHistoryEarnsAsOnDesktop(_ vector: AchievementVectors.Case) throws {
        let spec = try #require(AchievementVectors.spec)
        let events = vector.events.map { AchievementEvent(at: $0.at, words: $0.words, durationMs: $0.durationMs, day: $0.day, hour: $0.hour) }
        let earned = Achievements.evaluate(events, spec: spec)
        #expect(earned.map(\.id) == vector.expect.map(\.id))
        #expect(earned.map(\.at) == vector.expect.map(\.at))
    }

    /// Days apart as desktop counts them, across a month and a year.
    @Test func daysApartAsDesktopCountsThem() {
        #expect(Achievements.distance("2026-01-31", "2026-02-01") == 1)
        #expect(Achievements.distance("2026-12-31", "2027-01-07") == 7)
        #expect(Achievements.distance("2026-03-10", "2026-03-08") == -2)
    }
}
