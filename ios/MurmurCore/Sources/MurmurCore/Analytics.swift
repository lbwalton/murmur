// SPDX-License-Identifier: GPL-3.0-only
// The analytics (ios/prd.json IOS-021, IOS-022): desktop's
// src/shared/analytics.ts over the iPhone's takes, held to it by
// shared/analytics-vectors.json: the share card's month, this month, today,
// the lifetime, the last fourteen days, the typical day, the activity
// wall, and the estimated cost at the catalog's rates. Days are the keys
// each take stored, so a time zone change never re-buckets the past.
import Foundation

/// One day's words and takes.
public struct DayTotal: Sendable, Hashable {
    public let day: String
    public let words: Int
    public let sessions: Int

    public init(day: String, words: Int, sessions: Int) {
        self.day = day
        self.words = words
        self.sessions = sessions
    }
}

/// One take as the numbers see it: its day, its words, how long it ran.
public struct UsageEvent: Sendable, Equatable {
    public let day: String
    public let words: Int
    public let durationMs: Int

    public init(day: String, words: Int, durationMs: Int) {
        self.day = day
        self.words = words
        self.durationMs = durationMs
    }
}

/// A chat model's price, US dollars per million tokens.
public struct LlmRate: Sendable, Equatable {
    public let inputPerMTokUsd: Double
    public let outputPerMTokUsd: Double

    public init(inputPerMTokUsd: Double, outputPerMTokUsd: Double) {
        self.inputPerMTokUsd = inputPerMTokUsd
        self.outputPerMTokUsd = outputPerMTokUsd
    }
}

/// The rates the estimate prices takes at, as desktop's ratesFromCatalog
/// reads them from shared/provider-catalog.json: US dollar rates only, the
/// first provider listing a model setting its price.
public struct Rates: Sendable, Equatable {
    public let sttMinimumBillableSeconds: Double
    public let sttModels: [String: Double]
    public let sttFallbackPerHourUsd: Double
    public let promptOverheadTokens: Double
    public let tokensPerWord: Double
    public let llmModels: [String: LlmRate]
    public let llmFallback: LlmRate

    public init(_ catalog: ProviderCatalog) {
        var stt: [String: Double] = [:]
        var llm: [String: LlmRate] = [:]
        var minimum = 0.0
        for provider in catalog.providers {
            for model in provider.sttModels {
                if let perHour = model.perHourUsd, (model.currency ?? "USD") == "USD", stt[model.id] == nil {
                    stt[model.id] = perHour
                    minimum = max(minimum, model.minimumBillableSeconds ?? 0)
                }
            }
            for model in provider.llmModels {
                if let input = model.inputPerMTok, let output = model.outputPerMTok, (model.currency ?? "USD") == "USD", llm[model.id] == nil {
                    llm[model.id] = LlmRate(inputPerMTokUsd: input, outputPerMTokUsd: output)
                }
            }
        }
        sttMinimumBillableSeconds = minimum
        sttModels = stt
        sttFallbackPerHourUsd = stt["whisper-large-v3-turbo"] ?? 0.04
        promptOverheadTokens = catalog.estimate.promptOverheadTokens
        tokensPerWord = catalog.estimate.tokensPerWord
        llmModels = llm
        llmFallback = llm["openai/gpt-oss-120b"] ?? LlmRate(inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6)
    }
}

/// Totals over a span of takes, rounded the way desktop shows them.
public struct UsageTotals: Sendable, Equatable {
    public var sessions = 0
    public var words = 0
    /// Minutes spoken, to a tenth.
    public var minutes = 0.0
    /// Estimated cost, US dollars to a hundredth of a cent.
    public var estCostUsd = 0.0
    /// Words per spoken minute across the span.
    public var avgWpm = 0
    /// Minutes not spent typing, to a tenth, never below zero.
    public var minutesBack = 0.0

    public init(sessions: Int = 0, words: Int = 0, minutes: Double = 0, estCostUsd: Double = 0, avgWpm: Int = 0, minutesBack: Double = 0) {
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.estCostUsd = estCostUsd
        self.avgWpm = avgWpm
        self.minutesBack = minutesBack
    }
}

/// One day of the chart.
public struct DayUsage: Sendable, Equatable {
    public let day: String
    public var sessions = 0
    public var words = 0
    public var minutes = 0.0
    public var minutesBack = 0.0

    public init(day: String, sessions: Int = 0, words: Int = 0, minutes: Double = 0, minutesBack: Double = 0) {
        self.day = day
        self.sessions = sessions
        self.words = words
        self.minutes = minutes
        self.minutesBack = minutesBack
    }
}

/// Everything the numbers screen and Home show.
public struct AnalyticsSummary: Sendable, Equatable {
    public let lifetime: UsageTotals
    public let month: UsageTotals
    public let today: UsageTotals
    /// The chart's days, oldest first, ending today.
    public let days: [DayUsage]
    /// The typical day's time back, or nil with too few days to call one typical.
    public let typicalBack: Double?

    public init(lifetime: UsageTotals, month: UsageTotals, today: UsageTotals, days: [DayUsage], typicalBack: Double?) {
        self.lifetime = lifetime
        self.month = month
        self.today = today
        self.days = days
        self.typicalBack = typicalBack
    }
}

/// One day on the activity wall.
public struct HeatDay: Sendable, Hashable {
    public let day: String
    public let words: Int

    public init(day: String, words: Int) {
        self.day = day
        self.words = words
    }
}

/// The activity wall's days.
public struct Heatmap: Sendable, Equatable {
    /// Oldest first, zero-filled, covering the whole period.
    public let days: [HeatDay]
    public let totalWords: Int
    /// Calendar years holding a take, oldest first.
    public let years: [Int]
    /// The year shown, or nil for the lifetime.
    public let year: Int?

    public init(days: [HeatDay], totalWords: Int, years: [Int], year: Int?) {
        self.days = days
        self.totalWords = totalWords
        self.years = years
        self.year = year
    }
}

public enum Analytics {
    /// The days the share card paints (desktop's CARD_DAYS).
    public static let cardDays = 30
    /// A typical day is measured over this many days before today.
    public static let typicalWindowDays = 28
    /// Fewer active days than this in the window and there is no typical day.
    public static let typicalMinDays = 3

    /// Words and takes for each of the last `count` days ending `today`
    /// (a yyyy-MM-dd key), oldest first, zero-filled, by each take's stored
    /// day, as desktop's dailyTotals counts them.
    public static func dailyTotals(_ events: [RankEvent], count: Int, today: String) -> [DayTotal] {
        guard count > 0 else { return [] }
        let keys = (0..<count).map { Paintings.shiftDay(today, $0 - (count - 1)) }
        var words: [String: Int] = [:]
        var sessions: [String: Int] = [:]
        let wanted = Set(keys)
        for event in events where wanted.contains(event.day) {
            words[event.day, default: 0] += event.words
            sessions[event.day, default: 0] += 1
        }
        return keys.map { DayTotal(day: $0, words: words[$0] ?? 0, sessions: sessions[$0] ?? 0) }
    }

    /// The median time back across the active days given (each day's
    /// total), or nil when there are too few to call any of them typical.
    public static func typicalDayBack(_ days: [Double]) -> Double? {
        guard days.count >= typicalMinDays else { return nil }
        let sorted = days.sorted()
        let mid = sorted.count / 2
        let median = sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
        return roundBack(median)
    }

    /// Today as a share of a typical day: 1 is typical, above 1 a bigger
    /// day. A typical day with no time back counts any time back as full.
    public static func typicalShare(today: Double, typical: Double) -> Double {
        if typical <= 0 { return today > 0 ? 1 : 0 }
        return max(0, today) / typical
    }

    /// The estimated cost of one take: its audio at the speech model's
    /// hourly rate (billed at least the minimum), and the cleanup pass's
    /// tokens in and out at the chat model's.
    public static func sessionCost(words: Int, durationMs: Int, rates: Rates, sttModel: String, llmModel: String) -> Double {
        let seconds: Double = max(Double(durationMs) / 1000, rates.sttMinimumBillableSeconds)
        let perHour: Double = rates.sttModels[sttModel] ?? rates.sttFallbackPerHourUsd
        let stt: Double = seconds / 3600 * perHour
        let llm = rates.llmModels[llmModel] ?? rates.llmFallback
        let content: Double = Double(words) * rates.tokensPerWord
        let input: Double = content + rates.promptOverheadTokens
        let inCost: Double = input / 1_000_000 * llm.inputPerMTokUsd
        let outCost: Double = content / 1_000_000 * llm.outputPerMTokUsd
        return stt + (inCost + outCost)
    }

    /// The numbers for these takes as of `today`, at the typing speed and
    /// rates given, with `dayCount` days in the chart.
    public static func aggregate(_ events: [UsageEvent], rates: Rates, today: String, sttModel: String, llmModel: String, dayCount: Int = 14, typingWpm: Double) -> AnalyticsSummary {
        let monthPrefix = String(today.prefix(7))
        var lifetime = Raw()
        var month = Raw()
        var todays = Raw()
        var days = (0..<dayCount).map { DayUsage(day: Paintings.shiftDay(today, $0 - (dayCount - 1))) }
        var dayIndex: [String: Int] = [:]
        for (index, day) in days.enumerated() { dayIndex[day.day] = index }
        let window = Set((1...typicalWindowDays).map { Paintings.shiftDay(today, -$0) })
        var backByDay: [String: Double] = [:]
        for event in events {
            let cost = sessionCost(words: event.words, durationMs: event.durationMs, rates: rates, sttModel: sttModel, llmModel: llmModel)
            let back = TimeBack.minutesBack(words: event.words, durationMs: event.durationMs, wpm: typingWpm)
            lifetime.add(event, cost: cost, back: back)
            if event.day.hasPrefix(monthPrefix) { month.add(event, cost: cost, back: back) }
            if event.day == today { todays.add(event, cost: cost, back: back) }
            if window.contains(event.day) { backByDay[event.day, default: 0] += back }
            if let index = dayIndex[event.day] {
                days[index].sessions += 1
                days[index].words += event.words
                // Raw sums; rounded once after the loop, so rounding never compounds.
                days[index].minutes += Double(event.durationMs) / 60_000
                days[index].minutesBack += back
            }
        }
        for index in days.indices {
            days[index].minutes = JS.round(days[index].minutes * 10) / 10
            days[index].minutesBack = roundBack(days[index].minutesBack)
        }
        // Each day as it is shown (never below zero) before the median, in
        // the order desktop met them.
        let typical = typicalDayBack(backByDay.values.map(roundBack))
        return AnalyticsSummary(lifetime: lifetime.rounded, month: month.rounded, today: todays.rounded, days: days, typicalBack: typical)
    }

    /// The activity wall's days: with no year, the lifetime, from the first
    /// take through today, padded back to at least a full year; with a
    /// year, that calendar year alone, clipped at today.
    public static func heatmap(_ events: [UsageEvent], today: String, year: Int?) -> Heatmap {
        var wordsByDay: [String: Int] = [:]
        var years = Set<Int>()
        for event in events where Paintings.isDayKey(event.day) {
            wordsByDay[event.day, default: 0] += event.words
            if let y = Int(event.day.prefix(4)) { years.insert(y) }
        }
        let start: String
        let end: String
        if let year {
            let first = String(format: "%04d-01-01", year)
            let last = String(format: "%04d-12-31", year)
            start = first
            end = min(last, today)
        } else {
            end = today
            let yearAgo = Paintings.shiftDay(today, -364)
            let firstTake = wordsByDay.keys.min() ?? yearAgo
            start = min(firstTake, yearAgo)
        }
        var days: [HeatDay] = []
        var total = 0
        var day = start
        while day <= end {
            let words = wordsByDay[day] ?? 0
            days.append(HeatDay(day: day, words: words))
            total += words
            day = Paintings.shiftDay(day, 1)
        }
        // A brand new history still gets this year as a destination.
        if years.isEmpty, let y = Int(today.prefix(4)) { years.insert(y) }
        return Heatmap(days: days, totalWords: total, years: years.sorted(), year: year)
    }

    /// Display rounding for time back: a total never reads below zero.
    static func roundBack(_ minutes: Double) -> Double {
        JS.round(max(0, minutes) * 10) / 10
    }

    /// Unrounded running totals.
    private struct Raw {
        var sessions = 0
        var words = 0
        var minutes = 0.0
        var cost = 0.0
        var back = 0.0

        mutating func add(_ event: UsageEvent, cost: Double, back: Double) {
            sessions += 1
            words += event.words
            minutes += Double(event.durationMs) / 60_000
            self.cost += cost
            self.back += back
        }

        var rounded: UsageTotals {
            let wpm = minutes > 0 ? Int(JS.round(Double(words) / minutes)) : 0
            return UsageTotals(
                sessions: sessions,
                words: words,
                minutes: JS.round(minutes * 10) / 10,
                estCostUsd: JS.round(cost * 10_000) / 10_000,
                avgWpm: wpm,
                minutesBack: roundBack(back)
            )
        }
    }
}
