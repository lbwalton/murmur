// SPDX-License-Identifier: GPL-3.0-only
// The cosmetics (ios/prd.json IOS-020): which waveform styles and accents
// a rank and its achievements unlock, and the color an accent resolves to,
// the same as desktop's src/shared/cosmetics.ts over shared/cosmetics.json
// (shared/cosmetics-vectors.json). Cosmetics never gate function; a locked
// item stays visible with the hint that earns it.
import Foundation

public struct CosmeticItem: Decodable, Sendable, Equatable, Identifiable {
    public struct Unlock: Decodable, Sendable, Equatable {
        public let rank: String?
        public let achievement: String?
    }

    public let id: String
    public let name: String
    public let hint: String
    /// An accent's color; nil for the belt accent, which follows the rank.
    public let color: String?
    /// Nil means always unlocked.
    public let unlock: Unlock?
}

public struct CosmeticsFile: Decodable, Sendable {
    public let beltColors: [String: String]
    public let founderGold: String
    public let overlayStyles: [CosmeticItem]
    public let accents: [CosmeticItem]
}

public enum Cosmetics {
    /// Is one item unlocked? As desktop's isUnlocked: always with no rule,
    /// always for the founder, a rank when it is held or was promoted
    /// through, an achievement once earned.
    public static func isUnlocked(_ item: CosmeticItem, progress: ProgressReport, earned: [EarnedAchievement]) -> Bool {
        guard let unlock = item.unlock else { return true }
        if progress.founder { return true }
        if let rank = unlock.rank {
            if progress.rank.id == rank { return true }
            return progress.promotions.contains { $0.id == rank } && progress.index >= 0
        }
        if let achievement = unlock.achievement {
            return earned.contains { $0.id == achievement }
        }
        return false
    }

    /// The belt's own color for the rank held, as desktop's beltColor.
    public static func beltColor(_ spec: CosmeticsFile, progress: ProgressReport) -> String? {
        spec.beltColors[progress.rank.belt] ?? spec.beltColors["none"]
    }

    /// The color an accent id resolves to, as desktop's resolveAccentColor:
    /// belt follows the rank; a locked or unknown id falls back to the
    /// first free accent, signal amber. Nil only for a file with no free
    /// accent, which callers paint as signal amber too.
    public static func accentColor(_ id: String, spec: CosmeticsFile, progress: ProgressReport, earned: [EarnedAchievement]) -> String? {
        let fallback = spec.accents.first { $0.unlock == nil }?.color
        guard let item = spec.accents.first(where: { $0.id == id }), isUnlocked(item, progress: progress, earned: earned) else { return fallback }
        if item.id == "belt" || item.color == nil {
            return spec.beltColors[progress.rank.belt] ?? fallback
        }
        return item.color
    }
}
