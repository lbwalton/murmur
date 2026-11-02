// SPDX-License-Identifier: GPL-3.0-only
// The Journey on iPhone (ios/prd.json IOS-017, painted in IOS-018): the
// belt with its stripes, the road, the words and days toward the next
// belt, the achievements as ink stamps, and the dated promotions. The
// paintings come from desktop's own painter (JourneyArt); every word is a
// native view beside or over them. A new belt gets the ceremony when the
// Journey opens, and a new stripe slaps its tape onto the belt.
import MurmurCore
import SwiftUI

struct JourneyScreen: View {
    let history: History
    let rules: JourneyRules
    var memory = CelebrationMemory(defaults: .standard)

    @Environment(\.displayScale) private var scale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var art = JourneyArt()
    @State private var tape = TapeDrop()
    @State private var gateWidth: Double = 0
    @State private var ceremony: CeremonyRank?
    @State private var decidedIndex: Int?

    var body: some View {
        let report = Journey.report(history.entries, rules: rules)
        let earned = Set(Journey.earned(history.entries, rules: rules).map(\.id))
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    hero(report)
                    Text(report.rank.label)
                        .font(.title3.weight(.semibold))
                    Text("\u{201C}\(report.rank.title)\u{201D}")
                        .foregroundStyle(Tokens.textDim)
                    Text(JourneyCopy.level(report.level))
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(Tokens.brand)
                }
                .padding(.vertical, 8)
                .accessibilityElement(children: .combine)
                NavigationLink {
                    ShareCardScreen(history: history, rules: rules)
                } label: {
                    Text(ShareCardCopy.row)
                        .foregroundStyle(Tokens.brand)
                        .frame(minHeight: 44)
                }
            }
            .listRowBackground(Tokens.panel)

            Section {
                RoadStrip(picture: art.road, words: report.totals.words, place: road(report))
                    .listRowInsets(EdgeInsets())
                if let words = report.words, let days = report.activeDays {
                    Gate(text: JourneyCopy.words(words), pct: words.pct, picture: art.words, height: JourneyArt.wordsHeight)
                        .onGeometryChange(for: Double.self) { $0.size.width } action: { gateWidth = $0 }
                    Gate(text: JourneyCopy.days(days), pct: days.pct, picture: art.tallies, height: JourneyArt.talliesHeight)
                    Text(JourneyCopy.bothGates)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                } else {
                    Text(JourneyCopy.top)
                }
            } header: {
                SectionTitle(report.next.map { "\(JourneyCopy.toward) \($0.label)" } ?? JourneyCopy.road)
            } footer: {
                Text(JourneyCopy.roadNote).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Stamps(achievements: rules.achievements.achievements, earned: earned, pictures: art.stamps)
                    .padding(.vertical, 8)
            } header: {
                SectionTitle(JourneyCopy.achievements)
            }
            .listRowBackground(Tokens.panel)

            Section {
                if report.promotions.isEmpty {
                    Text(JourneyCopy.firstBelt(report.next))
                        .foregroundStyle(Tokens.textDim)
                } else {
                    ForEach(report.promotions.reversed(), id: \.id) { promotion in
                        let rank = rules.ranks.ranks.first { $0.id == promotion.id }
                        LabeledContent(rank?.label ?? promotion.id, value: JourneyCopy.promoted(Date(timeIntervalSince1970: TimeInterval(promotion.at) / 1000)))
                    }
                }
            } header: {
                SectionTitle(JourneyCopy.promotions)
            } footer: {
                Text(JourneyCopy.devices).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(JourneyCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: art.painted)
        // What to celebrate depends only on how high practice stands, never
        // on the layout, so a width arriving can never restart it.
        .task(id: report.practice.index) {
            decide(report)
            await tape.prepare(scale: scale)
            if ceremony == nil { await tape.play(reduceMotion: reduceMotion) }
        }
        .task(id: PaintKey(standing: Journey.standing(report), earned: earned, gateWidth: gateWidth, scale: scale)) {
            await art.paint(report, rules: rules, earned: earned, gateWidth: gateWidth, scale: scale)
        }
        // Once the ceremony closes, the new stripe's tape drops (it waits if
        // its frames are still painting, and plays when they land).
        .task(id: ceremony == nil) {
            if ceremony == nil { await tape.play(reduceMotion: reduceMotion) }
        }
        .fullScreenCover(item: $ceremony) { shown in
            CeremonyView(rank: shown.rank) { withoutAnimation { ceremony = nil } }
                .presentationBackground(.clear)
        }
    }

    /// The belt, painted, or mid tape drop; plain until the painting lands,
    /// and while a new stripe's frames are painting, so the finished belt
    /// never shows before its tape drops.
    @ViewBuilder private func hero(_ report: ProgressReport) -> some View {
        let size = JourneyArt.beltSize
        if let frame = tape.frame {
            Image(uiImage: frame).resizable().frame(width: size.width, height: size.height)
        } else if !tape.waiting, let belt = art.belt {
            Image(uiImage: belt).resizable().frame(width: size.width, height: size.height)
        } else {
            BeltSwatch(rank: report.rank, rules: rules)
                .frame(width: 168, height: 18)
                .frame(height: size.height, alignment: .leading)
        }
    }

    /// Your place on the road, counting the ranks after the starting none.
    private func road(_ report: ProgressReport) -> (place: Int, count: Int) {
        let road = rules.ranks.ranks.filter { $0.id != "none" && $0.founderOnly != true }
        return ((road.firstIndex { $0.id == report.practice.rank.id } ?? -1) + 1, road.count)
    }

    /// What to celebrate, decided when the Journey opens and again when
    /// practice climbs while it is open, as desktop decides it. How high you
    /// have climbed is remembered either way, so nothing below replays.
    private func decide(_ report: ProgressReport) {
        guard decidedIndex.map({ report.practice.index > $0 }) ?? true else { return }
        decidedIndex = report.practice.index
        let celebration = Journey.celebrate(report, rules: rules, memory: memory, now: .now)
        // With Reduce Motion the new stripe is simply on the belt.
        if let stripe = celebration.tape, !reduceMotion { tape.expect(stripe) }
        if let belt = celebration.ceremony { withoutAnimation { ceremony = CeremonyRank(rank: belt) } }
    }

    private func withoutAnimation(_ change: () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction, change)
    }
}

/// The new belt the ceremony is for.
struct CeremonyRank: Identifiable {
    let rank: RankSpec
    var id: String { rank.id }
}

/// What the paintings depend on: a change repaints.
private struct PaintKey: Hashable {
    let standing: JourneyStanding
    let earned: Set<String>
    let gateWidth: Double
    let scale: CGFloat
}

/// The road, at desktop's own size, scrolled to where you stand: the
/// painting, the belt names under it, and your words over your spot.
private struct RoadStrip: View {
    let picture: JourneyPicture?
    let words: Int
    let place: (place: Int, count: Int)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .topLeading) {
                    if let picture {
                        Image(uiImage: picture.image)
                            .resizable()
                            .frame(width: 1500, height: 120)
                        ForEach(picture.groups, id: \.name) { group in
                            Text(group.name)
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(Tokens.textDim)
                                .fixedSize()
                                .offset(x: group.x, y: 88)
                        }
                        if let you = picture.you {
                            Text(JourneyCopy.youWords(words))
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(Tokens.brand)
                                .fixedSize()
                                .frame(width: 200)
                                // Near either end it stays on the road, as desktop's does.
                                .offset(x: min(max(you - 100, 0), 1300), y: 28)
                            // The scroll target sits at your spot by layout; an
                            // offset would only move its drawing.
                            HStack(spacing: 0) {
                                Color.clear.frame(width: max(0, you - 0.5), height: 1)
                                Color.clear.frame(width: 1, height: 1).id("you")
                            }
                        }
                    }
                }
                .frame(width: 1500, height: 120, alignment: .topLeading)
            }
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            .onChange(of: picture?.you, initial: true) { _, you in
                if you != nil { proxy.scrollTo("you", anchor: .center) }
            }
        }
        .frame(height: 120)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(JourneyCopy.road)
        .accessibilityValue(JourneyCopy.roadPlace(place.place, of: place.count))
    }
}

/// One gate: its numbers over the painted stroke or tallies, or a quiet
/// bar until the painting lands.
private struct Gate: View {
    let text: String
    let pct: Double
    let picture: UIImage?
    let height: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text)
            if let picture {
                Image(uiImage: picture)
                    .resizable()
                    .frame(height: height)
                    .accessibilityHidden(true)
            } else {
                ProgressView(value: pct)
                    .tint(pct >= 1 ? Tokens.brand : Tokens.textDim)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// The achievements as ink stamps: earned ones in ink, the rest as dashed
/// rings with what earns them.
struct Stamps: View {
    let achievements: [AchievementSpec]
    let earned: Set<String>
    let pictures: [String: UIImage]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 12, alignment: .top)], spacing: 16) {
            ForEach(achievements, id: \.id) { spec in
                let got = earned.contains(spec.id)
                VStack(spacing: 6) {
                    if let picture = pictures[spec.id] {
                        Image(uiImage: picture)
                            .resizable()
                            .frame(width: JourneyArt.stampSize, height: JourneyArt.stampSize)
                    } else {
                        Circle()
                            .strokeBorder(Tokens.textDim.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [3, 4]))
                            .frame(width: JourneyArt.stampSize, height: JourneyArt.stampSize)
                    }
                    Text(spec.name)
                        .font(.footnote)
                        .foregroundStyle(got ? Tokens.text : Tokens.textDim)
                    if !got {
                        Text(spec.hint)
                            .font(.caption2)
                            .foregroundStyle(Tokens.textDim)
                    }
                }
                .multilineTextAlignment(.center)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(JourneyCopy.stamp(spec.name, earned: got, hint: spec.hint))
            }
        }
    }
}

/// Where a belt's rank bar and tape go, as desktop's painter lays them out
/// (journeyPaint.ts): the bar from 70 to 86 percent of the belt's length,
/// none on coral or red belts (or no belt), and up to four tapes, six
/// degrees on a black belt, spaced to fit inside the bar. All in fractions
/// of the length.
struct BeltLayout: Equatable {
    static let barStart = 0.7
    static let barEnd = 0.86

    let bar: ClosedRange<Double>?
    let tapes: [Double]
    let tapeWidth: Double

    static func of(belt: String, stripes: Int) -> BeltLayout {
        guard belt != "none", belt != "red", !belt.hasPrefix("coral") else { return BeltLayout(bar: nil, tapes: [], tapeWidth: 0) }
        let cap = belt == "black" ? 6 : 4
        let space = (barEnd - barStart) / Double(cap + 1)
        let tapes = (0..<min(max(stripes, 0), cap)).map { barStart + space * Double($0 + 1) }
        return BeltLayout(bar: barStart...barEnd, tapes: tapes, tapeWidth: space * 0.5)
    }
}

/// A belt drawn plainly, as desktop lays it out: the fabric, the rank bar
/// (red on a black belt, none on coral or red belts), and a strip of cream
/// tape per stripe.
struct BeltSwatch: View {
    let rank: RankSpec
    let rules: JourneyRules

    var body: some View {
        let layout = BeltLayout.of(belt: rank.belt, stripes: rank.stripes)
        Canvas { context, size in
            let w = size.width
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(rules.fabric(rank.belt)))
            if let bar = layout.bar {
                let rect = CGRect(x: w * bar.lowerBound, y: 0, width: w * (bar.upperBound - bar.lowerBound), height: size.height)
                context.fill(Path(rect), with: .color(rank.belt == "black" ? rules.color("red") : Tokens.ink))
                for tape in layout.tapes {
                    let width = max(1, w * layout.tapeWidth)
                    context.fill(Path(CGRect(x: w * tape - width / 2, y: size.height * 0.15, width: width, height: size.height * 0.7)), with: .color(Tokens.text))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .overlay(RoundedRectangle(cornerRadius: 3).stroke(Tokens.panelEdge))
        .accessibilityHidden(true)
    }
}

/// Home's row into the Journey: the belt and where it stands.
struct JourneyRow: View {
    let history: History
    let rules: JourneyRules

    var body: some View {
        let report = Journey.report(history.entries, rules: rules)
        NavigationLink {
            JourneyScreen(history: history, rules: rules)
        } label: {
            HStack(spacing: 12) {
                BeltSwatch(rank: report.rank, rules: rules)
                    .frame(width: 72, height: 10)
                VStack(alignment: .leading, spacing: 2) {
                    Text(JourneyCopy.title)
                    Text(report.rank.label)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .frame(minHeight: 44)
        }
    }
}

#if DEBUG
/// A history in a scratch file with this many words a day, one take a day.
@MainActor private func previewHistory(_ name: String, words: [Int]) -> History {
    let store = HistoryStore(file: FileManager.default.temporaryDirectory.appending(path: "journey-preview-\(name).jsonl"))
    try? store.clear()
    let start = Date.now.addingTimeInterval(-Double(words.count) * 86_400)
    for (day, count) in words.enumerated() {
        try? store.append(HistoryEntry(at: start.addingTimeInterval(Double(day) * 86_400), durationMs: 60_000, words: Array(repeating: "word", count: count).joined(separator: " ")))
    }
    return History(store: store)
}

#Preview("No belt") {
    NavigationStack {
        if let rules = JourneyRules.live { JourneyScreen(history: previewHistory("none", words: []), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("White, two stripes") {
    NavigationStack {
        if let rules = JourneyRules.live { JourneyScreen(history: previewHistory("white2", words: [180, 900, 1500, 600, 2100, 1300, 800]), rules: rules) }
    }
    .preferredColorScheme(.dark)
}

#Preview("Belts on the Home row") {
    if let rules = JourneyRules.live {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(["white-4", "blue-2", "brown-4", "black", "black-6", "coral-7", "red-9"], id: \.self) { id in
                if let rank = rules.ranks.ranks.first(where: { $0.id == id }) {
                    HStack {
                        BeltSwatch(rank: rank, rules: rules).frame(width: 72, height: 10)
                        Text(rank.label).font(.footnote)
                    }
                }
            }
        }
        .padding()
        .background(Tokens.panel)
        .foregroundStyle(Tokens.text)
        .preferredColorScheme(.dark)
    }
}
#endif
