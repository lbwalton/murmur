// SPDX-License-Identifier: GPL-3.0-only
// The promotion ceremony (ios/prd.json IOS-018), as desktop holds it: one
// big stroke in the new belt's color, splatter, and the rank set large.
// The painting runs in the painter page on screen (the Journey's own,
// already started); the rank, its title, and what earned it are native
// text over it. A tap anywhere, or VoiceOver's escape, continues; without
// VoiceOver it also closes on its own desktop's 4.6 seconds after the
// painting starts. Reduce Motion shows the finished painting at once.
import MurmurCore
import SwiftUI
import WebKit

/// The page's web view, as a view.
private struct Stage: UIViewRepresentable {
    let painter: JourneyPainter

    func makeUIView(context: Context) -> WKWebView { painter.web }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct CeremonyView: View {
    static let duration = 4.6
    static let textDelay = 0.48

    let rank: RankSpec
    let painter: JourneyPainter
    let duration: Double
    let close: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var painted = false
    /// The painting has started (or could not): the clock runs from here.
    @State private var started = false
    @State private var shown = false
    @ScaledMetric(relativeTo: .largeTitle) private var rankSize = 48

    init(rank: RankSpec, painter: JourneyPainter = .shared, duration: Double = CeremonyView.duration, close: @escaping () -> Void) {
        self.rank = rank
        self.painter = painter
        self.duration = duration
        self.close = close
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .top) {
                // The page needs no touches: a tap anywhere reaches the
                // ceremony's own close.
                Stage(painter: painter)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                VStack(spacing: 14) {
                    Text(rank.label)
                        .font(.system(size: rankSize, weight: .heavy).width(.condensed))
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.6)
                    Text("\u{201C}\(rank.title)\u{201D}")
                        .font(.title3.italic())
                        .foregroundStyle(Tokens.textDim)
                    if let earned = JourneyCopy.earnedWith(rank) {
                        Text(earned)
                            .font(.system(.footnote, design: .monospaced))
                    }
                    Text(JourneyCopy.continueHint)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(Tokens.textDim)
                        .padding(.top, 14)
                }
                .padding(.horizontal, 16)
                .padding(.top, geometry.size.height * 0.54)
                .opacity(shown ? 1 : 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(Tokens.text)
            .contentShape(Rectangle())
            .onTapGesture(perform: close)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(.escape, close)
            .accessibilityAction(named: JourneyCopy.continueHint, close)
            // The page fills the whole screen, so it paints at that size.
            .task(id: Self.screen(geometry)) {
                await paint(Self.screen(geometry))
            }
        }
        .background(Tokens.ink.opacity(0.95))
        .task {
            if reduceMotion {
                shown = true
                return
            }
            do {
                try await Task.sleep(for: .seconds(Self.textDelay))
            } catch {
                return
            }
            withAnimation(.easeOut(duration: 0.4)) { shown = true }
        }
        .task(id: started) {
            guard started, !voiceOver else { return }
            do {
                try await Task.sleep(for: .seconds(duration))
            } catch {
                return
            }
            close()
        }
    }

    /// The whole screen: the safe area and the insets around it.
    static func screen(_ geometry: GeometryProxy) -> CGSize {
        let insets = geometry.safeAreaInsets
        return CGSize(width: geometry.size.width + insets.leading + insets.trailing, height: geometry.size.height + insets.top + insets.bottom)
    }

    /// Paints once the size is known: the stroke goes on the first time,
    /// and a new size repaints the finished picture, as desktop does. The
    /// clock starts once the painting has (or once it could not).
    private func paint(_ size: CGSize) async {
        guard size.width > 0, size.height > 0 else { return }
        let finished = reduceMotion || painted
        painted = true
        try? await painter.ceremony(rank: rank.id, size: size, reduced: finished)
        started = true
    }
}
