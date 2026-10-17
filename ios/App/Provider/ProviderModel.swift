// SPDX-License-Identifier: GPL-3.0-only
// The Provider screen's state (ios/prd.json IOS-005): which presets are
// picked for transcription and cleanup, and one key slot for each. The
// choices save to ConnectionStore as they change; keys go to the key ring.
// With murmur Pro, whole setups save as profiles to switch between
// (IOS-025).
import Foundation
import MurmurCore
import Observation

@Observable @MainActor
final class ProviderModel {
    let catalog: ProviderCatalog
    private(set) var settings: ConnectionSettings
    let transcriptionKey: KeySlot
    let cleanupKey: KeySlot
    /// The saved provider profiles (IOS-025).
    private(set) var profiles: [ProviderProfile]
    @ObservationIgnored private let store: ConnectionStore
    /// Whether murmur Pro is active: profiles save, switch, and go only then.
    @ObservationIgnored private let isPro: @MainActor () -> Bool

    init(
        catalog: ProviderCatalog, store: ConnectionStore, ring: any KeyRing, send: @escaping ConnectionTest.Send,
        isPro: @escaping @MainActor () -> Bool = { false }
    ) {
        self.catalog = catalog
        self.store = store
        self.isPro = isPro
        profiles = store.profiles()
        let settings = store.load(catalog: catalog)
        self.settings = settings
        transcriptionKey = KeySlot(baseUrl: settings.transcription.baseUrl, catalog: catalog, ring: ring, send: send)
        cleanupKey = KeySlot(baseUrl: settings.cleanupBaseUrl, catalog: catalog, ring: ring, send: send)
    }

    var transcriptionPreset: ProviderCatalog.Provider? { offered(.transcription, settings.transcription.baseUrl) }
    var cleanupPreset: ProviderCatalog.Provider? { offered(.cleanup, settings.cleanupBaseUrl) }

    /// The preset an address belongs to, if this role offers it. Any other
    /// address, even one of a preset the role leaves out (Local, or a chat
    /// provider typed in for transcription), stays Custom, so its field and
    /// note stay on screen.
    private func offered(_ role: ProviderRole, _ baseUrl: String) -> ProviderCatalog.Provider? {
        guard let preset = catalog.preset(forBaseUrl: baseUrl) else { return nil }
        return catalog.presets(for: role).contains { $0.id == preset.id } ? preset : nil
    }

    /// Separate cleanup at transcription's address uses transcription's key.
    var cleanupSharesKey: Bool {
        !settings.cleanup.separate
            || BaseURL.normalized(settings.cleanup.baseUrl) == BaseURL.normalized(settings.transcription.baseUrl)
    }

    /// A preset fills the address and its first models; nil keeps the
    /// address for editing as Custom.
    func chooseTranscription(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if transcriptionPreset != nil { update { $0.transcription.baseUrl = "" } }
            return
        }
        update {
            $0.transcription.baseUrl = preset.url(for: .transcription)
            $0.transcription.sttModel = preset.sttModels.first?.id ?? $0.transcription.sttModel
            $0.transcription.llmModel = preset.llmModels.first?.id ?? $0.transcription.llmModel
        }
    }

    func chooseCleanup(_ preset: ProviderCatalog.Provider?) {
        guard let preset else {
            if cleanupPreset != nil { update { $0.cleanup.baseUrl = "" } }
            return
        }
        update {
            $0.cleanup.baseUrl = preset.url(for: .cleanup)
            $0.cleanup.llmModel = preset.llmModels.first?.id ?? $0.cleanup.llmModel
        }
    }

    // The screen binds its fields to these by key path ($model.sttModel).
    // It never hands Binding a closure: Swift 6.3 (Xcode 26.6, the CI
    // runner) crashes turning a main-actor closure into Binding's setter.

    /// The provider picker's tag: a preset id, or customChoice.
    static let customChoice = "custom"

    var transcriptionChoice: String {
        get { transcriptionPreset?.id ?? Self.customChoice }
        set { chooseTranscription(catalog.presets(for: .transcription).first { $0.id == newValue }) }
    }

    var cleanupChoice: String {
        get { cleanupPreset?.id ?? Self.customChoice }
        set { chooseCleanup(catalog.presets(for: .cleanup).first { $0.id == newValue }) }
    }

    var separateCleanup: Bool {
        get { settings.cleanup.separate }
        set { update { $0.cleanup.separate = newValue } }
    }

    var transcriptionAddress: String {
        get { settings.transcription.baseUrl }
        set { update { $0.transcription.baseUrl = newValue } }
    }

    var cleanupAddress: String {
        get { settings.cleanup.baseUrl }
        set { update { $0.cleanup.baseUrl = newValue } }
    }

    var sttModel: String {
        get { settings.transcription.sttModel }
        set { update { $0.transcription.sttModel = newValue } }
    }

    /// The cleanup model, wherever cleanup runs.
    var cleanupModel: String {
        get { settings.cleanupModel }
        set {
            update {
                if $0.cleanup.separate { $0.cleanup.llmModel = newValue } else { $0.transcription.llmModel = newValue }
            }
        }
    }

    /// Saves the setup on screen under a name; false without Pro or a name.
    @discardableResult
    func saveProfile(_ name: String) -> Bool {
        guard isPro(), let profile = ProviderProfile.make(name, settings: settings) else { return false }
        profiles.append(profile)
        store.saveProfiles(profiles)
        return true
    }

    /// Switches to a saved setup; the key ring supplies its keys.
    func applyProfile(_ id: String) {
        guard isPro(), let profile = profiles.first(where: { $0.id == id }) else { return }
        update { $0 = profile.settings }
    }

    func deleteProfile(_ id: String) {
        guard isPro() else { return }
        profiles.removeAll { $0.id == id }
        store.saveProfiles(profiles)
    }

    /// Done on the key sheet: a pasted key that can be saved is saved, as
    /// Save key would, so closing never throws it away. False when the
    /// Keychain refused one, so the sheet stays open to say why.
    func keepDrafts() -> Bool {
        var kept = true
        for slot in [transcriptionKey, cleanupKey] where slot.canSave {
            slot.save()
            if slot.failure != nil { kept = false }
        }
        return kept
    }

    private func update(_ change: (inout ConnectionSettings) -> Void) {
        var next = settings
        change(&next)
        guard next != settings else { return }
        settings = next
        store.save(next)
        transcriptionKey.point(at: next.transcription.baseUrl)
        cleanupKey.point(at: next.cleanupBaseUrl)
    }
}

enum TestState: Equatable {
    case idle
    case testing
    case done(ConnectionVerdict)
}

/// One provider's key: the field, the saved mask, and the test.
@Observable @MainActor
final class KeySlot {
    private(set) var baseUrl: String
    var draft = ""
    /// The saved key's mask; the key itself is read only to send it.
    private(set) var masked: String?
    private(set) var test: TestState = .idle
    /// A Keychain failure, said plainly.
    private(set) var failure: String?
    @ObservationIgnored private let catalog: ProviderCatalog
    @ObservationIgnored private let ring: any KeyRing
    @ObservationIgnored private let send: ConnectionTest.Send

    init(baseUrl: String, catalog: ProviderCatalog, ring: any KeyRing, send: @escaping ConnectionTest.Send) {
        self.baseUrl = baseUrl
        self.catalog = catalog
        self.ring = ring
        self.send = send
        reload()
    }

    var note: KeyNote? { catalog.keyNote(for: draft, baseUrl: baseUrl) }
    var addressProblem: String? { BaseURL.problem(baseUrl) }
    var canSave: Bool { addressProblem == nil && APIKey(draft) != nil }
    var canTest: Bool { addressProblem == nil && masked != nil && test != .testing }

    /// Follows a new address: that provider's saved key, and no verdict,
    /// since one earned against another address never vouches for this one.
    /// A key being pasted stays, as on desktop, so fixing a custom address
    /// one keystroke at a time never loses it.
    func point(at baseUrl: String) {
        guard BaseURL.normalized(baseUrl) != BaseURL.normalized(self.baseUrl) else { return }
        self.baseUrl = baseUrl
        test = .idle
        reload()
    }

    func save() {
        guard canSave, let key = APIKey(draft) else { return }
        attempt { try ring.save(key, for: baseUrl) }
        if failure == nil {
            draft = ""
            test = .idle
            reload()
        }
    }

    func remove() {
        attempt { try ring.remove(for: baseUrl) }
        test = .idle
        reload()
    }

    func runTest() async {
        guard canTest else { return }
        let key: APIKey?
        do {
            key = try ring.key(for: baseUrl)
        } catch {
            failure = Self.words(for: error)
            return
        }
        guard let key else { return }
        test = .testing
        let tested = baseUrl
        let verdict = await ConnectionTest.run(baseUrl: tested, key: key, send: send)
        if BaseURL.normalized(tested) == BaseURL.normalized(baseUrl) { test = .done(verdict) }
    }

    private func reload() {
        do {
            masked = try ring.key(for: baseUrl)?.masked
            failure = nil
        } catch {
            masked = nil
            failure = Self.words(for: error)
        }
    }

    private func attempt(_ work: () throws -> Void) {
        do {
            try work()
            failure = nil
        } catch {
            failure = Self.words(for: error)
        }
    }

    private static func words(for error: Error) -> String {
        if case KeychainError.status(let status) = error {
            return "murmur could not reach the Keychain (code \(status)). Try again."
        }
        return "murmur could not reach the Keychain. Try again."
    }
}

extension KeySlot {
    /// A slot in a fixed state, for previews.
    static func preview(baseUrl: String, catalog: ProviderCatalog, saved: String? = nil, draft: String = "", test: TestState = .idle) -> KeySlot {
        let ring = MemoryKeyRing()
        if let saved, let key = APIKey(saved) { try? ring.save(key, for: baseUrl) }
        let slot = KeySlot(baseUrl: baseUrl, catalog: catalog, ring: ring, send: { _ in throw URLError(.notConnectedToInternet) })
        slot.draft = draft
        slot.test = test
        return slot
    }
}
