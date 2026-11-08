// SPDX-License-Identifier: GPL-3.0-only
// A painting a day on iPhone (ios/prd.json IOS-019), as desktop's wrap-up
// shows it: every take adds the next stroke of the day's painting, the
// newest painting itself in; the seal stamps in with the stroke that
// finishes it, in the color of the belt it was painted at, with the light
// of the hours it was painted in. Earlier days wait in a strip, each
// opening large. Save card and Save the week go through the share sheet.
// The paintings come from desktop's own painter (JourneyPainter); every
// word here is a native view.
import MurmurCore
import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// What the painting screens say.
enum PaintingCopy {
    static let title = "Today's painting"
    static let past = "Your paintings"
    static let saveCard = "Save card"
    static let saveWeek = "Save the week"
    static let firstTake = "Your first take today starts today's painting."
    static let kept = "Kept as it stood that day."
    static let fromHere = " Every take from here adds to it."

    static func toFinish(_ left: Int) -> String {
        "Every take adds the next stroke. \(left) more to finish it."
    }

    /// The line under today's painting, as desktop's wrap-up words it.
    static func line(_ record: PaintingRecord, longestMs: Int?) -> String {
        let (done, finished) = Paintings.progress(record)
        guard finished else { return toFinish(record.target - done) }
        return Paintings.line(record.words, longestMs: longestMs) + (done < record.target + Paintings.maxExtra ? fromHere : "")
    }

    /// An earlier day's name in the strip: its weekday within the last
    /// week, its date before that, so two Mondays never look alike.
    static func stripDay(_ day: String, today: String) -> String {
        guard let date = PaintingDays.date(day) else { return day }
        let recent = day >= Paintings.shiftDay(today, -6)
        return recent ? date.formatted(.dateTime.weekday(.abbreviated)) : date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// An earlier day's caption in the strip: its subject once finished.
    static func stripCaption(_ record: PaintingRecord) -> String {
        let (done, finished) = Paintings.progress(record)
        return finished ? record.subject.name : "\(done) of \(record.target)"
    }

    static func longDate(_ day: String) -> String {
        PaintingDays.date(day)?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? day
    }

    static func cardName(_ day: String) -> String { "murmur-day-\(day).png" }
    static func weekName(_ day: String) -> String { "murmur-week-\(day).png" }
}

/// Day keys as dates, in this phone's own calendar day.
enum PaintingDays {
    static func date(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar(identifier: .gregorian).date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func today() -> String { HistoryEntry.dayKey(.now) }

    /// The strip: up to six earlier days from the four weeks before today,
    /// as desktop's window shows them.
    static func strip(_ book: PaintingBook, today: String) -> [String] {
        let since = Paintings.shiftDay(today, -28)
        return Array(book.keys.filter { $0 < today && $0 >= since }.sorted().suffix(6))
    }
}

/// The strokes the screen last showed for a day, kept across launches as
/// desktop keeps it: the newest stroke paints itself in only when it is
/// new since then, and the seal stamps in when the painting finished since.
struct PaintingSeen {
    static let key = "murmur-painting-seen"
    let defaults: UserDefaults

    /// Whether this showing is fresh, and the strokes done when last seen today.
    func look(day: String, done: Int) -> (fresh: Bool, doneBefore: Int) {
        let before = defaults.string(forKey: Self.key)
        let now = "\(day)|\(done)"
        let doneBefore = before.flatMap { $0.hasPrefix("\(day)|") ? Int($0.dropFirst(day.count + 1)) : nil } ?? 0
        return (before != now, doneBefore)
    }

    func remember(day: String, done: Int) {
        defaults.set("\(day)|\(done)", forKey: Self.key)
    }
}

/// A picture the share sheet saves: a day's card or the week's scroll,
/// painted when the person picks where it goes.
struct PaintingShare: Transferable {
    let name: String
    let artwork: JourneyArtwork

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { share in
            try await share.png()
        }
        .suggestedFileName { $0.name }
    }

    /// Desktop saves its cards at twice their size: 1080 by 1350, and the
    /// week at 3968 by 864.
    @MainActor func png() async throws -> Data {
        try await JourneyPainter.shared.png(artwork, scale: 2).data
    }
}

/// The page's web view, as a view, for today's live painting.
private struct PaintingStage: UIViewRepresentable {
    let painter: JourneyPainter

    func makeUIView(context: Context) -> WKWebView { painter.web }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// Home's row into the painting: today's painting small and how far it got.
struct PaintingRow: View {
    let store: PaintingStore
    let history: History
    @Environment(\.displayScale) private var scale
    @State private var thumbnail: UIImage?

    var body: some View {
        let today = PaintingDays.today()
        let record = store.book[today]
        NavigationLink {
            PaintingScreen(store: store, longestMs: Self.longest(history.entries, day: today))
        } label: {
            HStack(spacing: 12) {
                Group {
                    if let thumbnail, record != nil {
                        Image(uiImage: thumbnail).resizable()
                    } else {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(Tokens.panelEdge)
                    }
                }
                .frame(width: 72, height: 54)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(PaintingCopy.title)
                    Text(record.map { Paintings.caption($0.subject, done: Paintings.progress($0).done, target: $0.target) } ?? PaintingCopy.firstTake)
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .frame(minHeight: 44)
        }
        .task(id: record) {
            guard let record else { return }
            thumbnail = try? await JourneyPainter.shared.picture(.painting(record, width: 72, height: 54), scale: scale).image
        }
    }

    /// The day's longest take, for the finished painting's line.
    static func longest(_ entries: [HistoryEntry], day: String) -> Int? {
        entries.filter { ($0.day ?? HistoryEntry.dayKey($0.at)) == day }.map(\.durationMs).max()
    }
}

struct PaintingScreen: View {
    let store: PaintingStore
    var seen = PaintingSeen(defaults: .standard)
    /// The day's longest take, for the finished painting's line.
    var longestMs: Int?

    @Environment(\.displayScale) private var scale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: Double = 0
    @State private var strip: [String: UIImage] = [:]
    @State private var viewing: ViewedDay?

    var body: some View {
        let today = PaintingDays.today()
        let record = store.book[today]
        let past = PaintingDays.strip(store.book, today: today)
        let week = Paintings.weekOf(today).filter { store.book[$0] != nil }.count
        List {
            Section {
                if let record {
                    let (done, _) = Paintings.progress(record)
                    PaintingStage(painter: JourneyPainter.shared)
                        .allowsHitTesting(false)
                        .frame(height: width * 0.75)
                        .accessibilityHidden(true)
                        .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                        .task(id: LiveKey(record: record, width: width)) {
                            await paintLive(record, day: today)
                        }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Paintings.caption(record.subject, done: done, target: record.target))
                            .font(.headline)
                        Text(PaintingCopy.line(record, longestMs: longestMs))
                            .foregroundStyle(Tokens.textDim)
                    }
                    .accessibilityElement(children: .combine)
                    ShareLink(item: PaintingShare(name: PaintingCopy.cardName(today), artwork: .card(day: today, record: record, longestMs: longestMs)), preview: SharePreview(PaintingCopy.title)) {
                        Text(PaintingCopy.saveCard)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                } else {
                    Text(PaintingCopy.firstTake)
                        .foregroundStyle(Tokens.textDim)
                }
            }
            .listRowBackground(Tokens.panel)

            if !past.isEmpty {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(past, id: \.self) { day in
                                if let kept = store.book[day] {
                                    PastPainting(day: day, today: today, record: kept, image: strip[day]) {
                                        viewing = ViewedDay(day: day, record: kept)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    }
                    if week >= 2 {
                        ShareLink(item: PaintingShare(name: PaintingCopy.weekName(today), artwork: .week(last: today, book: store.book)), preview: SharePreview(PaintingCopy.saveWeek)) {
                            Text(PaintingCopy.saveWeek)
                                .foregroundStyle(Tokens.brand)
                                .frame(minHeight: 44)
                        }
                    }
                } header: {
                    SectionTitle(PaintingCopy.past)
                }
                .listRowBackground(Tokens.panel)
                .task(id: past.map { store.book[$0] }) {
                    for day in past {
                        guard let kept = store.book[day] else { continue }
                        if let image = try? await JourneyPainter.shared.picture(.painting(kept, width: 120, height: 90), scale: scale).image {
                            strip[day] = image
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .navigationTitle(PaintingCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $viewing) { shown in
            PaintingViewer(day: shown.day, record: shown.record)
        }
    }

    /// Paints today's painting on the stage, the newest stroke painting in
    /// when it is new since the last look, and remembers this look.
    private func paintLive(_ record: PaintingRecord, day: String) async {
        guard width > 0 else { return }
        let (done, _) = Paintings.progress(record)
        let look = seen.look(day: day, done: done)
        do {
            try await JourneyPainter.shared.live(record, size: CGSize(width: width, height: width * 0.75), fresh: look.fresh, doneBefore: look.doneBefore, reduced: reduceMotion)
            seen.remember(day: day, done: done)
        } catch {
            return
        }
    }
}

/// What the live painting depends on: a change repaints it.
private struct LiveKey: Hashable {
    let record: PaintingRecord
    let width: Double
}

/// An earlier day opened large.
struct ViewedDay: Identifiable {
    let day: String
    let record: PaintingRecord
    var id: String { day }
}

/// An earlier day's painting in the strip, still: a button that opens it.
private struct PastPainting: View {
    let day: String
    let today: String
    let record: PaintingRecord
    let image: UIImage?
    let open: () -> Void

    var body: some View {
        let (done, _) = Paintings.progress(record)
        Button(action: open) {
            VStack(alignment: .leading, spacing: 4) {
                Group {
                    if let image {
                        Image(uiImage: image).resizable()
                    } else {
                        RoundedRectangle(cornerRadius: 3).strokeBorder(Tokens.panelEdge)
                    }
                }
                .frame(width: 120, height: 90)
                Text(PaintingCopy.stripDay(day, today: today))
                    .font(.footnote.weight(.semibold))
                Text(PaintingCopy.stripCaption(record))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Tokens.textDim)
                    .lineLimit(2)
            }
            .frame(width: 120, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(PaintingCopy.stripDay(day, today: today)): \(Paintings.caption(record.subject, done: done, target: record.target))")
        .accessibilityHint("Opens it large")
    }
}

/// An earlier day's painting, large, with its own Save card.
struct PaintingViewer: View {
    let day: String
    let record: PaintingRecord
    @Environment(\.displayScale) private var scale
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var width: Double = 0

    var body: some View {
        let (done, finished) = Paintings.progress(record)
        NavigationStack {
            List {
                Section {
                    Group {
                        if let image {
                            Image(uiImage: image).resizable()
                        } else {
                            Color.clear
                        }
                    }
                    .frame(height: width * 0.75)
                    .accessibilityHidden(true)
                    .onGeometryChange(for: Double.self) { $0.size.width } action: { width = $0 }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Paintings.caption(record.subject, done: done, target: record.target))
                            .font(.headline)
                        Text(finished ? Paintings.line(record.words, longestMs: nil) : PaintingCopy.kept)
                            .foregroundStyle(Tokens.textDim)
                    }
                    .accessibilityElement(children: .combine)
                    ShareLink(item: PaintingShare(name: PaintingCopy.cardName(day), artwork: .card(day: day, record: record, longestMs: nil)), preview: SharePreview(PaintingCopy.longDate(day))) {
                        Text(PaintingCopy.saveCard)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                }
                .listRowBackground(Tokens.panel)
            }
            .scrollContentBackground(.hidden)
            .background(Tokens.ink)
            .foregroundStyle(Tokens.text)
            .navigationTitle(PaintingCopy.longDate(day))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Tokens.brand)
                }
            }
            .task(id: width) {
                guard width > 0 else { return }
                image = try? await JourneyPainter.shared.picture(.painting(record, width: width, height: width * 0.75), scale: scale).image
            }
        }
        .preferredColorScheme(.dark)
    }
}
