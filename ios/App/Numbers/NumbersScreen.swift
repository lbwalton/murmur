// SPDX-License-Identifier: GPL-3.0-only
// Your numbers (ios/prd.json IOS-022): this month, the last fourteen days as
// brush dabs, the activity wall as blots, and the lifetime, the numbers
// desktop's math gives and the marks desktop's paint makes; Home's Back
// today with its one gold stroke for today against a typical day.
import MurmurCore
import SwiftUI
import UIKit

/// Your numbers, made as the screen opens: a link's destination is made
/// whenever Home draws.
struct NumbersRoute: View {
    let history: History

    var body: some View {
        if let rules = NumbersRules.live {
            NumbersScreen(history: history, rules: rules)
        } else {
            Tokens.ink.ignoresSafeArea()
        }
    }
}

struct NumbersScreen: View {
    let history: History
    let rules: NumbersRules
    @Environment(\.displayScale) private var scale
    @State private var width: Double = 0
    @State private var dabs: UIImage?
    @State private var wallImage: UIImage?
    @State private var legend: UIImage?

    private let stats = [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)]

    var body: some View {
        let summary = Numbers.summary(history.entries, rules: rules, settings: NumbersSettingsStore.shared.settings)
        let wall = Analytics.heatmap(Numbers.usage(history.entries), today: HistoryEntry.dayKey(.now), year: nil)
        List {
            if history.entries.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 14) {
                        DryMark()
                            .frame(width: 120, height: 30)
                            .accessibilityHidden(true)
                        Text(NumbersCopy.emptyTitle).font(.headline)
                        Text(NumbersCopy.emptyLine).foregroundStyle(Tokens.textDim)
                    }
                    .padding(.vertical, 12)
                }
                .listRowBackground(Tokens.panel)
            } else {
                Section {
                    LazyVGrid(columns: stats, alignment: .leading, spacing: 16) {
                        Stat(label: NumbersCopy.minutesDictated, value: Recap.number(summary.month.minutes))
                        Stat(label: NumbersCopy.words, value: summary.month.words.formatted(.number))
                        Stat(label: NumbersCopy.takes, value: summary.month.sessions.formatted(.number))
                        Stat(label: NumbersCopy.timeBack, value: TimeBack.format(summary.month.minutesBack))
                        Stat(label: NumbersCopy.cost, value: Numbers.money(summary.month.estCostUsd))
                    }
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.thisMonth)
                } footer: {
                    Text(NumbersCopy.ratesNote(rules.catalog.verifiedOn)).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)

                Section {
                    VStack(spacing: 4) {
                        Group {
                            if let dabs {
                                Image(uiImage: dabs).resizable()
                            } else {
                                Color.clear
                            }
                        }
                        .frame(height: 76)
                        HStack(spacing: 0) {
                            ForEach(summary.days, id: \.day) { day in
                                Text(String(day.day.suffix(2)))
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(Tokens.textDim)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        // Each number sits under its dab, so it grows only as
                        // far as the column allows; VoiceOver reads every day.
                        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
                    }
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(NumbersCopy.chartLabel(summary.days))
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.lastDays)
                }
                .listRowBackground(Tokens.panel)
                .task(id: DabsKey(days: summary.days.map { HeatDay(day: $0.day, words: $0.words) }, width: width, scale: scale)) {
                    guard width > 0 else { return }
                    let days = summary.days.map { HeatDay(day: $0.day, words: $0.words) }
                    dabs = try? await JourneyPainter.shared.picture(.dabs(days: days, width: width), scale: scale).image
                }

                Section {
                    Text(NumbersCopy.wallTotal(wall.totalWords))
                        .font(.subheadline)
                    WallStrip(wall: wall, image: wallImage)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(NumbersCopy.wallLabel(wall))
                    HStack(spacing: 8) {
                        Text(NumbersCopy.less)
                        Group {
                            if let legend { Image(uiImage: legend) } else { Color.clear.frame(width: 70, height: 15) }
                        }
                        Text(NumbersCopy.more)
                    }
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Tokens.textDim)
                    .accessibilityHidden(true)
                } header: {
                    SectionTitle(NumbersCopy.wall)
                } footer: {
                    Text(NumbersCopy.wallNote).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
                .task(id: WallKey(days: wall.days, scale: scale)) {
                    wallImage = try? await JourneyPainter.shared.picture(.wall(days: wall.days), scale: scale).image
                    if legend == nil {
                        legend = try? await JourneyPainter.shared.picture(.legend, scale: scale).image
                    }
                }

                Section {
                    LazyVGrid(columns: stats, alignment: .leading, spacing: 16) {
                        Stat(label: NumbersCopy.minutes, value: Recap.number(summary.lifetime.minutes))
                        Stat(label: NumbersCopy.words, value: summary.lifetime.words.formatted(.number))
                        Stat(label: NumbersCopy.takes, value: summary.lifetime.sessions.formatted(.number))
                        Stat(label: NumbersCopy.avgWpm, value: summary.lifetime.avgWpm.formatted(.number))
                        Stat(label: NumbersCopy.timeBack, value: TimeBack.format(summary.lifetime.minutesBack))
                        Stat(label: NumbersCopy.cost, value: Numbers.money(summary.lifetime.estCostUsd))
                    }
                    .padding(.vertical, 6)
                } header: {
                    SectionTitle(NumbersCopy.lifetime)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(NumbersCopy.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private struct DabsKey: Hashable {
        let days: [HeatDay]
        let width: Double
        let scale: CGFloat
    }

    private struct WallKey: Hashable {
        let days: [HeatDay]
        let scale: CGFloat
    }
}

/// One number and its label.
struct Stat: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.title3.weight(.semibold).monospacedDigit())
            Text(label)
                .font(.footnote)
                .foregroundStyle(Tokens.textDim)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The wall, scrolled to today, with its month and day names, as desktop
/// lays them out: Sunday on top, a column a week.
struct WallStrip: View {
    let wall: Heatmap
    let image: UIImage?

    /// Desktop's cell step and bleed (settings/analyticsPaint.ts).
    static let step = 14.0
    static let bleed = 2.0

    var body: some View {
        let pad = Self.pad(wall.days.first?.day)
        let columns = (wall.days.count + pad + 6) / 7
        let width = Double(columns) * Self.step - 3 + 2 * Self.bleed
        let height = 7 * Self.step - 3 + 2 * Self.bleed
        HStack(alignment: .top, spacing: 6) {
            VStack(alignment: .trailing, spacing: 0) {
                // As tall as the month row, so the day names stay on their rows.
                Text(" ").hidden().frame(width: 0)
                ForEach(0..<7, id: \.self) { row in
                    Text(row == 1 ? "mon" : row == 3 ? "wed" : row == 5 ? "fri" : "")
                        .frame(height: Self.step)
                }
            }
            .font(.system(.caption2, design: .monospaced))
            .foregroundStyle(Tokens.textDim)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        ZStack(alignment: .topLeading) {
                            Text(" ").hidden().frame(width: width)
                            ForEach(Self.months(wall, pad: pad), id: \.column) { label in
                                Text(label.name)
                                    .offset(x: Self.bleed + Double(label.column) * Self.step)
                            }
                        }
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(Tokens.textDim)
                        Group {
                            if let image {
                                Image(uiImage: image)
                            } else {
                                Color.clear
                            }
                        }
                        .frame(width: width, height: height)
                        .id("today")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .onAppear { proxy.scrollTo("today", anchor: .trailing) }
                .onChange(of: image == nil) { proxy.scrollTo("today", anchor: .trailing) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // The labels sit on the painted grid, so they grow only as far as it
        // allows, as the Journey's road does; VoiceOver reads the wall whole.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }

    /// Blank cells before the first day, so weeks start on Sunday.
    static func pad(_ first: String?) -> Int {
        guard let first else { return 0 }
        let parts = first.split(separator: "-").compactMap { Int($0) }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        guard parts.count == 3, let date = gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return 0 }
        return gregorian.component(.weekday, from: date) - 1
    }

    /// A month's name over the week holding its first day, as desktop does.
    static func months(_ wall: Heatmap, pad: Int) -> [(column: Int, name: String)] {
        wall.days.enumerated().compactMap { index, day in
            guard day.day.hasSuffix("-01") else { return nil }
            let name = Numbers.prettyDay(day.day).split(separator: " ").first.map(String.init) ?? ""
            return ((index + pad) / 7, name)
        }
    }
}

/// Home's Back today: today's time back, the gold stroke for it against a
/// typical day, and the month and lifetime, as desktop's Home shows them.
struct BackToday: View {
    let history: History
    let rules: NumbersRules
    @Environment(\.displayScale) private var scale
    @State private var width: Double = 0
    @State private var stroke: UIImage?

    var body: some View {
        let summary = Numbers.summary(history.entries, rules: rules, settings: NumbersSettingsStore.shared.settings)
        let today = HistoryEntry.dayKey(.now)
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text(TimeBack.format(summary.today.minutesBack))
                    .font(.largeTitle.weight(.semibold).monospacedDigit())
                if let typical = summary.typicalBack {
                    Group {
                        if let stroke { Image(uiImage: stroke).resizable() } else { Color.clear }
                    }
                    .frame(height: 24)
                    .frame(maxWidth: .infinity)
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    .accessibilityHidden(true)
                    .task(id: StrokeKey(share: Analytics.typicalShare(today: summary.today.minutesBack, typical: typical), day: today, width: width, scale: scale)) {
                        guard width > 0 else { return }
                        let share = Analytics.typicalShare(today: summary.today.minutesBack, typical: typical)
                        stroke = try? await JourneyPainter.shared.picture(.stroke(share: share, day: today, width: width), scale: scale).image
                    }
                }
                Text(NumbersCopy.typical(summary))
                    .foregroundStyle(Tokens.textDim)
                Text(NumbersCopy.spans(month: summary.month.minutesBack, lifetime: summary.lifetime.minutesBack))
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
            }
            .padding(.vertical, 6)
            .accessibilityElement(children: .combine)
            NavigationLink {
                NumbersRoute(history: history)
            } label: {
                Text(NumbersCopy.row)
                    .foregroundStyle(Tokens.brand)
                    .frame(minHeight: 44)
            }
        } header: {
            SectionTitle(NumbersCopy.backToday)
        }
        .listRowBackground(Tokens.panel)
    }

    private struct StrokeKey: Hashable {
        let share: Double
        let day: String
        let width: Double
        let scale: CGFloat
    }
}

#if DEBUG
/// A made-up stretch of takes for the previews, a few days quiet.
@MainActor private func previewHistory(days: Int) -> History {
    let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "numbers-preview-\(UUID().uuidString).jsonl"))
    for i in 0..<days where i % 4 != 3 {
        let words = 60 + (i * 97) % 500
        let seconds = 20 + (i * 13) % 90
        let at = Date.now.addingTimeInterval(Double(-i) * 86_400)
        try? store.append(HistoryEntry(at: at, durationMs: seconds * 1000, words: Array(repeating: "word", count: words).joined(separator: " ")))
    }
    return History(store: store)
}

#Preview("Your numbers") {
    NavigationStack {
        if let rules = NumbersRules.live { NumbersScreen(history: previewHistory(days: 60), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("No numbers yet") {
    NavigationStack {
        if let rules = NumbersRules.live { NumbersScreen(history: previewHistory(days: 0), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("Back today") {
    NavigationStack {
        if let rules = NumbersRules.live {
            List { BackToday(history: previewHistory(days: 30), rules: rules) }
                .scrollContentBackground(.hidden)
                .background(Tokens.ink)
        }
    }
    .preferredColorScheme(.dark)
}
#endif
