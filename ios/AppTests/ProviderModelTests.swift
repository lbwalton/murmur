// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct ProviderModelTests {
    let catalog: ProviderCatalog
    let defaults: UserDefaults
    let ring = MemoryKeyRing()
    let groq = "https://api.groq.com/openai/v1"

    init() throws {
        catalog = try BundledRules.catalog()
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func model(status: Int = 200) -> ProviderModel {
        ProviderModel(catalog: catalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { request in
            (Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        })
    }

    func preset(_ id: String) throws -> ProviderCatalog.Provider {
        try #require(catalog.providers.first { $0.id == id })
    }

    @Test func startsOnGroqWithCleanupRidingIt() {
        let model = model()
        #expect(model.transcriptionPreset?.id == "groq")
        #expect(model.settings.transcription.sttModel == "whisper-large-v3-turbo")
        #expect(model.transcriptionKey.baseUrl == groq)
        #expect(model.cleanupSharesKey)
    }

    @Test func aPresetFillsItsAddressAndFirstModels() throws {
        let model = model()
        model.chooseTranscription(try preset("openai"))
        #expect(model.settings.transcription.baseUrl == "https://api.openai.com/v1")
        #expect(model.settings.transcription.sttModel == "gpt-transcribe")
        #expect(model.settings.transcription.llmModel == "gpt-5.6-luna")
    }

    @Test func customClearsTheAddressForTyping() {
        let model = model()
        model.chooseTranscription(nil)
        #expect(model.transcriptionPreset == nil)
        #expect(model.settings.transcription.baseUrl == "")
        #expect(model.transcriptionKey.addressProblem == "Enter the provider's base URL.")
    }

    @Test func switchingProvidersNeverAsksForAKeyTwice() throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.masked == nil)
        model.transcriptionKey.draft = "sk-openaiopenai2222"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("groq"))
        #expect(model.transcriptionKey.masked == "••••1111")
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.masked == "••••2222")
    }

    @Test func savingTrimsThePasteAndClearsTheField() throws {
        let model = model()
        model.transcriptionKey.draft = "  gsk_groqgroq1111\n"
        model.transcriptionKey.save()
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
        #expect(model.transcriptionKey.draft == "")
        #expect(model.transcriptionKey.masked == "••••1111")
    }

    /// The note is gentle: a key with the wrong prefix still saves.
    @Test func aWrongPrefixGetsANoteAndStillSaves() throws {
        let model = model()
        model.transcriptionKey.draft = "sk-notgroq1111"
        #expect(model.transcriptionKey.note == .expected(prefixes: ["gsk_"], provider: "Groq"))
        #expect(model.transcriptionKey.canSave)
        model.transcriptionKey.save()
        #expect(model.transcriptionKey.masked == "••••1111")
    }

    @Test(arguments: [(200, ConnectionVerdict.works), (401, .keyRejected(status: 401))])
    func testAnswersInline(_ status: Int, _ verdict: ConnectionVerdict) async throws {
        let model = model(status: status)
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        await model.transcriptionKey.runTest()
        #expect(model.transcriptionKey.test == .done(verdict))
    }

    @Test func noKeyMeansNoTest() async {
        let model = model()
        #expect(!model.transcriptionKey.canTest)
        await model.transcriptionKey.runTest()
        #expect(model.transcriptionKey.test == .idle)
    }

    /// A verdict earned at one address never vouches for another.
    @Test func switchingProvidersClearsTheVerdict() async throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        await model.transcriptionKey.runTest()
        model.chooseTranscription(try preset("openai"))
        #expect(model.transcriptionKey.test == .idle)
    }

    @Test func separateCleanupGetsItsOwnKeyUnlessItSharesTheAddress() throws {
        let model = model()
        model.separateCleanup = true
        model.chooseCleanup(try preset("groq"))
        #expect(model.cleanupSharesKey)
        model.chooseCleanup(try preset("deepseek"))
        #expect(!model.cleanupSharesKey)
        #expect(model.cleanupKey.baseUrl == "https://api.deepseek.com")
        #expect(model.settings.cleanupModel == "deepseek-flash")
    }

    @Test func theCleanupModelFollowsWhereCleanupRuns() throws {
        let model = model()
        model.cleanupModel = "openai/gpt-oss-20b"
        #expect(model.settings.transcription.llmModel == "openai/gpt-oss-20b")
        model.separateCleanup = true
        model.chooseCleanup(try preset("deepseek"))
        model.cleanupModel = "deepseek-other"
        #expect(model.settings.cleanup.llmModel == "deepseek-other")
        #expect(model.settings.transcription.llmModel == "openai/gpt-oss-20b")
    }

    /// An answer that lands after the person moved to another provider
    /// is dropped, so it never vouches for the new one.
    @Test func aLateAnswerNeverLandsOnAnotherProvider() async throws {
        let gate = AsyncStream<Void>.makeStream()
        let model = ProviderModel(catalog: catalog, store: ConnectionStore(defaults: defaults), ring: ring, send: { request in
            for await _ in gate.stream { break }
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        let running = Task { await model.transcriptionKey.runTest() }
        for _ in 0..<100 where model.transcriptionKey.test != .testing { await Task.yield() }
        #expect(model.transcriptionKey.test == .testing)
        model.chooseTranscription(try preset("openai"))
        gate.continuation.yield()
        gate.continuation.finish()
        await running.value
        #expect(model.transcriptionKey.test == .idle)
    }

    @Test func unreadableSavedChoicesFallBackToDefaults() {
        defaults.set(Data("not json".utf8), forKey: ConnectionStore.defaultsKey)
        #expect(model().transcriptionPreset?.id == "groq")
    }

    /// Fixing a custom address never wipes a key pasted before it.
    @Test func editingACustomAddressKeepsThePastedKey() {
        let model = model()
        model.chooseTranscription(nil)
        model.transcriptionKey.draft = "sk-customcustom1234"
        model.transcriptionAddress = "h"
        model.transcriptionAddress = "https://api.example.com/v1"
        #expect(model.transcriptionKey.draft == "sk-customcustom1234")
        #expect(model.transcriptionKey.canSave)
    }

    /// An address that belongs to a preset this role does not offer (Local
    /// for transcription, or a chat-only provider) stays Custom, so the
    /// address field and its note stay on screen.
    @Test(arguments: ["http://localhost:8000/v1", "https://api.deepseek.com"])
    func anAddressThisRoleDoesNotOfferStaysCustom(_ url: String) {
        let model = model()
        model.chooseTranscription(nil)
        model.transcriptionAddress = url
        #expect(model.transcriptionPreset == nil)
    }

    /// The screen's fields bind to these properties, and an address moves
    /// its key slot along with it.
    @Test func theFieldsChangeTheSavedChoices() {
        let model = model()
        model.chooseTranscription(nil)
        model.transcriptionAddress = "https://api.example.com/v1"
        model.sttModel = "whisper-1"
        model.cleanupModel = "chat-1"
        #expect(model.transcriptionKey.baseUrl == "https://api.example.com/v1")
        #expect(model.settings.transcription.sttModel == "whisper-1")
        #expect(model.sttModel == "whisper-1")
        #expect(model.cleanupModel == "chat-1")
        model.separateCleanup = true
        model.cleanupAddress = "https://llm.example.com/v1"
        #expect(model.separateCleanup)
        #expect(model.cleanupKey.baseUrl == "https://llm.example.com/v1")
        #expect(model.transcriptionAddress == "https://api.example.com/v1")
        #expect(model.cleanupAddress == "https://llm.example.com/v1")
    }

    /// The provider picker chooses by id among what its role offers, and
    /// Custom leaves the address to type.
    @Test func theProviderPickerChoosesById() {
        let model = model()
        model.transcriptionChoice = "openai"
        #expect(model.transcriptionPreset?.id == "openai")
        #expect(model.transcriptionChoice == "openai")
        model.transcriptionChoice = ProviderModel.customChoice
        #expect(model.settings.transcription.baseUrl == "")
        #expect(model.transcriptionChoice == ProviderModel.customChoice)
        model.transcriptionChoice = "openai"
        model.transcriptionChoice = "deepseek"
        #expect(model.settings.transcription.baseUrl == "")
        model.separateCleanup = true
        model.cleanupChoice = "deepseek"
        #expect(model.cleanupPreset?.id == "deepseek")
        #expect(model.cleanupChoice == "deepseek")
    }

    @Test func choicesSurviveARelaunch() throws {
        model().chooseTranscription(try preset("mistral"))
        #expect(model().transcriptionPreset?.id == "mistral")
    }

    @Test func aKeyNeverReachesTheDefaults() throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.transcriptionKey.save()
        model.chooseTranscription(try preset("openai"))
        #expect(!"\(defaults.dictionaryRepresentation())".contains("gsk_groqgroq1111"))
    }

    /// Done on the key sheet keeps a pasted key in either slot, as Save key
    /// would, so closing the sheet never throws it away.
    @Test func doneKeepsAPastedKey() throws {
        let model = model()
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        model.separateCleanup = true
        model.chooseCleanup(try preset("openai"))
        model.cleanupKey.draft = "sk-openaiopenai2222"
        #expect(model.keepDrafts())
        #expect(try ring.key(for: groq)?.secret == "gsk_groqgroq1111")
        #expect(try ring.key(for: "https://api.openai.com/v1")?.secret == "sk-openaiopenai2222")
        #expect(model.transcriptionKey.masked == "••••1111")
        #expect(model.cleanupKey.draft == "")
    }

    /// With nothing pasted, Done only closes.
    @Test func doneWithNothingPastedSavesNothing() throws {
        let model = model()
        #expect(model.keepDrafts())
        #expect(try ring.key(for: groq) == nil)
    }

    /// A key the Keychain refused stays in its field, and the sheet stays
    /// open so the failure shows.
    @Test func doneStaysOpenWhenTheKeychainRefuses() {
        let model = ProviderModel(catalog: catalog, store: ConnectionStore(defaults: defaults), ring: FailingRing(), send: { _ in throw URLError(.cancelled) })
        model.transcriptionKey.draft = "gsk_groqgroq1111"
        #expect(!model.keepDrafts())
        #expect(model.transcriptionKey.draft == "gsk_groqgroq1111")
    }

    @Test func aKeychainFailureIsSaidPlainly() {
        let slot = KeySlot(baseUrl: groq, catalog: catalog, ring: FailingRing(), send: { _ in throw URLError(.cancelled) })
        #expect(slot.failure == "murmur could not reach the Keychain (code -25308). Try again.")
        slot.draft = "gsk_groqgroq1111"
        slot.save()
        #expect(slot.draft == "gsk_groqgroq1111")
    }
}

/// A Keychain that refuses everything, as a locked phone can.
private struct FailingRing: KeyRing {
    func key(for baseUrl: String) throws -> APIKey? { throw KeychainError.status(-25308) }
    func save(_ key: APIKey, for baseUrl: String) throws { throw KeychainError.status(-25308) }
    func remove(for baseUrl: String) throws { throw KeychainError.status(-25308) }
}
