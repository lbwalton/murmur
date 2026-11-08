// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
import UIKit
@testable import murmur

/// The belt share card (IOS-021): desktop's card, from your last 30 days.
@MainActor @Suite(.serialized) struct ShareCardTests {
    /// UTC days, so no clock change or midnight moves a take.
    static let utc: Calendar = {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc
    }()

    /// `days` days of takes ending on `last` (a UTC day), `words` words each,
    /// two takes on every third day.
    func takes(days: Int, words: Int, last: Date = .now) -> [HistoryEntry] {
        (0..<days).flatMap { i -> [HistoryEntry] in
            let at = last.addingTimeInterval(Double(i - days + 1) * 86_400)
            let text = Array(repeating: "word", count: words).joined(separator: " ")
            let one = HistoryEntry(at: at, durationMs: 60_000, words: text, calendar: Self.utc)
            return i % 3 == 0 ? [one, HistoryEntry(at: at.addingTimeInterval(60), durationMs: 30_000, words: text, calendar: Self.utc)] : [one]
        }
    }

    func rules() throws -> JourneyRules {
        try #require(JourneyRules.live)
    }

    /// How many pixels hold paint or words on the card's ink, from `fromX`
    /// (a share of the width) to the right edge. Past 2/3 (desktop's fade
    /// ends at 560 of 840) only the month's strokes and splatter can land.
    func painted(_ image: UIImage, fromX: Double = 0) -> Int {
        let bytes = PaintingDifference.bytes(image)
        guard let width = image.cgImage?.width, width > 0 else { return 0 }
        let start: Int = Int((Double(width) * fromX).rounded(.down))
        var count = 0
        for i in stride(from: 0, to: bytes.count, by: 4) {
            let column: Int = (i / 4) % width
            guard column >= start else { continue }
            let red = Int(bytes[i])
            let green = Int(bytes[i + 1])
            let blue = Int(bytes[i + 2])
            let lift: Int = red + green + blue
            if lift > 46 + 90 { count += 1 }
        }
        return count
    }

    /// Where only strokes land: right of desktop's fade.
    static let strokesOnly = 560.0 / 840

    /// The month as desktop's card reads it: thirty days ending today, the
    /// words added up, the days with words, the rank, and the level.
    @Test func theCardReadsTheMonth() throws {
        let rules = try rules()
        let today = HistoryEntry.dayKey(.now, calendar: Self.utc)
        let entries = takes(days: 40, words: 50)
        let card = ShareCard.from(entries, rules: rules, today: today)
        #expect(card.days.count == 30)
        #expect(card.days.last?.day == today)
        let first = Paintings.shiftDay(today, -29)
        #expect(card.days.first?.day == first)
        #expect(card.activeDays == 30)
        let inMonth = entries.filter { $0.day.map { $0 >= first && $0 <= today } ?? false }
        #expect(card.words == inMonth.reduce(0) { $0 + $1.wordCount })
        #expect(card.days.contains { $0.sessions == 2 })
        let report = Journey.report(entries, rules: rules)
        #expect(card.rank == report.rank.id && card.label == report.rank.label && card.level == report.level)
    }

    /// The card is desktop's size, 840 by 440 saved at twice that, and it is
    /// painted, words and strokes.
    @Test func theCardIsDesktops() async throws {
        let painter = try await JourneyPainter.started()
        let card = ShareCard.from(takes(days: 20, words: 120), rules: try rules())
        let png = try await painter.png(card.artwork, scale: 2)
        let image = try #require(UIImage(data: png.data))
        #expect(image.size == CGSize(width: 1680, height: 880))
        #expect(painted(image) > 20_000)
        #expect(painted(image, fromX: Self.strokesOnly) > 2_000)
    }

    /// Save card shares the very PNG the screen shows, painted once at
    /// desktop's twice size, never a second paint that could fail.
    @Test func theSavedCardIsThePaintedOne() async throws {
        let painter = try await JourneyPainter.started()
        let model = ShareCardModel(card: ShareCard.from(takes(days: 20, words: 120), rules: try rules()), painter: painter)
        await model.paint()
        guard case let .painted(card) = model.shown else {
            Issue.record("the card did not paint: \(model.shown)")
            return
        }
        let saved = try #require(UIImage(data: CardShare(name: ShareCardCopy.fileName, png: card.png).png))
        #expect(saved.size == CGSize(width: 1680, height: 880))
        #expect(card.image.size == CGSize(width: 840, height: 440) && card.image.scale == 2)
        #expect(PaintingDifference(card.image, saved).same)
    }

    /// A paint the screen walked away from (it closed, or Try again started
    /// another) never lands: no late picture or failure overwrites the screen.
    @Test func aCancelledPaintLeavesTheScreenAlone() async throws {
        let painter = try await JourneyPainter.started()
        let model = ShareCardModel(card: ShareCard.from(takes(days: 9, words: 300), rules: try rules()), painter: painter)
        let paint = Task { await model.paint() }
        paint.cancel()
        await paint.value
        #expect(model.shown == .painting)
    }

    /// The same month paints the same card; another month paints another.
    @Test func aMonthPaintsItsOwnCard() async throws {
        let painter = try await JourneyPainter.started()
        let rules = try rules()
        let one = ShareCard.from(takes(days: 20, words: 120), rules: rules)
        let other = ShareCard.from(takes(days: 9, words: 900), rules: rules)
        let first = try await painter.picture(one.artwork, scale: 1).image
        let again = try await painter.picture(one.artwork, scale: 1).image
        let second = try await painter.picture(other.artwork, scale: 1).image
        #expect(PaintingDifference(first, again).same)
        #expect(!PaintingDifference(first, second).same)
    }

    /// A month with no takes still paints the card's words: never blank.
    @Test func anEmptyMonthStillPaints() async throws {
        let painter = try await JourneyPainter.started()
        let card = ShareCard.from([], rules: try rules())
        #expect(card.words == 0 && card.activeDays == 0)
        let image = try await painter.picture(card.artwork, scale: 1).image
        #expect(painted(image) > 1_000)
        #expect(painted(image, fromX: Self.strokesOnly) < 50)
    }

    @Test func theWordsArePlain() throws {
        let card = ShareCard(days: [DayTotal(day: "2026-10-13", words: 1234, sessions: 2), DayTotal(day: "2026-10-12", words: 0, sessions: 0)], rank: "white", label: "White belt", level: 1)
        #expect(ShareCardCopy.spoken(card) == "Share card: White belt, 1,234 words in the last 30 days, 1 day on the mat, level 1.")
        #expect(ShareCardCopy.fileName == "murmur-belt.png")
        #expect(ShareCardCopy.about.contains("your last \(Analytics.cardDays) days"))
        for line in [ShareCardCopy.row, ShareCardCopy.title, ShareCardCopy.about, ShareCardCopy.save, ShareCardCopy.painting, ShareCardCopy.failed, ShareCardCopy.tryAgain] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
