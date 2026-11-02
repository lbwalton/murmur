// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct ProviderProfileTests {
    let defaults: UserDefaults
    let catalog: ProviderCatalog

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
        catalog = try BundledRules.catalog()
    }

    func model(pro: Bool) -> ProviderModel {
        ProviderModel(
            catalog: catalog, store: ConnectionStore(defaults: defaults), ring: MemoryKeyRing(),
            send: { _ in throw URLError(.notConnectedToInternet) }, isPro: { pro }
        )
    }

    @Test func withoutProNothingSaves() {
        let model = model(pro: false)
        #expect(!model.saveProfile("Groq"))
        #expect(model.profiles.isEmpty)
    }

    @Test func aProfileSavesAndSwitchesBack() throws {
        let model = model(pro: true)
        let groq = model.settings
        #expect(model.saveProfile("  Groq at home  "))
        let saved = try #require(model.profiles.first)
        #expect(saved.name == "Groq at home")
        #expect(saved.settings == groq)
        model.chooseTranscription(catalog.presets(for: .transcription).last)
        #expect(model.settings != groq)
        model.applyProfile(saved.id)
        #expect(model.settings == groq)
        #expect(ConnectionStore(defaults: defaults).load(catalog: catalog) == groq)
    }

    @Test func profilesStayAndGo() throws {
        let model = model(pro: true)
        model.saveProfile("One")
        let again = self.model(pro: true)
        #expect(again.profiles.map(\.name) == ["One"])
        let id = try #require(again.profiles.first?.id)
        // Without Pro a profile stays saved, untouched.
        self.model(pro: false).deleteProfile(id)
        #expect(self.model(pro: true).profiles.count == 1)
        again.deleteProfile(id)
        #expect(self.model(pro: true).profiles.isEmpty)
    }

    @Test func aNameIsNeededAndKeptShort() throws {
        let model = model(pro: true)
        #expect(!model.saveProfile("   "))
        model.saveProfile(String(repeating: "a", count: 60))
        #expect(model.profiles.first?.name.count == 40)
    }
}
