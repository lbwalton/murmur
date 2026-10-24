// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// The hours and achievements behind the painted Journey (IOS-018).
@Suite struct JourneyAchievementTests {
    let at = Date(timeIntervalSince1970: 1_790_000_000)

    func calendar(_ zone: String) throws -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: zone))
        return calendar
    }

    /// A take keeps the local hour it was spoken in, as it keeps its day.
    @Test func aTakeKeepsTheHourItWasSpokenIn() throws {
        // 16:13 UTC is 01:13 the next day in Tokyo.
        let tokyo = HistoryEntry(at: at.addingTimeInterval(2 * 3600), durationMs: 320_000, words: "one two", calendar: try calendar("Asia/Tokyo"))
        #expect(tokyo.hour == 1)
        #expect(HistoryEntry.hourOf(tokyo.at, calendar: try calendar("UTC")) == 16)
        let event = tokyo.achievementEvent
        #expect(event == AchievementEvent(at: 1_790_007_200_000, words: 2, durationMs: 320_000, day: "2026-09-22", hour: 1))
        let encoded = try JSONEncoder().encode(tokyo)
        #expect(try JSONDecoder().decode(HistoryEntry.self, from: encoded).hour == 1)
    }

    /// A take kept before hours were stored still counts, at the hour it
    /// falls in now.
    @Test func anOlderTakeWithoutAnHourStillCounts() throws {
        let old = #"{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","at":780000000,"durationMs":1000,"words":"one two three","wordCount":3,"retried":false,"day":"2025-09-20"}"#
        let entry = try JSONDecoder().decode(HistoryEntry.self, from: Data(old.utf8))
        #expect(entry.hour == nil)
        #expect(entry.achievementEvent.hour == HistoryEntry.hourOf(entry.at))
        #expect(entry.achievementEvent.day == "2025-09-20")
    }

    @Test func theAchievementsLoad() throws {
        let rules = try BundledRules.journey()
        #expect(rules.achievements.achievements.count == 14)
        #expect(rules.achievements.achievements.first?.id == "first-words")
    }

    /// The achievements come from this iPhone's takes, the hour included.
    @Test func achievementsComeFromThisIPhonesTakes() throws {
        let rules = try BundledRules.journey()
        let utc = try calendar("UTC")
        // 1_790_000_000 is 14:13 UTC; eleven hours later is 01:13 the next day.
        let late = HistoryEntry(at: at.addingTimeInterval(11 * 3600), durationMs: 1000, words: "late", calendar: utc)
        #expect(Journey.earned([], rules: rules).isEmpty)
        #expect(Journey.earned([late], rules: rules).map(\.id) == ["first-words", "night-owl"])
    }

    /// Where practice stands, and each stamp's seed, as desktop has them.
    @Test func theStandingAndTheSeedsAreDesktops() throws {
        let rules = try BundledRules.journey()
        let utc = try calendar("UTC")
        let words = Array(repeating: "word", count: 1300).joined(separator: " ")
        let entries = (0..<2).map { HistoryEntry(at: at.addingTimeInterval(Double($0) * 86_400), durationMs: 1000, words: words, calendar: utc) }
        let standing = Journey.standing(Journey.report(entries, rules: rules))
        #expect(standing == JourneyStanding(rank: "white-1", next: "white-2", words: 2600, days: 2))
        #expect(Journey.stampSeed(0) == 1200)
        #expect(Journey.stampSeed(2) == 1218)
    }
}

/// What the Journey celebrates when it opens (IOS-018).
@Suite struct JourneyCelebrationTests {
    let start = Date(timeIntervalSince1970: 1_790_000_000)

    func memory() -> (CelebrationMemory, UserDefaults, String) {
        let name = "journey-celebration-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        return (CelebrationMemory(defaults: defaults), defaults, name)
    }

    /// The memory only ever rises.
    @Test func theMemoryOnlyRises() {
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        #expect(memory.seen == nil)
        memory.remember(5)
        memory.remember(3)
        #expect(memory.seen == 5)
        memory.remember(7)
        #expect(memory.seen == 7)
    }

    func takes(_ words: [Int]) throws -> [HistoryEntry] {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        return words.enumerated().map { day, count in
            HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 1000, words: Array(repeating: "word", count: count).joined(separator: " "), calendar: utc)
        }
    }

    /// A fresh first belt gets the ceremony once; opening again plays
    /// nothing.
    @Test func aNewBeltPlaysOnce() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        let report = Journey.report(try takes([150]), rules: rules)
        let first = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(3600))
        #expect(first.ceremony?.id == "white")
        #expect(first.tape == nil)
        let again = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(7200))
        #expect(again.ceremony == nil && again.tape == nil)
    }

    /// A stripe on the belt you hold gets its tape, not the ceremony.
    @Test func aNewStripeGetsItsTape() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        memory.remember(1)
        let report = Journey.report(try takes([1300, 1300]), rules: rules)
        let shown = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(2 * 86_400))
        #expect(shown.ceremony == nil)
        #expect(shown.tape?.id == "white-1")
        #expect(memory.seen == report.practice.index)
    }

    /// A long history opened for the first time replays nothing, and sets
    /// the mark so nothing below it ever plays.
    @Test func anOldHistoryReplaysNothing() throws {
        let rules = try BundledRules.journey()
        let (memory, defaults, name) = memory()
        defer { defaults.removePersistentDomain(forName: name) }
        let report = Journey.report(try takes([1300, 1300]), rules: rules)
        let shown = Journey.celebrate(report, rules: rules, memory: memory, now: start.addingTimeInterval(30 * 86_400))
        #expect(shown.ceremony == nil && shown.tape == nil)
        #expect(memory.seen == report.practice.index)
    }
}

@Suite struct JourneyPaintedCopyTests {
    @Test func theRoadAndTheStampsSayWhereYouAre() throws {
        let rules = try BundledRules.journey()
        #expect(JourneyCopy.roadPlace(0, of: 30) == "Before the first belt, 30 ranks ahead")
        #expect(JourneyCopy.roadPlace(3, of: 30) == "Rank 3 of 30")
        #expect(JourneyCopy.youWords(1) == "you, 1 word")
        #expect(JourneyCopy.youWords(7380) == "you, 7,380 words")
        #expect(JourneyCopy.stamp("night owl", earned: true, hint: "dictate after midnight") == "night owl, earned")
        #expect(JourneyCopy.stamp("night owl", earned: false, hint: "dictate after midnight") == "night owl, not yet earned. dictate after midnight")
        let blue = try #require(rules.ranks.ranks.first { $0.id == "blue" })
        #expect(JourneyCopy.earnedWith(blue) == "25,000 words, 14 days on the mat")
        let founder = try #require(rules.ranks.ranks.first { $0.founderOnly == true })
        #expect(JourneyCopy.earnedWith(founder) == nil)
    }

    @Test func everyNewLineFollowsTheWritingRules() {
        for line in [JourneyCopy.road, JourneyCopy.roadNote, JourneyCopy.bothGates, JourneyCopy.achievements, JourneyCopy.continueHint] {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains(" - ") && !line.contains("--"))
        }
    }
}

/// What murmur asks the painter page for.
@Suite struct JourneyArtworkTests {
    @Test func eachRequestCarriesWhatThePageReads() {
        let belt = JourneyArtwork.belt(belt: "blue", stripes: 2, width: 280, height: 60, drop: nil).fields
        #expect(belt["kind"] as? String == "belt" && belt["stripes"] as? Int == 2)
        #expect(belt["drop"] == nil)
        #expect(JourneyArtwork.belt(belt: "blue", stripes: 2, width: 280, height: 60, drop: 0.5).fields["drop"] as? Double == 0.5)
        let top = JourneyStanding(rank: "red-10", next: nil, words: 9_000_000, days: 4000)
        let road = JourneyArtwork.road(top).fields
        #expect((road["standing"] as? [String: Any])?["next"] is NSNull)
        let stamp = JourneyArtwork.stamp(id: "marathon", got: false, seed: 1290, size: 76).fields
        #expect(stamp["id"] as? String == "marathon" && stamp["got"] as? Bool == false && stamp["seed"] as? Int == 1290)
    }
}

/// The paintings for a report, from the real page (IOS-018).
@MainActor @Suite(.serialized) struct JourneyArtTests {
    func report(_ words: [Int]) throws -> (ProgressReport, JourneyRules) {
        let rules = try BundledRules.journey()
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = try #require(TimeZone(identifier: "UTC"))
        let start = Date(timeIntervalSince1970: 1_790_000_000)
        let entries = words.enumerated().map { day, count in
            HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 1000, words: Array(repeating: "word", count: count).joined(separator: " "), calendar: utc)
        }
        return (Journey.report(entries, rules: rules), rules)
    }

    @Test func everythingIsPainted() async throws {
        let (report, rules) = try report([1300, 1300])
        let art = JourneyArt(painter: try await JourneyPainter.started())
        await art.paint(report, rules: rules, earned: ["first-words"], gateWidth: 320, scale: 2)
        #expect(art.belt?.size == JourneyArt.beltSize)
        #expect(art.road?.groups.isEmpty == false)
        #expect(art.words?.size == CGSize(width: 320, height: JourneyArt.wordsHeight))
        #expect(art.tallies?.size == CGSize(width: 320, height: JourneyArt.talliesHeight))
        #expect(art.stamps.count == rules.achievements.achievements.count)
        // Each painting lands, and fades in, on its own.
        #expect(art.painted == 4 + rules.achievements.achievements.count)
    }

    /// A repaint that fails keeps the paintings already there.
    @Test func aFailedRepaintKeepsThePaintings() async throws {
        let (report, rules) = try report([1300, 1300])
        let painter = try await JourneyPainter.started()
        let art = JourneyArt(painter: painter)
        await art.paint(report, rules: rules, earned: [], gateWidth: 320, scale: 2)
        let belt = try #require(art.belt)
        _ = try await painter.web.evaluateJavaScript("window.murmurJourney = undefined; 1")
        await art.paint(report, rules: rules, earned: [], gateWidth: 320, scale: 2)
        #expect(art.belt === belt)
        #expect(art.road != nil && art.words != nil && art.tallies != nil)
        #expect(art.stamps.count == rules.achievements.achievements.count)
    }

    /// Before the row has a width the gates wait; the rest still paints.
    @Test func theGatesWaitForTheirWidth() async throws {
        let (report, rules) = try report([1300])
        let art = JourneyArt(painter: try await JourneyPainter.started())
        await art.paint(report, rules: rules, earned: [], gateWidth: 0, scale: 2)
        #expect(art.belt != nil)
        #expect(art.words == nil && art.tallies == nil)
    }

    /// With no page, nothing is painted and nothing waits: the Journey keeps
    /// its plain drawing.
    @Test func withoutThePageNothingIsPainted() async throws {
        let (report, rules) = try report([1300])
        let painter = JourneyPainter(page: nil)
        let art = JourneyArt(painter: painter)
        let drop = TapeDrop(painter: painter)
        let stripe = try #require(rules.ranks.ranks.first { $0.id == "white-1" })
        let clock = ContinuousClock()
        let took = await clock.measure {
            await art.paint(report, rules: rules, earned: [], gateWidth: 320, scale: 2)
            drop.expect(stripe)
            await drop.prepare(scale: 2)
        }
        #expect(art.belt == nil && art.road == nil && art.stamps.isEmpty)
        // With no frames the stripe is simply on the belt: nothing waits.
        #expect(drop.frame == nil && !drop.waiting)
        #expect(took < .seconds(2))
    }
}

/// A new stripe's tape dropping onto the belt (IOS-018).
@MainActor @Suite(.serialized) struct TapeDropTests {
    func stripe(_ id: String) throws -> RankSpec {
        try #require(BundledRules.journey().ranks.ranks.first { $0.id == id })
    }

    /// The frames are painted first, the first holding the belt without its
    /// new tape; they play once, over desktop's half second, and land.
    @Test func theTapeDropsOnce() async throws {
        let painter = try await JourneyPainter.started()
        let drop = TapeDrop(painter: painter)
        drop.expect(try stripe("white-1"))
        #expect(drop.waiting && drop.frame == nil)
        await drop.prepare(scale: 2)
        #expect(!drop.waiting)
        let first = try #require(drop.frame)
        let size = JourneyArt.beltSize
        let finished = try await painter.picture(.belt(belt: "white", stripes: 1, width: size.width, height: size.height, drop: nil), scale: 2).image
        #expect(!PaintingDifference(first, finished).same)
        let clock = ContinuousClock()
        var played = false
        let took = await clock.measure { played = await drop.play(reduceMotion: false) }
        #expect(played && took >= .seconds(0.4))
        #expect(drop.frame == nil)
        #expect(await drop.play(reduceMotion: false) == false)
    }

    /// Asked to play before its frames are painted (the ceremony closed
    /// early), it keeps the stripe waiting and plays once they are.
    @Test func playingEarlyKeepsTheStripeWaiting() async throws {
        let drop = TapeDrop(painter: try await JourneyPainter.started())
        drop.expect(try stripe("white-1"))
        #expect(await drop.play(reduceMotion: false) == false)
        #expect(drop.waiting)
        await drop.prepare(scale: 2)
        #expect(await drop.play(reduceMotion: false))
        #expect(drop.frame == nil)
    }

    /// Cancelled while dropping (the screen's task restarted), the tape
    /// lands at once instead of racing through its frames.
    @Test func aCancelledDropLandsAtOnce() async throws {
        let drop = TapeDrop(painter: try await JourneyPainter.started())
        drop.expect(try stripe("white-1"))
        await drop.prepare(scale: 2)
        let playing = Task { await drop.play(reduceMotion: false) }
        try await Task.sleep(for: .milliseconds(80))
        playing.cancel()
        #expect(await playing.value)
        #expect(drop.frame == nil)
        #expect(await drop.play(reduceMotion: false) == false)
    }

    /// A play that is cancelled before it starts leaves the stripe for the
    /// next one.
    @Test func aCancelledStartLeavesTheStripe() async throws {
        let drop = TapeDrop(painter: try await JourneyPainter.started())
        drop.expect(try stripe("white-1"))
        await drop.prepare(scale: 2)
        let cancelled = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return await drop.play(reduceMotion: false)
        }
        #expect(await cancelled.value == false)
        #expect(await drop.play(reduceMotion: false))
    }

    /// A newer stripe replaces the last one's frames.
    @Test func aNewerStripeReplacesTheLast() async throws {
        let drop = TapeDrop(painter: try await JourneyPainter.started())
        drop.expect(try stripe("white-1"))
        await drop.prepare(scale: 2)
        let one = try #require(drop.frame)
        drop.expect(try stripe("white-2"))
        #expect(drop.waiting && drop.frame == nil)
        await drop.prepare(scale: 2)
        let two = try #require(drop.frame)
        #expect(!PaintingDifference(one, two).same)
    }

    /// With Reduce Motion the tape is simply on: nothing plays.
    @Test func reduceMotionLandsAtOnce() async throws {
        let drop = TapeDrop(painter: try await JourneyPainter.started())
        drop.expect(try stripe("white-1"))
        await drop.prepare(scale: 2)
        let clock = ContinuousClock()
        let took = await clock.measure { _ = await drop.play(reduceMotion: true) }
        #expect(took < .seconds(0.1))
        #expect(drop.frame == nil)
    }
}
