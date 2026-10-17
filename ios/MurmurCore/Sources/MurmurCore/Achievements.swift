// SPDX-License-Identifier: GPL-3.0-only
// The achievements (ios/prd.json IOS-018), as desktop's
// src/shared/achievements.ts earns them from shared/achievements.json: the
// first take, streaks of days in a row, words in one day, lifetime takes, a
// marathon take, the hour it was spoken, and coming back after a quiet
// spell. Each is earned once, at the take that first met it.
// shared/achievement-vectors.json keeps both platforms equal.
import Foundation

public struct AchievementSpec: Decodable, Sendable, Equatable {
    public enum Condition: Sendable, Equatable {
        case firstSession
        case streak(days: Int)
        case dayWords(words: Int)
        case lifetimeSessions(count: Int)
        case marathon(durationMs: Int)
        case timeOfDay(fromHour: Int, toHour: Int)
        case comeback(quietDays: Int)
        /// A kind this build does not know yet: never earned.
        case unknown
    }

    public let id: String
    public let name: String
    public let hint: String
    public let condition: Condition

    private enum Keys: String, CodingKey { case id, name, hint, condition }
    private enum ConditionKeys: String, CodingKey { case type, days, words, count, durationMs, fromHour, toHour, quietDays }

    public init(from decoder: any Decoder) throws {
        let box = try decoder.container(keyedBy: Keys.self)
        id = try box.decode(String.self, forKey: .id)
        name = try box.decode(String.self, forKey: .name)
        hint = try box.decode(String.self, forKey: .hint)
        let c = try box.nestedContainer(keyedBy: ConditionKeys.self, forKey: .condition)
        switch try c.decode(String.self, forKey: .type) {
        case "firstSession": condition = .firstSession
        case "streak": condition = .streak(days: try c.decode(Int.self, forKey: .days))
        case "dayWords": condition = .dayWords(words: try c.decode(Int.self, forKey: .words))
        case "lifetimeSessions": condition = .lifetimeSessions(count: try c.decode(Int.self, forKey: .count))
        case "marathon": condition = .marathon(durationMs: try c.decode(Int.self, forKey: .durationMs))
        case "timeOfDay": condition = .timeOfDay(fromHour: try c.decode(Int.self, forKey: .fromHour), toHour: try c.decode(Int.self, forKey: .toHour))
        case "comeback": condition = .comeback(quietDays: try c.decode(Int.self, forKey: .quietDays))
        default: condition = .unknown
        }
    }
}

public struct AchievementsFile: Decodable, Sendable {
    public let achievements: [AchievementSpec]
}

/// One take as the achievements see it: when, how many words, how long,
/// and the local day and hour it was recorded at.
public struct AchievementEvent: Sendable, Equatable {
    /// Epoch milliseconds.
    public let at: Int64
    public let words: Int
    public let durationMs: Int
    public let day: String
    public let hour: Int

    public init(at: Int64, words: Int, durationMs: Int, day: String, hour: Int) {
        self.at = at
        self.words = words
        self.durationMs = durationMs
        self.day = day
        self.hour = hour
    }
}

public struct EarnedAchievement: Sendable, Equatable {
    public let id: String
    /// When it was first earned, epoch milliseconds.
    public let at: Int64
}

public enum Achievements {
    /// Days from one yyyy-MM-dd key to another, as desktop counts them:
    /// both read as UTC midnights, so the math has no timezone.
    static func distance(_ from: String, _ to: String) -> Int {
        guard let a = midnight(from), let b = midnight(to) else { return 0 }
        return Int(((b - a) / 86_400).rounded())
    }

    private static func midnight(_ day: String) -> TimeInterval? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))?.timeIntervalSince1970
    }

    /// Every achievement earned, with the moment each was first earned,
    /// oldest first.
    public static func evaluate(_ events: [AchievementEvent], spec: AchievementsFile) -> [EarnedAchievement] {
        var earned: [(id: String, at: Int64, order: Int)] = []
        var have = Set<String>()
        func award(_ id: String, _ at: Int64) {
            guard have.insert(id).inserted else { return }
            earned.append((id, at, earned.count))
        }
        var sessions = 0
        var streak = 0
        var previous: String?
        var wordsByDay: [String: Int] = [:]
        // Swift's sort is not stable; the index keeps equal times in order, as
        // JavaScript's sort does.
        let sorted = events.enumerated().sorted { $0.element.at != $1.element.at ? $0.element.at < $1.element.at : $0.offset < $1.offset }.map(\.element)
        for event in sorted {
            sessions += 1
            let day = event.day
            let gap = previous.map { distance($0, day) } ?? 0
            if previous == nil || gap > 1 {
                streak = 1
            } else if gap == 1 {
                streak += 1
            }
            wordsByDay[day, default: 0] += event.words
            let dayTotal = wordsByDay[day] ?? 0
            for spec in spec.achievements {
                switch spec.condition {
                case .firstSession: award(spec.id, event.at)
                case .streak(let days): if streak >= days { award(spec.id, event.at) }
                case .dayWords(let words): if dayTotal >= words { award(spec.id, event.at) }
                case .lifetimeSessions(let count): if sessions >= count { award(spec.id, event.at) }
                case .marathon(let durationMs): if event.durationMs >= durationMs { award(spec.id, event.at) }
                case .timeOfDay(let from, let to): if event.hour >= from, event.hour < to { award(spec.id, event.at) }
                case .comeback(let quietDays): if gap >= quietDays { award(spec.id, event.at) }
                case .unknown: break
                }
            }
            previous = day
        }
        return earned.sorted { $0.at != $1.at ? $0.at < $1.at : $0.order < $1.order }.map { EarnedAchievement(id: $0.id, at: $0.at) }
    }
}
