// SPDX-License-Identifier: GPL-3.0-only
// The pill's look (ios/prd.json IOS-020): which waveform styles and accents
// this iPhone's takes have earned, by desktop's rules (MurmurCore's
// Cosmetics over shared/cosmetics.json), and the look the keyboard reads
// from the app group. The keyboard never sees the history, so the app
// writes the accent's color beside the choice and rewrites it whenever the
// takes change what it resolves to: a new belt, an achievement, or takes
// deleted.
import Foundation
import MurmurCore

/// What the look is decided from, read once from the app bundle.
struct LookRules: Sendable {
    let cosmetics: CosmeticsFile
    let journey: JourneyRules

    static let live: LookRules? = {
        guard let journey = JourneyRules.live, let cosmetics = try? BundledRules.cosmetics() else { return nil }
        return LookRules(cosmetics: cosmetics, journey: journey)
    }()

    /// Where these takes stand for unlocking.
    func standing(_ entries: [HistoryEntry]) -> LookStanding {
        LookStanding(rules: self, progress: Journey.report(entries, rules: journey), earned: Journey.earned(entries, rules: journey))
    }
}

/// Where practice stands, and so what it has unlocked.
struct LookStanding: Sendable {
    let rules: LookRules
    let progress: ProgressReport
    let earned: [EarnedAchievement]

    func unlocked(_ item: CosmeticItem) -> Bool {
        Cosmetics.isUnlocked(item, progress: progress, earned: earned)
    }

    /// The color an accent paints with now: a locked or unknown one paints
    /// signal amber, as on desktop.
    func color(_ accent: String) -> String? {
        Cosmetics.accentColor(accent, spec: rules.cosmetics, progress: progress, earned: earned)
    }

    /// A swatch's color: the accent's own, or the belt held for the belt
    /// accent, locked or not.
    func swatch(_ item: CosmeticItem) -> String? {
        item.color ?? Cosmetics.beltColor(rules.cosmetics, progress: progress)
    }

    /// The look as it should be written: its accent's color resolved.
    func resolved(_ look: PillLook) -> PillLook {
        var look = look
        look.color = color(look.accent)
        return look
    }
}

enum Looks {
    /// After takes land, one is deleted, or all are cleared: the look's
    /// color follows what the takes now unlock, written only when it moved.
    static func refresh(_ entries: [HistoryEntry], rules: LookRules? = .live, file: URL? = PillLook.file) {
        guard let rules else { return }
        let look = PillLook.read(from: file)
        let resolved = rules.standing(entries).resolved(look)
        if resolved != look { resolved.write(to: file) }
    }
}

extension HistoryChange {
    /// Every take kept once the change is made.
    var kept: [HistoryEntry] {
        switch self {
        case let .added(all): all
        case let .deleted(_, remaining): remaining
        case .cleared: []
        }
    }
}

/// The Look screen's words.
enum LookCopy {
    static let waveFooter = "How the pill draws your voice, in the keyboard and when murmur opens to record. Each tile is the real pill, moving to a made-up voice; locked styles show the belt that earns them."

    static let accentFooter = "The paint the pill draws with while you speak. It dries to a darker shade of itself when the brush lifts; signal amber dries to gold. Every style and accent is earned by practice, never bought, and changes only how the pill looks."

    /// A name from shared/cosmetics.json, in sentence case.
    static func name(_ item: CosmeticItem) -> String {
        item.name.prefix(1).uppercased() + item.name.dropFirst()
    }

    /// The line under a style: in use, what earns it, or what it is.
    static func status(_ item: CosmeticItem, inUse: Bool, unlocked: Bool) -> String {
        if inUse { return "In use" }
        if !unlocked { return sentence(item.hint) }
        if let rank = item.unlock?.rank { return "Earned at \(rank) belt" }
        return sentence(item.hint)
    }

    /// What VoiceOver reads after a style's name: its line, and for a
    /// locked one what earns it, in the value, so it never rests on hints
    /// being on.
    static func styleValue(_ item: CosmeticItem, inUse: Bool, unlocked: Bool) -> String {
        guard !unlocked else { return status(item, inUse: inUse, unlocked: true) }
        return inUse ? "In use. \(locked(item))" : locked(item)
    }

    /// What VoiceOver reads after an accent's name: what earns it while
    /// locked, and nothing more (the chosen one reads as selected).
    static func accentValue(_ item: CosmeticItem, unlocked: Bool) -> String {
        unlocked ? "" : locked(item)
    }

    private static func locked(_ item: CosmeticItem) -> String {
        "Locked, \(item.hint)"
    }

    static func sentence(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }
}
