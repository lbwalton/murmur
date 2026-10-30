// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

/// The Look (IOS-020): what this iPhone's takes unlock, by desktop's rules,
/// and the look the keyboard reads.
@MainActor @Suite struct LookTests {
    /// A take a day for `days` days, `words` words each, ending yesterday,
    /// on days kept in UTC so no clock change puts two takes on one day.
    func takes(days: Int, words: Int) -> [HistoryEntry] {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let start = Date.now.addingTimeInterval(Double(-days) * 86_400)
        return (0..<days).map { i in
            HistoryEntry(at: start.addingTimeInterval(Double(i) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: utc)
        }
    }

    func scratch() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "look-\(UUID().uuidString).json")
    }

    func rules() throws -> LookRules {
        try #require(LookRules.live)
    }

    func unlockedStyles(_ entries: [HistoryEntry]) throws -> [String] {
        let rules = try rules()
        let standing = rules.standing(entries)
        return rules.cosmetics.overlayStyles.filter(standing.unlocked).map(\.id)
    }

    /// Pulse and ink dabs at white, flecks at blue, rings at purple, the
    /// ribbon at brown, as on desktop.
    @Test func eachBeltUnlocksItsStyles() throws {
        #expect(try unlockedStyles([]) == ["bars", "speckle"])
        #expect(try unlockedStyles(takes(days: 1, words: 150)) == ["bars", "speckle", "pulse", "dabs"])
        #expect(try unlockedStyles(takes(days: 14, words: 1800)) == ["bars", "speckle", "pulse", "dabs", "flecks"])
        #expect(try unlockedStyles(takes(days: 45, words: 1700)) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings"])
        #expect(try unlockedStyles(takes(days: 90, words: 2400)) == ["bars", "speckle", "pulse", "dabs", "flecks", "rings", "ribbon"])
    }

    /// Your belt color follows the rank; a locked accent paints signal amber.
    @Test func accentsResolveAsOnDesktop() throws {
        let rules = try rules()
        let amber = rules.cosmetics.accents.first { $0.unlock == nil }?.color
        let blue = rules.standing(takes(days: 14, words: 1800))
        #expect(blue.color("belt") == rules.cosmetics.beltColors["blue"])
        #expect(blue.color("belt-white") == rules.cosmetics.accents.first { $0.id == "belt-white" }?.color)
        #expect(blue.color("ember") == amber)
        #expect(blue.color("not-an-accent") == amber)
        #expect(rules.standing([]).color("belt") == amber)
    }

    /// A pick on the Look screen is written where the keyboard reads it, with
    /// its color; a locked pick changes nothing.
    @Test func aPickReachesTheKeyboard() throws {
        let file = scratch()
        let whiteTakes = takes(days: 1, words: 150)
        let model = LookModel(takes: { whiteTakes }, rules: try rules(), file: file)
        let dabs = try #require(model.styles.first { $0.style == .dabs })
        model.choose(.dabs, item: dabs.item)
        #expect(PillLook.read(from: file).style == .dabs)
        let belt = try #require(model.accents.first { $0.id == "belt" })
        model.choose(accent: belt)
        let white = try rules().cosmetics.beltColors["white"]
        #expect(PillLook.read(from: file) == PillLook(style: .dabs, accent: "belt", color: white))
        #expect(PillLook.read(from: file).palette.wet == white.flatMap(RGBA.init(hex:)))
        let ribbon = try #require(model.styles.first { $0.style == .ribbon })
        model.choose(.ribbon, item: ribbon.item)
        let ember = try #require(model.accents.first { $0.id == "ember" })
        model.choose(accent: ember)
        #expect(PillLook.read(from: file) == PillLook(style: .dabs, accent: "belt", color: white))
    }

    /// The Look opens with its accent's color as the takes paint it now, and
    /// writes it back when the file lagged.
    @Test func theLookOpensResolved() throws {
        let file = scratch()
        PillLook(style: .bars, accent: "belt").write(to: file)
        let blueTakes = takes(days: 14, words: 1800)
        let model = LookModel(takes: { blueTakes }, rules: try rules(), file: file)
        let blue = try rules().cosmetics.beltColors["blue"]
        #expect(model.look.color == blue)
        #expect(PillLook.read(from: file).color == blue)
    }

    /// A belt earned while the Look sat open counts at the next pick, and the
    /// pick writes the belt's new color, never the one the screen opened with.
    @Test func aPickCountsTheTakesAsTheyAreNow() throws {
        let rules = try rules()
        let file = scratch()
        PillLook(style: .bars, accent: "belt").write(to: file)
        var current = takes(days: 1, words: 150)
        let model = LookModel(takes: { current }, rules: rules, file: file)
        #expect(model.look.color == rules.cosmetics.beltColors["white"])
        current = takes(days: 14, words: 1800)
        let flecks = try #require(model.styles.first { $0.style == .flecks })
        model.choose(.flecks, item: flecks.item)
        #expect(PillLook.read(from: file) == PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.beltColors["blue"]))
    }

    /// The tiles sit two a row, and one a row at the accessibility text
    /// sizes, so no tile's words are cut short.
    @Test func theLargestTextGetsARowPerTile() {
        #expect(LookScreen.columns(for: .large).count == 2)
        #expect(LookScreen.columns(for: .xxxLarge).count == 2)
        #expect(LookScreen.columns(for: .accessibility1).count == 1)
        #expect(LookScreen.columns(for: .accessibility5).count == 1)
    }

    /// New takes repaint the keyboard's accent: a new belt colors the belt
    /// accent, and Clear all returns it to signal amber. The chosen style
    /// stays when its belt goes, as on desktop.
    @Test func takesRepaintTheAccent() throws {
        let rules = try rules()
        let file = scratch()
        PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.beltColors["white"]).write(to: file)
        Looks.refresh(takes(days: 14, words: 1800), rules: rules, file: file)
        #expect(PillLook.read(from: file) == PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.beltColors["blue"]))
        Looks.refresh(HistoryChange.cleared.kept, rules: rules, file: file)
        #expect(PillLook.read(from: file) == PillLook(style: .flecks, accent: "belt", color: rules.cosmetics.accents.first?.color))
    }

    @Test func aChangeKeepsTheTakesLeft() {
        let all = takes(days: 3, words: 10)
        #expect(HistoryChange.added(all).kept == all)
        #expect(HistoryChange.deleted(all[0], remaining: Array(all.dropFirst())).kept == Array(all.dropFirst()))
        #expect(HistoryChange.cleared.kept.isEmpty)
    }

    /// Each tile and row reads its name, what it is or what earns it, and
    /// VoiceOver says how to unlock a locked one.
    @Test func theWordsAreThePlainOnes() throws {
        let spec = try rules().cosmetics
        let dabs = try #require(spec.overlayStyles.first { $0.id == "dabs" })
        let bars = try #require(spec.overlayStyles.first { $0.id == "bars" })
        let ember = try #require(spec.accents.first { $0.id == "ember" })
        #expect(LookCopy.name(dabs) == "Ink dabs")
        #expect(LookCopy.name(try #require(spec.accents.first)) == "Signal amber")
        #expect(LookCopy.status(dabs, inUse: false, unlocked: false) == "Earn your white belt")
        #expect(LookCopy.status(dabs, inUse: false, unlocked: true) == "Earned at white belt")
        #expect(LookCopy.status(dabs, inUse: true, unlocked: true) == "In use")
        #expect(LookCopy.status(bars, inUse: false, unlocked: true) == "The classic")
        #expect(LookCopy.styleValue(dabs, inUse: false, unlocked: false) == "Locked, earn your white belt")
        #expect(LookCopy.styleValue(dabs, inUse: true, unlocked: false) == "In use. Locked, earn your white belt")
        #expect(LookCopy.styleValue(dabs, inUse: false, unlocked: true) == "Earned at white belt")
        #expect(LookCopy.accentValue(ember, unlocked: false) == "Locked, hold a dictation past five minutes")
        #expect(LookCopy.accentValue(ember, unlocked: true).isEmpty)
        #expect(LookCopy.accentFooter.contains("earned by practice, never bought, and changes only how the pill looks"))
        for line in [LookCopy.waveFooter, LookCopy.accentFooter] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
