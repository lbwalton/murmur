// SPDX-License-Identifier: GPL-3.0-only
// The Look screen (ios/prd.json IOS-020): every waveform style as a live
// mini pill and every accent, as desktop's Look section shows them. Locked
// ones stay visible, dimmed, with the belt or the moment that earns them,
// so the screen also shows the path through the Journey. A choice is
// written to the app group, where the keyboard reads it by the next take.
import MurmurCore
import SwiftUI

/// The choices and what this iPhone's takes have unlocked.
@Observable @MainActor final class LookModel {
    private(set) var look: PillLook
    private(set) var standing: LookStanding?
    @ObservationIgnored private let rules: LookRules?
    @ObservationIgnored private let takes: @MainActor () -> [HistoryEntry]
    @ObservationIgnored private let file: URL?

    /// `takes` reads the takes kept now, each time the model looks.
    init(takes: @escaping @MainActor () -> [HistoryEntry], rules: LookRules? = .live, file: URL? = PillLook.file) {
        self.rules = rules
        self.takes = takes
        self.file = file
        look = PillLook.read(from: file)
        refresh()
    }

    /// What the takes unlock now, and the look as they paint it, written
    /// if the file lags: as the Look opens, when murmur comes back to the
    /// front, and before every pick, so a belt earned while the screen sat
    /// open counts and a pick never writes an old color back.
    func refresh() {
        standing = rules?.standing(takes())
        let read = PillLook.read(from: file)
        look = standing?.resolved(read) ?? read
        if look != read { look.write(to: file) }
    }

    /// The styles this build draws, in shared/cosmetics.json's order.
    var styles: [(item: CosmeticItem, style: PillStyle)] {
        (standing?.rules.cosmetics.overlayStyles ?? []).compactMap { item in
            PillStyle(rawValue: item.id).map { (item, $0) }
        }
    }

    var accents: [CosmeticItem] {
        standing?.rules.cosmetics.accents ?? []
    }

    func unlocked(_ item: CosmeticItem) -> Bool {
        standing?.unlocked(item) ?? (item.unlock == nil)
    }

    /// The paint the pill draws with now.
    var palette: PillPalette { look.palette }

    func choose(_ style: PillStyle, item: CosmeticItem) {
        refresh()
        guard unlocked(item), style != look.style else { return }
        look.style = style
        save()
    }

    func choose(accent item: CosmeticItem) {
        refresh()
        guard unlocked(item), item.id != look.accent else { return }
        look.accent = item.id
        save()
    }

    private func save() {
        if let standing { look = standing.resolved(look) }
        look.write(to: file)
    }
}

/// The Look, built as it opens: a link's destination is made whenever the
/// screen that links here draws, so the model waits for the Look itself.
struct LookRoute: View {
    @State private var model: LookModel?

    var body: some View {
        Group {
            if let model {
                LookScreen(model: model)
            } else {
                Tokens.ink.ignoresSafeArea()
                    .navigationTitle("Look")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .onAppear {
            if let model {
                model.refresh()
            } else {
                model = LookModel { History.live().entries }
            }
        }
    }
}

struct LookScreen: View {
    let model: LookModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Two tiles a row; one at the accessibility text sizes, so no tile's
    /// words are cut short.
    static func columns(for size: DynamicTypeSize) -> [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 12), count: size.isAccessibilitySize ? 1 : 2)
    }

    var body: some View {
        Form {
            Section {
                LazyVGrid(columns: Self.columns(for: typeSize), spacing: 12) {
                    ForEach(model.styles, id: \.item.id) { entry in
                        StyleTile(
                            item: entry.item,
                            style: entry.style,
                            palette: model.palette,
                            inUse: model.look.style == entry.style,
                            unlocked: model.unlocked(entry.item)
                        ) {
                            model.choose(entry.style, item: entry.item)
                        }
                    }
                }
                .padding(.vertical, 6)
            } header: {
                SectionTitle("Waveform")
            } footer: {
                Text(LookCopy.waveFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                ForEach(model.accents) { item in
                    AccentRow(
                        item: item,
                        swatch: model.standing?.swatch(item),
                        chosen: model.look.accent == item.id,
                        unlocked: model.unlocked(item)
                    ) {
                        model.choose(accent: item)
                    }
                }
            } header: {
                SectionTitle("Accent")
            } footer: {
                Text(LookCopy.accentFooter).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Look")
        .navigationBarTitleDisplayMode(.inline)
        // Takes dictated in other apps may have earned something meanwhile.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refresh() }
        }
    }
}

/// One style, live: the real pill moving to a made-up voice, in the accent.
struct StyleTile: View {
    let item: CosmeticItem
    let style: PillStyle
    let palette: PillPalette
    let inUse: Bool
    let unlocked: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 8) {
                PillCanvas(style: style, stage: .recording, level: DemoVoice.level, palette: palette)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(height: 44)
                    .background(Capsule().fill(Tokens.panelLift))
                    .opacity(unlocked ? 1 : 0.4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LookCopy.name(item))
                        .font(.subheadline.weight(inUse ? .semibold : .regular))
                        .foregroundStyle(inUse ? Tokens.brand : unlocked ? Tokens.text : Tokens.textDim)
                    Text(LookCopy.status(item, inUse: inUse, unlocked: unlocked))
                        .font(.footnote)
                        .foregroundStyle(Tokens.textDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 4)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 14).stroke(inUse ? Tokens.brand : Tokens.panelEdge, lineWidth: inUse ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LookCopy.name(item))
        .accessibilityValue(LookCopy.styleValue(item, inUse: inUse, unlocked: unlocked))
        .accessibilityAddTraits(inUse ? [.isButton, .isSelected] : .isButton)
    }
}

/// One accent: its swatch, its name, and what earns it while locked.
struct AccentRow: View {
    let item: CosmeticItem
    let swatch: String?
    let chosen: Bool
    let unlocked: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            HStack(spacing: 12) {
                Circle()
                    .fill(swatch.flatMap(RGBA.init(hex:)).map(Color.init(rgba:)) ?? Tokens.amber)
                    .frame(width: 20, height: 20)
                    .overlay(Circle().stroke(Tokens.panelEdge, lineWidth: 1))
                    .opacity(unlocked ? 1 : 0.4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(LookCopy.name(item))
                        .foregroundStyle(unlocked ? Tokens.text : Tokens.textDim)
                    if !unlocked {
                        Text(LookCopy.sentence(item.hint))
                            .font(.footnote)
                            .foregroundStyle(Tokens.textDim)
                    }
                }
                Spacer(minLength: 8)
                if chosen {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Tokens.brand)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(LookCopy.name(item))
        .accessibilityValue(LookCopy.accentValue(item, unlocked: unlocked))
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    }
}

extension Color {
    /// A color the shared data names, mixed as the pill mixes it.
    init(rgba: RGBA) {
        self.init(uiColor: UIColor(cgColor: rgba.cgColor))
    }
}

#if DEBUG
#Preview {
    NavigationStack { LookRoute() }.preferredColorScheme(.dark)
}
#endif
