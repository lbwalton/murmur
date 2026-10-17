// SPDX-License-Identifier: GPL-3.0-only
// The Cleanup screen (ios/prd.json IOS-007): how much murmur tidies your
// words, each setting with one plain line on what it does. Polish, smart
// lists, and numbers only act at Full, so they show there.
import MurmurCore
import SwiftUI

struct CleanupScreen: View {
    @State var model: CleanupModel

    var body: some View {
        Form {
            Section {
                Picker("Cleanup level", selection: $model.level) {
                    ForEach([FormatOptions.Level.off, .light, .full], id: \.self) { level in
                        Text(CleanupCopy.name(level)).tag(level)
                    }
                }
                .pickerStyle(.segmented)
            } header: {
                SectionTitle("Cleanup level")
            } footer: {
                Text(CleanupCopy.level(model.level)).foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            if model.level == .full {
                Section {
                    Toggle("Polish", isOn: $model.polish)
                } footer: {
                    Text(CleanupCopy.polish(model: model.polishModel)).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)

                Section {
                    Toggle("Smart lists", isOn: $model.smartLists)
                } footer: {
                    Text(CleanupCopy.smartLists).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)

                Section {
                    Picker("Numbers", selection: $model.numbers) {
                        ForEach([FormatOptions.Numbers.auto, .digits, .words], id: \.self) { numbers in
                            Text(CleanupCopy.name(numbers)).tag(numbers)
                        }
                    }
                    .pickerStyle(.navigationLink)
                } footer: {
                    Text(CleanupCopy.numbers(model.numbers)).foregroundStyle(Tokens.textDim)
                }
                .listRowBackground(Tokens.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Cleanup")
        .navigationBarTitleDisplayMode(.inline)
    }
}

extension CleanupModel {
    /// The real screen: saved settings, and the cleanup model the Provider
    /// screen chose.
    static func live() -> CleanupModel {
        let model = (try? BundledRules.catalog()).map { ConnectionStore().load(catalog: $0).cleanupModel } ?? ""
        return CleanupModel(store: CleanupStore(), polishModel: model)
    }
}

/// Opens the Cleanup screen with its model built once.
struct CleanupRoute: View {
    var make: @MainActor () -> CleanupModel = { CleanupModel.live() }
    @State private var model: CleanupModel?

    var body: some View {
        Group {
            if let model {
                CleanupScreen(model: model)
            } else {
                // The ground until the model is built: a Group with nothing in
                // it never runs its task, and the screen would stay blank.
                Tokens.ink.ignoresSafeArea()
            }
        }
        .task {
            if model == nil { model = make() }
        }
    }
}

#if DEBUG
#Preview("Full") { CleanupPreview(CleanupSettings()) }
#Preview("Light") { CleanupPreview(CleanupSettings(level: .light)) }
#Preview("Full, lists and digits") { CleanupPreview(CleanupSettings(numbers: .digits, smartLists: true, polish: false)) }

/// The Cleanup screen over its own scratch settings.
struct CleanupPreview: View {
    let settings: CleanupSettings

    init(_ settings: CleanupSettings) { self.settings = settings }

    var body: some View {
        NavigationStack { CleanupScreen(model: Self.model(settings)) }
            .preferredColorScheme(.dark)
    }

    static func model(_ settings: CleanupSettings) -> CleanupModel {
        let store = CleanupStore(defaults: UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)") ?? .standard)
        store.save(settings)
        return CleanupModel(store: store, polishModel: "openai/gpt-oss-120b")
    }
}
#endif
