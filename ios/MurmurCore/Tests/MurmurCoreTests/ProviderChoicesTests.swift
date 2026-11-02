// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

let bundledCatalog: ProviderCatalog? = try? SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")

@Suite struct ProviderChoicesTests {
    /// Desktop's speech presets, less Local, whose localhost would be the phone.
    @Test func transcriptionOffersTheSpeechPresetsWithGroqFirst() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.presets(for: .transcription).map(\.id) == ["groq", "openai", "mistral"])
    }

    /// Desktop's chat presets, less Local; TypeSafe is a decision model,
    /// which desktop's cleanup does not offer either.
    @Test func cleanupOffersTheChatPresets() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.presets(for: .cleanup).map(\.id) == ["groq", "openai", "mistral", "deepseek", "cerebras", "openrouter"])
    }

    @Test(arguments: [
        ("https://api.groq.com/openai/v1", "groq"), ("https://api.groq.com/openai/v1/", "groq"),
        ("http://localhost:11434/v1", "local"), ("https://api.example.com/v1", nil)
    ] as [(String, String?)])
    func aBaseUrlFindsItsPreset(_ url: String, _ id: String?) throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.preset(forBaseUrl: url)?.id == id)
    }

    @Test func aTrailingSlashFilesUnderTheSameKey() {
        #expect(BaseURL.normalized("https://api.openai.com/v1/") == "https://api.openai.com/v1")
        #expect(BaseURL.normalized("https://api.openai.com/v1") == "https://api.openai.com/v1")
    }

    @Test(arguments: [
        ("https://api.example.com/v1", nil),
        ("", "Enter the provider's base URL."),
        ("api.example.com/v1", "Start the address with https://."),
        ("http://192.168.1.5:8000/v1", "Use an https address. iPhone apps can only call https."),
        ("https://", "Add the provider's host after https://.")
    ] as [(String, String?)])
    func anAddressSaysWhatToFix(_ url: String, _ problem: String?) {
        #expect(BaseURL.problem(url) == problem)
    }

    @Test func defaultsAreGroqWithDesktopsModels() throws {
        let settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        #expect(settings.transcription.baseUrl == "https://api.groq.com/openai/v1")
        #expect(settings.transcription.sttModel == "whisper-large-v3-turbo")
        #expect(settings.transcription.llmModel == "openai/gpt-oss-120b")
        #expect(!settings.cleanup.separate)
    }

    @Test func cleanupRidesTranscriptionUntilItIsSeparate() throws {
        var settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        #expect(settings.cleanupBaseUrl == settings.transcription.baseUrl)
        #expect(settings.cleanupModel == "openai/gpt-oss-120b")
        settings.cleanup = .init(separate: true, baseUrl: "https://api.deepseek.com", llmModel: "deepseek-flash")
        #expect(settings.cleanupBaseUrl == "https://api.deepseek.com")
        #expect(settings.cleanupModel == "deepseek-flash")
    }

    @Test func settingsRoundTripThroughJSON() throws {
        let settings = ConnectionSettings(defaultsFrom: try #require(bundledCatalog))
        let back = try JSONDecoder().decode(ConnectionSettings.self, from: JSONEncoder().encode(settings))
        #expect(back == settings)
    }
}
