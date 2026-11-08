// SPDX-License-Identifier: GPL-3.0-only
// The belt share card (ios/prd.json IOS-021): desktop's card, painted from
// your last thirty days by desktop's own code in the painter page (a stroke
// for each day you dictated, longer for more words, heavier for more takes,
// ember on your three biggest), with your rank set in the display face. The
// screen takes your month once as it opens, as desktop's dialog does,
// paints the card once, and saves exactly that picture through the share
// sheet; nothing is sent anywhere.
import MurmurCore
import SwiftUI

/// What the card paints: the last thirty days and where practice stands.
struct ShareCard: Hashable, Sendable {
    let days: [DayTotal]
    let rank: String
    let label: String
    let level: Int

    /// The card for these takes, with `today` the last of its days.
    static func from(_ entries: [HistoryEntry], rules: JourneyRules, today: String = HistoryEntry.dayKey(.now)) -> ShareCard {
        let report = Journey.report(entries, rules: rules)
        let days = Analytics.dailyTotals(entries.map(\.rankEvent), count: Analytics.cardDays, today: today)
        return ShareCard(days: days, rank: report.rank.id, label: report.rank.label, level: report.level)
    }

    var artwork: JourneyArtwork { .share(days: days, rank: rank, level: level) }

    /// The month's words, as the card adds them.
    var words: Int { days.reduce(0) { $0 + $1.words } }

    /// Days with words, the card's days on the mat.
    var activeDays: Int { days.filter { $0.words > 0 }.count }
}

/// The share card's words.
enum ShareCardCopy {
    static let row = "Share card"
    static let title = "Your share card"
    static let about = "Painted from your last \(Analytics.cardDays) days: a stroke for each day you dictated, ember on your three biggest."
    static let save = "Save card"
    static let painting = "Painting your card"
    static let failed = "The card did not paint."
    static let tryAgain = "Try again"
    /// Desktop's file name for the belt card.
    static let fileName = "murmur-belt.png"

    /// What VoiceOver reads for the card: its words, which are part of the
    /// picture.
    static func spoken(_ card: ShareCard) -> String {
        let words = card.words.formatted(.number)
        let days = card.activeDays == 1 ? "1 day" : "\(card.activeDays) days"
        return "Share card: \(card.label), \(words) words in the last \(Analytics.cardDays) days, \(days) on the mat, level \(card.level)."
    }
}

/// The card as painted: the picture the screen shows and the PNG it saves,
/// the same bytes.
struct PaintedCard: Equatable {
    let image: UIImage
    let png: Data
}

/// The card's paint, for one month taken as the screen opens.
@Observable @MainActor final class ShareCardModel {
    enum Shown: Equatable {
        case painting
        case painted(PaintedCard)
        case failed
    }

    /// Desktop saves the card at twice its size: 1680 by 880.
    static let saveScale: CGFloat = 2

    let card: ShareCard
    private(set) var shown: Shown
    @ObservationIgnored private let painter: JourneyPainter

    init(card: ShareCard, painter: JourneyPainter = .shared, shown: Shown = .painting) {
        self.card = card
        self.painter = painter
        self.shown = shown
    }

    /// Paints the card once, at the size it saves at. A paint the screen
    /// walked away from (it closed, or Try again started another) never
    /// lands.
    func paint() async {
        shown = .painting
        do {
            let png = try await painter.png(card.artwork, scale: Self.saveScale)
            guard !Task.isCancelled else { return }
            guard let image = UIImage(data: png.data, scale: Self.saveScale) else {
                shown = .failed
                return
            }
            shown = .painted(PaintedCard(image: image, png: png.data))
        } catch {
            guard !Task.isCancelled else { return }
            shown = .failed
        }
    }
}

/// The painted card, as the share sheet takes it.
struct CardShare: Transferable {
    let name: String
    let png: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { $0.png }
            .suggestedFileName { $0.name }
    }
}

/// The card, shown large, with Save card. The month is taken as the screen
/// opens: a link's destination is made whenever the Journey draws, and a
/// take landing while the card is open never repaints it under the share
/// sheet.
struct ShareCardScreen: View {
    let history: History
    let rules: JourneyRules
    @State private var model: ShareCardModel?

    var body: some View {
        Group {
            if let model {
                ShareCardContent(model: model)
            } else {
                Tokens.ink.ignoresSafeArea()
            }
        }
        .navigationTitle(ShareCardCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil { model = ShareCardModel(card: ShareCard.from(history.entries, rules: rules)) }
        }
    }
}

/// The card, its line, and Save card or Try again.
struct ShareCardContent: View {
    let model: ShareCardModel
    /// False keeps the model's state as given, for previews.
    var paints = true
    @State private var attempt = 0

    /// The card's size in points, desktop's.
    static let size = CGSize(width: 840, height: 440)

    var body: some View {
        List {
            Section {
                preview
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                Text(ShareCardCopy.about)
                    .foregroundStyle(Tokens.textDim)
                switch model.shown {
                case let .painted(card):
                    ShareLink(item: CardShare(name: ShareCardCopy.fileName, png: card.png), preview: SharePreview(ShareCardCopy.title, image: Image(uiImage: card.image))) {
                        Text(ShareCardCopy.save)
                            .foregroundStyle(Tokens.brand)
                            .frame(minHeight: 44)
                    }
                case .failed:
                    Text(ShareCardCopy.failed)
                        .foregroundStyle(Tokens.red)
                    Button(ShareCardCopy.tryAgain) { attempt += 1 }
                        .buttonStyle(RowAction())
                        .frame(minHeight: 44)
                case .painting:
                    EmptyView()
                }
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .task(id: attempt) {
            if paints { await model.paint() }
        }
    }

    @ViewBuilder private var preview: some View {
        let ratio = Self.size.width / Self.size.height
        if case let .painted(card) = model.shown {
            Image(uiImage: card.image)
                .resizable()
                .aspectRatio(ratio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityLabel(ShareCardCopy.spoken(model.card))
                .accessibilityAddTraits(.isImage)
        } else {
            RoundedRectangle(cornerRadius: 10)
                .fill(Tokens.panelLift)
                .aspectRatio(ratio, contentMode: .fit)
                .overlay {
                    if model.shown == .painting {
                        Text(ShareCardCopy.painting)
                            .font(.footnote)
                            .foregroundStyle(Tokens.textDim)
                            .padding()
                    }
                }
                .accessibilityHidden(model.shown != .painting)
        }
    }
}

#if DEBUG
private let previewCard = ShareCard(
    days: (0..<30).map { DayTotal(day: Paintings.shiftDay("2026-10-13", $0 - 29), words: $0 % 3 == 0 ? 0 : 80 + $0 * 37, sessions: $0 % 3 == 0 ? 0 : 1 + $0 % 4) },
    rank: "blue-2",
    label: "blue belt, two stripes",
    level: 3
)

#Preview("Painted") {
    NavigationStack { ShareCardContent(model: ShareCardModel(card: previewCard)) }.preferredColorScheme(.dark)
}

#Preview("Painting") {
    NavigationStack { ShareCardContent(model: ShareCardModel(card: previewCard), paints: false) }.preferredColorScheme(.dark)
}

#Preview("Failed") {
    NavigationStack { ShareCardContent(model: ShareCardModel(card: previewCard, shown: .failed), paints: false) }.preferredColorScheme(.dark)
}
#endif
