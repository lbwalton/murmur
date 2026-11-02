// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Observation
import Testing
import UIKit
import UserNotifications
@testable import murmur

/// Your numbers, time back, and the recap (IOS-022).
@MainActor @Suite(.serialized) struct NumbersTests {
    /// UTC days, so no clock change or midnight moves a take.
    static let utc: Calendar = {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return utc
    }()

    func scratch() throws -> UserDefaults {
        try #require(UserDefaults(suiteName: "murmur.numbers.\(UUID().uuidString)"))
    }

    func rules() throws -> NumbersRules {
        try #require(NumbersRules.live)
    }

    /// A take at `at`, `words` words long, spoken for `seconds`.
    func take(_ at: Date, words: Int, seconds: Int) -> HistoryEntry {
        HistoryEntry(at: at, durationMs: seconds * 1000, words: Array(repeating: "word", count: words).joined(separator: " "), calendar: Self.utc)
    }

    /// Noon in UTC, `days` days from today.
    func noon(_ days: Int) -> Date {
        let today = Self.utc.date(bySettingHour: 12, minute: 0, second: 0, of: .now) ?? .now
        return today.addingTimeInterval(Double(days) * 86_400)
    }

    @Test func theSettingsKeepTheirChoices() throws {
        let defaults = try scratch()
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 36, recapOn: false, recapHour: 17, recapMinute: 30))
        NumbersSettings(typingWpm: 52, recapOn: true, recapHour: 21, recapMinute: 5).save(defaults)
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 52, recapOn: true, recapHour: 21, recapMinute: 5))
        defaults.set(0.0, forKey: NumbersSettings.wpmKey)
        defaults.set(30, forKey: NumbersSettings.hourKey)
        defaults.set(-4, forKey: NumbersSettings.minuteKey)
        #expect(NumbersSettings.load(defaults) == NumbersSettings(typingWpm: 10, recapOn: true, recapHour: 17, recapMinute: 30))
    }

    /// Time back counts against thumbs: 100 words in a minute at 36 words a
    /// minute is 1.8 minutes back, where desktop's 40 gives 1.5.
    @Test func timeBackCountsThumbs() throws {
        let defaults = try scratch()
        let today = HistoryEntry.dayKey(noon(0), calendar: Self.utc)
        let entries = [take(noon(0), words: 100, seconds: 60)]
        let thumbs = Numbers.summary(entries, rules: try rules(), settings: .load(defaults), today: today, defaults: defaults)
        #expect(thumbs.today.minutesBack == 1.8)
        var desk = NumbersSettings.load(defaults)
        desk.typingWpm = 40
        #expect(Numbers.summary(entries, rules: try rules(), settings: desk, today: today, defaults: defaults).today.minutesBack == 1.5)
    }

    /// The numbers screen's month, lifetime, and fourteen days, priced at the
    /// models the takes ran through.
    @Test func theSummaryIsTheTakes() throws {
        let defaults = try scratch()
        let today = HistoryEntry.dayKey(noon(0), calendar: Self.utc)
        let entries = [take(noon(0), words: 300, seconds: 90), take(noon(-1), words: 120, seconds: 40), take(noon(-20), words: 900, seconds: 200)]
        let summary = Numbers.summary(entries, rules: try rules(), settings: .load(defaults), today: today, defaults: defaults)
        #expect(summary.lifetime.sessions == 3 && summary.lifetime.words == 1320)
        #expect(summary.today.sessions == 1 && summary.today.words == 300)
        #expect(summary.days.count == 14 && summary.days.last?.day == today)
        #expect(summary.days.map(\.words).reduce(0, +) == 420)
        #expect(summary.lifetime.estCostUsd > 0)
        #expect(summary.typicalBack == nil)
    }

    /// The recap lays down the coming week at the time picked: today's with
    /// today's takes so far, the rest quiet until their takes land, nothing
    /// before now, and nothing at all when it is off.
    @Test func theRecapPlansTheWeek() throws {
        let defaults = try scratch()
        let entries = [take(noon(0), words: 1240, seconds: 300)]
        let on = NumbersSettings(typingWpm: 36, recapOn: true, recapHour: 17, recapMinute: 30)
        let morning = Self.utc.date(bySettingHour: 9, minute: 0, second: 0, of: noon(0)) ?? .now
        let plan = RecapPlan.plan(entries, rules: try rules(), settings: on, now: morning, calendar: Self.utc, locale: Locale(identifier: "en_US"), defaults: defaults)
        let today = HistoryEntry.dayKey(morning, calendar: Self.utc)
        #expect(plan.items.count == 7)
        #expect(plan.items.first?.day == today && plan.items.first?.id == RecapPlan.prefix + today)
        #expect(plan.items.first?.body == "1 take, 5 minutes, 1,240 words today. 29 minutes back.")
        #expect(plan.items.dropFirst().allSatisfy { $0.body == RecapWords.iPhone.quiet })
        #expect(plan.items.first?.fire.hour == 17 && plan.items.first?.fire.minute == 30)
        let evening = Self.utc.date(bySettingHour: 18, minute: 0, second: 0, of: noon(0)) ?? .now
        let later = RecapPlan.plan(entries, rules: try rules(), settings: on, now: evening, calendar: Self.utc, defaults: defaults)
        #expect(later.items.count == 6 && later.items.first?.day == Paintings.shiftDay(today, 1))
        var off = on
        off.recapOn = false
        #expect(RecapPlan.plan(entries, rules: try rules(), settings: off, now: morning, calendar: Self.utc, defaults: defaults).items.isEmpty)
    }

    /// A notification center that answers slowly, so layings-down overlap
    /// the way a take, a return to murmur, and a settings change can.
    final class SlowCenter: RecapCenter {
        var pending: [String: String] = [:]
        var allowed = true

        func pendingIDs() async -> [String] {
            await Task.yield()
            return Array(pending.keys)
        }

        func remove(_ ids: [String]) {
            for id in ids { pending[id] = nil }
        }

        func isAllowed() async -> Bool {
            await Task.yield()
            return allowed
        }

        func add(_ item: RecapPlan.Item, title: String) async {
            await Task.yield()
            pending[item.id] = item.body
        }
    }

    /// Turning the recap off while it is still being laid down leaves none
    /// pending: the last change made wins.
    @Test func aRecapTurnedOffStaysOff() async throws {
        let defaults = try scratch()
        let entries = [take(noon(0), words: 100, seconds: 60)]
        var settings = NumbersSettings(typingWpm: 36, recapOn: true, recapHour: 23, recapMinute: 59)
        settings.save(defaults)
        let center = SlowCenter()
        let on = Task { await RecapNotifications.refresh(entries, defaults: defaults, center: center) }
        await Task.yield()
        settings.recapOn = false
        settings.save(defaults)
        await RecapNotifications.refresh(entries, defaults: defaults, center: center)
        await on.value
        #expect(center.pending.isEmpty)
    }

    /// Laying the week down again keeps one week, leaves Send one now's
    /// recap to arrive, and with notifications refused leaves none.
    @Test func layingDownAgainKeepsOneWeek() async throws {
        let defaults = try scratch()
        let entries = [take(noon(0), words: 100, seconds: 60)]
        NumbersSettings(typingWpm: 36, recapOn: true, recapHour: 23, recapMinute: 59).save(defaults)
        let center = SlowCenter()
        center.pending[RecapPlan.now] = "now"
        await RecapNotifications.refresh(entries, defaults: defaults, center: center)
        let first = Set(center.pending.keys)
        await RecapNotifications.refresh(entries, defaults: defaults, center: center)
        #expect(Set(center.pending.keys) == first)
        #expect(first.contains(RecapPlan.now) && first.count >= RecapPlan.days)
        center.allowed = false
        await RecapNotifications.refresh(entries, defaults: defaults, center: center)
        #expect(Set(center.pending.keys) == [RecapPlan.now])
    }

    /// Set when an observed value says it changed.
    final class Told: @unchecked Sendable {
        var yes = false
    }

    /// A speed set in Time back and recap reaches Back today: the settings
    /// the screens read tell them when they change, and are kept.
    @Test func aNewSpeedReachesBackToday() throws {
        let defaults = try scratch()
        let store = NumbersSettingsStore(defaults: defaults)
        let told = Told()
        withObservationTracking {
            _ = store.settings
        } onChange: {
            told.yes = true
        }
        var faster = store.settings
        faster.typingWpm = 60
        store.set(faster)
        #expect(told.yes)
        #expect(store.settings.typingWpm == 60 && NumbersSettings.load(defaults).typingWpm == 60)
    }

    /// A recap that arrives while murmur is open still shows, so Send one
    /// now is seen without leaving murmur; anything else shows as iOS would.
    @Test func aRecapShowsWhileMurmurIsOpen() {
        let shown: UNNotificationPresentationOptions = [.banner, .list, .sound]
        #expect(RecapPlan.presentation(for: RecapPlan.now) == shown)
        #expect(RecapPlan.presentation(for: RecapPlan.prefix + "2026-10-14") == shown)
        #expect(RecapPlan.presentation(for: "something.else").isEmpty)
        #expect(UNUserNotificationCenter.current().delegate is RecapPresenter)
    }

    /// An iPhone set to the Buddhist, Japanese, or Persian calendar gets its
    /// recap at the time picked on the day the takes are kept under, with
    /// the trigger in its own calendar's terms.
    @Test(arguments: [Calendar.Identifier.buddhist, .japanese, .persian])
    func theRecapArrivesOnEveryCalendar(_ id: Calendar.Identifier) throws {
        let defaults = try scratch()
        var calendar = Calendar(identifier: id)
        calendar.timeZone = Self.utc.timeZone
        let on = NumbersSettings(typingWpm: 36, recapOn: true, recapHour: 17, recapMinute: 30)
        let morning = Self.utc.date(bySettingHour: 9, minute: 0, second: 0, of: noon(0)) ?? .now
        let plan = RecapPlan.plan([take(noon(0), words: 100, seconds: 60)], rules: try rules(), settings: on, now: morning, calendar: calendar, defaults: defaults)
        let first = try #require(plan.items.first)
        let expected = try #require(Self.utc.date(bySettingHour: 17, minute: 30, second: 0, of: morning))
        #expect(plan.items.count == 7)
        #expect(first.day == HistoryEntry.dayKey(morning, calendar: Self.utc))
        #expect(first.fire.date == expected)
        #expect(first.fire.calendar?.identifier == id)
    }

    /// The page paints the dabs, the wall, its legend, and the stroke at
    /// desktop's sizes, and none of them blank.
    @Test func theMarksArePainted() async throws {
        let painter = try await JourneyPainter.started()
        let days = (0..<14).map { HeatDay(day: Paintings.shiftDay("2026-10-13", $0 - 13), words: $0 % 4 == 0 ? 0 : 50 + $0 * 40) }
        let dabs = try await painter.picture(.dabs(days: days, width: 320), scale: 2).image
        #expect(dabs.size == CGSize(width: 320, height: 76))
        let wallDays = (0..<365).map { HeatDay(day: Paintings.shiftDay("2026-10-13", $0 - 364), words: $0 % 3 == 0 ? $0 * 7 : 0) }
        let wall = try await painter.picture(.wall(days: wallDays), scale: 2).image
        let pad = WallStrip.pad(wallDays.first?.day)
        let columns = (wallDays.count + pad + 6) / 7
        // Desktop's step of 14, less 3 for the last gap, plus 2 of bleed a side.
        let wallWidth: Double = Double(columns) * 14 + 1
        let wallHeight: Double = 99
        #expect(wall.size == CGSize(width: wallWidth, height: wallHeight))
        let legend = try await painter.picture(.legend, scale: 2).image
        let legendWidth: Double = 71
        let legendHeight: Double = 15
        #expect(legend.size == CGSize(width: legendWidth, height: legendHeight))
        let stroke = try await painter.picture(.stroke(share: 0.6, day: "2026-10-13", width: 300), scale: 2).image
        #expect(stroke.size == CGSize(width: 300, height: 24))
        for image in [dabs, wall, legend, stroke] {
            #expect(PaintingDifference.bytes(image).enumerated().contains { $0.offset % 4 == 3 && $0.element > 40 })
        }
    }

    /// The wall's weeks start on Sunday, and each month's name sits over the
    /// week holding its first day, as on desktop.
    @Test func theWallIsLaidOutAsDesktops() {
        #expect(WallStrip.pad("2026-10-11") == 0)
        #expect(WallStrip.pad("2026-10-13") == 2)
        let wall = Heatmap(days: (0..<40).map { HeatDay(day: Paintings.shiftDay("2026-09-20", $0), words: 0) }, totalWords: 0, years: [2026], year: nil)
        let months = WallStrip.months(wall, pad: WallStrip.pad("2026-09-20"))
        #expect(months.map(\.name) == ["Oct"] && months.first?.column == 1)
    }

    @Test func theWordsAreDesktops() throws {
        #expect(Recap.body(RecapSummary(sessions: 0, words: 0, minutes: 0, minutesBack: 0)) == "A quiet day: no dictations. The pill misses you.")
        #expect(Recap.body(RecapSummary(sessions: 2, words: 300, minutes: 2.5, minutesBack: 0.6), locale: Locale(identifier: "en_US")) == "2 takes, 2.5 minutes, 300 words today.")
        #expect(Recap.body(RecapSummary(sessions: 1, words: 100, minutes: 1, minutesBack: 1.8), locale: Locale(identifier: "en_US")) == "1 take, 1 minute, 100 words today. 2 minutes back.")
        let none = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: UsageTotals(), days: [], typicalBack: nil)
        #expect(NumbersCopy.typical(none) == NumbersCopy.noTypical)
        let zero = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: UsageTotals(), days: [], typicalBack: 0)
        #expect(NumbersCopy.typical(zero) == NumbersCopy.zeroTypical)
        var today = UsageTotals()
        today.minutesBack = 20.5
        let half = AnalyticsSummary(lifetime: UsageTotals(), month: UsageTotals(), today: today, days: [], typicalBack: 41)
        #expect(NumbersCopy.typical(half) == "50% of your typical day (41 min)")
        #expect(Numbers.money(0) == "$0.00" && Numbers.money(0.004) == "<$0.01" && Numbers.money(1.234) == "$1.23")
        let wall = Heatmap(days: [HeatDay(day: "2026-10-01", words: 90), HeatDay(day: "2026-10-02", words: 90)], totalWords: 180, years: [2026], year: nil)
        #expect(NumbersCopy.wallLabel(wall) == "Activity wall: 180 words lifetime, on 2 days; the busiest was Oct 1 with 90 words")
        for line in [NumbersCopy.typingFooter, NumbersCopy.recapFooter, NumbersCopy.denied, NumbersCopy.noTypical, NumbersCopy.zeroTypical, NumbersCopy.ratesNote("2026-10-01"), NumbersCopy.wallNote, NumbersCopy.emptyLine] {
            #expect(!line.contains("Murmur") && !line.contains("\u{2014}") && !line.contains(" - "))
        }
    }
}
