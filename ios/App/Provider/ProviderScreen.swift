// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen (ios/prd.json IOS-005): pick who turns your voice
// into text and who cleans it up, paste each key once, and test it. The
// presets come from shared/provider-catalog.json, Groq first; Custom
// takes any OpenAI-compatible https address.
import MurmurCore
import SwiftUI

struct ProviderScreen: View {
    @State var model: ProviderModel
    var pro: ProStore = .live()
    @State private var naming = false
    @State private var draft = ""

    var body: some View {
        Form {
            Section {
                presetPicker(role: .transcription)
                if model.transcriptionPreset == nil {
                    AddressField(url: $model.transcriptionAddress)
                }
                ModelField(
                    label: "Transcription model",
                    value: $model.sttModel,
                    options: model.transcriptionPreset?.sttModels.map(\.id) ?? []
                )
                KeySlotView(
                    slot: model.transcriptionKey,
                    provider: ProviderName.of(model.transcriptionPreset, baseUrl: model.settings.transcription.baseUrl),
                    keyPage: model.transcriptionPreset?.keyUrl.flatMap(URL.init(string:))
                )
            } header: {
                SectionTitle("Transcription")
            } footer: {
                Text("Turns what you say into text.").foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            Section {
                Picker("Cleanup runs on", selection: $model.separateCleanup) {
                    Text("Same as transcription").tag(false)
                    Text("Separate").tag(true)
                }
                .pickerStyle(.segmented)
                if model.settings.cleanup.separate {
                    presetPicker(role: .cleanup)
                    if model.cleanupPreset == nil {
                        AddressField(url: $model.cleanupAddress)
                    }
                }
                ModelField(
                    label: "Cleanup model",
                    value: $model.cleanupModel,
                    options: model.cleanupPreset?.llmModels.map(\.id) ?? []
                )
                if model.cleanupSharesKey {
                    Text("Uses your transcription key.")
                        .foregroundStyle(Tokens.textDim)
                } else {
                    KeySlotView(
                        slot: model.cleanupKey,
                        provider: ProviderName.of(model.cleanupPreset, baseUrl: model.settings.cleanup.baseUrl),
                        keyPage: model.cleanupPreset?.keyUrl.flatMap(URL.init(string:))
                    )
                }
            } header: {
                SectionTitle("Cleanup")
            } footer: {
                Text("Fixes punctuation and filler words after each take.").foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)

            profilesSection

            Section {
                Text("Your keys stay on this iPhone, in its Keychain. Only the murmur app can read them; the keyboard never can, and they never sync to another device.")
                    .font(.footnote)
                    .foregroundStyle(Tokens.textDim)
            }
            .listRowBackground(Tokens.panel)
        }
        .scrollContentBackground(.hidden)
        .background(Tokens.ink)
        .foregroundStyle(Tokens.text)
        .tint(Tokens.brand)
        .navigationTitle("Provider and key")
        .navigationBarTitleDisplayMode(.inline)
        // On the form, not a section, so one alert names the setup; Save
        // waits for a name.
        .alert(ProfileCopy.nameIt, isPresented: $naming) {
            TextField(ProfileCopy.name, text: $draft)
            Button(ProfileCopy.saveIt) {
                model.saveProfile(draft)
                draft = ""
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button(ProfileCopy.cancel, role: .cancel) { draft = "" }
        }
    }

    private func presetPicker(role: ProviderRole) -> some View {
        Picker("Provider", selection: role == .transcription ? $model.transcriptionChoice : $model.cleanupChoice) {
            ForEach(model.catalog.presets(for: role), id: \.id) { Text($0.name).tag($0.id) }
            Text("Custom").tag(ProviderModel.customChoice)
        }
    }
}

/// A section title in brand gold, sentence case.
struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Tokens.brand)
            .textCase(nil)
    }
}

/// A custom provider's base URL, with what to fix said under it.
struct AddressField: View {
    @Binding var url: String

    var body: some View {
        TextField("Base URL", text: $url, prompt: Text("https://api.example.com/v1"))
            .keyboardType(.URL)
            .textContentType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        if let problem = BaseURL.problem(url) {
            Note(text: problem, color: Tokens.red, symbol: "exclamationmark.triangle")
        }
    }
}

/// A model: the preset's suggestions as a picker, or a field for any id,
/// as desktop's ModelPicker offers. The section title says which model,
/// so the row says Model and VoiceOver hears the full name.
struct ModelField: View {
    let label: String
    @Binding var value: String
    let options: [String]

    var body: some View {
        if options.isEmpty {
            TextField("Model", text: $value, prompt: Text("Model id"))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityLabel(label)
        } else {
            Picker("Model", selection: $value) {
                ForEach(options, id: \.self) { id in
                    Text(id).tag(id)
                }
                if !options.contains(value) {
                    Text(value).tag(value)
                }
            }
            .pickerStyle(.navigationLink)
            .accessibilityLabel(label)
        }
    }
}

extension ProviderScreen {
    /// Provider profiles (IOS-025): with Pro, your saved setups to switch
    /// to and Save this setup; without, where Pro is.
    var profilesSection: some View {
        Section {
            if pro.status.isPro {
                ForEach(model.profiles) { profile in
                    Button {
                        model.applyProfile(profile.id)
                    } label: {
                        Label(profile.name, systemImage: profile.settings == model.settings ? "checkmark.circle.fill" : "circle")
                    }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
                    .accessibilityLabel(ProfileCopy.use(profile.name, current: profile.settings == model.settings))
                    .swipeActions {
                        Button(ProfileCopy.delete, role: .destructive) { model.deleteProfile(profile.id) }
                    }
                }
                Button(ProfileCopy.save) { naming = true }
                    .buttonStyle(RowAction())
                    .frame(minHeight: 44)
            } else {
                NavigationLink(ProfileCopy.withPro) { ProRoute() }
            }
        } header: {
            SectionTitle(ProfileCopy.title)
        } footer: {
            Text(ProfileCopy.footer).foregroundStyle(Tokens.textDim)
        }
        .listRowBackground(Tokens.panel)
    }
}

enum ProfileCopy {
    static let title = "Profiles"
    static let save = "Save this setup"
    static let saveIt = "Save"
    static let cancel = "Cancel"
    static let delete = "Delete"
    static let name = "Name"
    static let nameIt = "Name this setup"
    static let withPro = "Provider profiles come with murmur Pro"
    static let footer = "A profile keeps the providers and models below; each provider's key stays in your Keychain."

    static func use(_ name: String, current: Bool) -> String {
        current ? "\(name), in use" : "Use \(name)"
    }
}

extension ProviderModel {
    /// The real screen: the bundled catalog, saved choices, the Keychain,
    /// a session that keeps no cookies or cache, and murmur Pro's status.
    static func live() -> ProviderModel? {
        guard let catalog = try? BundledRules.catalog() else { return nil }
        let session = URLSession(configuration: .ephemeral)
        return ProviderModel(
            catalog: catalog, store: ConnectionStore(), ring: KeychainKeyRing(), send: { try await session.data(for: $0) },
            isPro: { ProStore.live().status.isPro }
        )
    }
}

/// Opens the Provider screen, built once the catalog is read.
struct ProviderRoute: View {
    var make: @MainActor () -> ProviderModel? = { ProviderModel.live() }
    /// On a sheet (first run's Add your key): Done keeps a pasted key, then
    /// closes.
    var done: (() -> Void)?
    @State private var model: ProviderModel?
    @State private var failed = false

    var body: some View {
        Group {
            if let model {
                ProviderScreen(model: model)
            } else if failed {
                Note(text: "murmur could not read its provider list. Reinstall murmur to fix it.", color: Tokens.red, symbol: "exclamationmark.triangle")
                    .padding()
            } else {
                // The ground until the model is built: a Group with nothing in
                // it never runs its task, and the screen would stay blank.
                Tokens.ink.ignoresSafeArea()
            }
        }
        .task {
            guard model == nil else { return }
            model = make()
            failed = model == nil
        }
        .toolbar {
            if let done {
                ToolbarItem(placement: .confirmationAction) {
                    Button(SetupCopy.closeKey) {
                        if model?.keepDrafts() ?? true { done() }
                    }
                }
            }
        }
    }
}

#if DEBUG
let previewCatalog: ProviderCatalog = {
    do {
        return try BundledRules.catalog()
    } catch {
        preconditionFailure("the bundled catalog does not load: \(error)")
    }
}()

@MainActor private func previewModel(_ keys: [String: String] = [:], pro: Bool = false) -> ProviderModel {
    let ring = MemoryKeyRing(Dictionary(uniqueKeysWithValues: keys.compactMap { url, key in APIKey(key).map { (url, $0) } }))
    let defaults = UserDefaults(suiteName: "murmur.previews.\(UUID().uuidString)") ?? .standard
    return ProviderModel(catalog: previewCatalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { _ in throw URLError(.notConnectedToInternet) }, isPro: { pro })
}

#Preview("No key") {
    NavigationStack { ProviderScreen(model: previewModel()) }.preferredColorScheme(.dark)
}

#Preview("Saved key") {
    NavigationStack { ProviderScreen(model: previewModel(["https://api.groq.com/openai/v1": "gsk_abcdefgh1234"])) }.preferredColorScheme(.dark)
}

#Preview("Profiles with Pro") {
    let model = previewModel(pro: true)
    model.saveProfile("Groq at home")
    model.chooseTranscription(previewCatalog.presets(for: .transcription).last)
    model.saveProfile("Work")
    return NavigationStack { ProviderScreen(model: model, pro: .preview(bought: true)) }.preferredColorScheme(.dark)
}

#Preview("Profiles without Pro") {
    NavigationStack { ProviderScreen(model: previewModel(), pro: .preview(bought: false)) }.preferredColorScheme(.dark)
}
#endif
