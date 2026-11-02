// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct ProviderCatalogTests {
    func catalogJSON() throws -> [String: Any] {
        let data = try SharedData(directory: repoShared).data(named: "provider-catalog.json")
        return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func decodes(_ json: [String: Any]) -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: json) else { return false }
        return (try? JSONDecoder().decode(ProviderCatalog.self, from: data)) != nil
    }

    @Test func theBundledCatalogLoads() throws {
        let catalog = try SharedData(directory: repoShared).decode(ProviderCatalog.self, from: "provider-catalog.json")
        #expect(catalog.catalogVersion == 1)
        let groq = try #require(catalog.providers.first)
        #expect(groq.id == "groq")
        #expect(groq.keyPrefixes == ["gsk_"])
        #expect(groq.keyUrl == "https://console.groq.com/keys")
        #expect(groq.kinds == [.stt, .llm])
        #expect(groq.sttModels.first?.id == "whisper-large-v3-turbo")
    }

    /// The fields desktop's validateCatalog requires (src/shared/catalog.ts).
    @Test(arguments: ["id", "name", "kinds", "baseUrl", "verifiedOn", "nuances", "sttModels", "llmModels"])
    func aProviderMissingARequiredFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        providers[0][field] = nil
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test(arguments: ["catalogVersion", "verifiedOn", "estimate", "providers"])
    func aCatalogMissingARequiredFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        json[field] = nil
        #expect(!decodes(json))
    }

    @Test(arguments: ["tokensPerWord", "promptOverheadTokens", "sessionsPer1kWords", "fallbackWpm"])
    func anEstimateMissingAFieldFails(_ field: String) throws {
        var json = try catalogJSON()
        var estimate = try #require(json["estimate"] as? [String: Any])
        estimate[field] = nil
        json["estimate"] = estimate
        #expect(!decodes(json))
    }

    @Test func aModelWithoutAnIdFails() throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        var models = try #require(providers[0]["sttModels"] as? [[String: Any]])
        models[0]["id"] = nil
        providers[0]["sttModels"] = models
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test func anUnknownKindFailsAsOnDesktop() throws {
        var json = try catalogJSON()
        var providers = try #require(json["providers"] as? [[String: Any]])
        providers[0]["kinds"] = ["stt", "tts"]
        json["providers"] = providers
        #expect(!decodes(json))
    }

    @Test func extraFieldsAreIgnored() throws {
        var json = try catalogJSON()
        json["somethingNew"] = true
        #expect(decodes(json))
    }
}
