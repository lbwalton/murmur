// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

/// shared/analytics-vectors.json: desktop's analytics, time back, and recap
/// on fixed takes.
struct AnalyticsVectors: Decodable {
    struct Take: Decodable {
        let day: String
        let words: Int
        let durationMs: Int?

        var usage: UsageEvent { UsageEvent(day: day, words: words, durationMs: durationMs ?? 1000) }
    }

    struct Day: Decodable, Equatable {
        let day: String
        let words: Int
        let sessions: Int
    }

    struct DailyCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let count: Int
        let takes: [Take]
        let expect: [Day]

        var testDescription: String { name }
    }

    struct RatesJSON: Decodable {
        struct Stt: Decodable {
            let minimumBillableSeconds: Double
            let models: [String: Double]
            let fallbackPerHourUsd: Double
        }

        struct LlmRate: Decodable {
            let inputPerMTokUsd: Double
            let outputPerMTokUsd: Double
        }

        struct Llm: Decodable {
            let promptOverheadTokens: Double
            let tokensPerWord: Double
            let models: [String: LlmRate]
            let fallback: LlmRate
        }

        let stt: Stt
        let llm: Llm
    }

    struct TimeBackCases: Decodable {
        struct Back: Decodable {
            let words: Int
            let durationMs: Int
            let wpm: Double
            let minutesBack: Double
        }

        struct Clamp: Decodable {
            let value: Double?
            let clamped: Double
        }

        struct Shown: Decodable {
            let raw: Double
            let shown: Double
        }

        struct Format: Decodable {
            let minutes: Double
            let short: String
            let words: String
        }

        struct Line: Decodable {
            let share: Double
            let typical: Double
            let line: String
        }

        let defaultWpm: Double
        let minutesBack: [Back]
        let clamp: [Clamp]
        let shown: [Shown]
        let format: [Format]
        let typicalLine: [Line]
    }

    struct TypicalCases: Decodable {
        struct DayBack: Decodable {
            let days: [Double]
            let typical: Double?
        }

        struct Share: Decodable {
            let today: Double
            let typical: Double
            let share: Double
        }

        let dayBack: [DayBack]
        let share: [Share]
    }

    struct Totals: Decodable {
        let sessions, words: Int
        let minutes, estCostUsd: Double
        let avgWpm: Int
        let minutesBack: Double
    }

    struct Usage: Decodable {
        let day: String
        let sessions, words: Int
        let minutes, minutesBack: Double
    }

    struct Summary: Decodable {
        let lifetime, month, today: Totals
        let days: [Usage]
        let typicalBack: Double?
    }

    struct AggregateCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let typingWpm: Double
        let sttModel: String
        let llmModel: String
        let takes: [Take]
        let expect: Summary

        var testDescription: String { name }
    }

    struct HeatSummary: Decodable {
        let first: String?
        let last: String?
        let count: Int
        let busy: [Day2]
        let totalWords: Int
        let years: [Int]
        /// "lifetime", or the year.
        let period: Period

        struct Day2: Decodable, Equatable {
            let day: String
            let words: Int
        }

        enum Period: Decodable, Equatable {
            case lifetime
            case year(Int)

            init(from decoder: any Decoder) throws {
                let container = try decoder.singleValueContainer()
                if let year = try? container.decode(Int.self) { self = .year(year) } else { self = .lifetime }
            }
        }
    }

    struct HeatCase: Decodable, CustomTestStringConvertible {
        let name: String
        let today: String
        let year: Int?
        let takes: [Take]
        let expect: HeatSummary

        var testDescription: String { name }
    }

    struct RecapCase: Decodable {
        let sessions, words: Int
        let minutes, minutesBack: Double
        let body: String
    }

    /// Desktop's CARD_DAYS: the days the share card paints.
    let cardDays: Int
    let dailyTotals: [DailyCase]
    let rates: RatesJSON
    let timeBack: TimeBackCases
    let typical: TypicalCases
    let aggregate: [AggregateCase]
    let heatmap: [HeatCase]
    let recap: [RecapCase]

    static let file: AnalyticsVectors? = try? SharedData(directory: repoShared).decode(AnalyticsVectors.self, from: "analytics-vectors.json")
    static let catalog: ProviderCatalog? = try? SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")
}

/// Near enough: sums of doubles in the same order, give or take a last bit.
private func near(_ a: Double, _ b: Double) -> Bool {
    abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))
}

private func same(_ got: UsageTotals, _ want: AnalyticsVectors.Totals) -> Bool {
    got.sessions == want.sessions && got.words == want.words && near(got.minutes, want.minutes) && near(got.estCostUsd, want.estCostUsd) && got.avgWpm == want.avgWpm && near(got.minutesBack, want.minutesBack)
}

@Suite struct AnalyticsVectorTests {
    @Test func theVectorsLoad() throws {
        #expect(try #require(AnalyticsVectors.file).dailyTotals.count >= 5)
    }

    /// The card's month is desktop's length, so its strokes and its words
    /// ("in the last 30 days", painted by desktop's code) always agree.
    @Test func theCardsMonthIsDesktops() throws {
        #expect(try #require(AnalyticsVectors.file).cardDays == Analytics.cardDays)
    }

    @Test(arguments: AnalyticsVectors.file?.dailyTotals ?? [])
    func eachMonthTotalsAsOnDesktop(_ vector: AnalyticsVectors.DailyCase) {
        let events = vector.takes.map { RankEvent(at: 0, words: $0.words, day: $0.day) }
        let days = Analytics.dailyTotals(events, count: vector.count, today: vector.today)
        #expect(days.map { AnalyticsVectors.Day(day: $0.day, words: $0.words, sessions: $0.sessions) } == vector.expect)
    }

    /// No days asked for is no days, and a take with no day key is left out.
    @Test func edges() {
        #expect(Analytics.dailyTotals([], count: 0, today: "2026-10-13").isEmpty)
        let odd = [RankEvent(at: 0, words: 9, day: "")]
        #expect(Analytics.dailyTotals(odd, count: 2, today: "2026-10-13").map(\.words) == [0, 0])
    }

    /// The rates read from the bundled catalog as desktop's ratesFromCatalog reads them.
    @Test func ratesAreDesktops() throws {
        let want = try #require(AnalyticsVectors.file).rates
        let rates = Rates(try #require(AnalyticsVectors.catalog))
        #expect(rates.sttMinimumBillableSeconds == want.stt.minimumBillableSeconds)
        #expect(rates.sttModels == want.stt.models)
        #expect(rates.sttFallbackPerHourUsd == want.stt.fallbackPerHourUsd)
        #expect(rates.promptOverheadTokens == want.llm.promptOverheadTokens && rates.tokensPerWord == want.llm.tokensPerWord)
        #expect(rates.llmModels == want.llm.models.mapValues { LlmRate(inputPerMTokUsd: $0.inputPerMTokUsd, outputPerMTokUsd: $0.outputPerMTokUsd) })
        #expect(rates.llmFallback == LlmRate(inputPerMTokUsd: want.llm.fallback.inputPerMTokUsd, outputPerMTokUsd: want.llm.fallback.outputPerMTokUsd))
    }

    @Test func timeBackIsDesktops() throws {
        let t = try #require(AnalyticsVectors.file).timeBack
        for c in t.minutesBack {
            #expect(TimeBack.minutesBack(words: c.words, durationMs: c.durationMs, wpm: c.wpm) == c.minutesBack, "\(c.words) \(c.durationMs) \(c.wpm)")
        }
        for c in t.clamp {
            #expect(TimeBack.clamp(c.value, fallback: t.defaultWpm) == c.clamped, "\(String(describing: c.value))")
        }
        for c in t.shown { #expect(TimeBack.shownMinutes(c.raw) == c.shown, "\(c.raw)") }
        for c in t.format {
            #expect(TimeBack.format(c.minutes) == c.short, "\(c.minutes)")
            #expect(TimeBack.formatWords(c.minutes) == c.words, "\(c.minutes)")
        }
        for c in t.typicalLine { #expect(TimeBack.typicalLine(share: c.share, typical: c.typical) == c.line) }
    }

    @Test func theTypicalDayIsDesktops() throws {
        let t = try #require(AnalyticsVectors.file).typical
        for c in t.dayBack { #expect(Analytics.typicalDayBack(c.days) == c.typical, "\(c.days)") }
        for c in t.share { #expect(Analytics.typicalShare(today: c.today, typical: c.typical) == c.share, "\(c.today) \(c.typical)") }
    }

    @Test(arguments: AnalyticsVectors.file?.aggregate ?? [])
    func eachSummaryIsDesktops(_ vector: AnalyticsVectors.AggregateCase) throws {
        let rates = Rates(try #require(AnalyticsVectors.catalog))
        let got = Analytics.aggregate(vector.takes.map(\.usage), rates: rates, today: vector.today, sttModel: vector.sttModel, llmModel: vector.llmModel, typingWpm: vector.typingWpm)
        let want = vector.expect
        #expect(same(got.lifetime, want.lifetime), "lifetime \(got.lifetime)")
        #expect(same(got.month, want.month), "month \(got.month)")
        #expect(same(got.today, want.today), "today \(got.today)")
        #expect(got.days.map(\.day) == want.days.map(\.day))
        for (g, w) in zip(got.days, want.days) {
            #expect(g.sessions == w.sessions && g.words == w.words && near(g.minutes, w.minutes) && near(g.minutesBack, w.minutesBack), "\(g.day)")
        }
        #expect(got.typicalBack == want.typicalBack)
    }

    @Test(arguments: AnalyticsVectors.file?.heatmap ?? [])
    func eachWallIsDesktops(_ vector: AnalyticsVectors.HeatCase) {
        let wall = Analytics.heatmap(vector.takes.map(\.usage), today: vector.today, year: vector.year)
        let want = vector.expect
        #expect(wall.days.first?.day == want.first && wall.days.last?.day == want.last && wall.days.count == want.count)
        #expect(wall.days.filter { $0.words > 0 }.map { AnalyticsVectors.HeatSummary.Day2(day: $0.day, words: $0.words) } == want.busy)
        #expect(wall.totalWords == want.totalWords && wall.years == want.years)
        #expect(wall.year.map { AnalyticsVectors.HeatSummary.Period.year($0) } ?? .lifetime == want.period)
    }

    /// Desktop's recap sentence, with desktop's words for its takes.
    @Test func theRecapIsDesktops() throws {
        for c in try #require(AnalyticsVectors.file).recap {
            let summary = RecapSummary(sessions: c.sessions, words: c.words, minutes: c.minutes, minutesBack: c.minutesBack)
            #expect(Recap.body(summary, words: .desktop, locale: Locale(identifier: "en_US")) == c.body)
        }
    }

    /// The iPhone docs quote the recap as the iPhone says it, counted
    /// against thumbs: 4 takes, 12 minutes, and 1,240 words.
    @Test func theDocsQuoteTheIPhonesRecap() throws {
        let page = repoShared.deletingLastPathComponent().appendingPathComponent("docs/iphone.md")
        let docs = try String(contentsOf: page, encoding: .utf8)
        let back = TimeBack.minutesBack(words: 1240, durationMs: 720_000, wpm: TimeBack.thumbWpm)
        let said = Recap.body(RecapSummary(sessions: 4, words: 1240, minutes: 12, minutesBack: back), words: .iPhone, locale: Locale(identifier: "en_US"))
        #expect(docs.contains("\"\(said)\""), "the docs should quote \(said)")
    }
}
