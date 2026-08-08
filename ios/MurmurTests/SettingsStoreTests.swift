import XCTest
@testable import Murmur

// US-104: settings round-trip, desktop-matching defaults, and the key
// isolation law: the API key exists in the Keychain and nowhere else.
@MainActor
final class SettingsStoreTests: XCTestCase {

    private let suite = "murmur.tests.settings"
    private let account = "apiKey.tests"
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suite)
        defaults.removePersistentDomain(forName: suite)
        Keychain.delete(account: account)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        Keychain.delete(account: account)
        super.tearDown()
    }

    private func makeStore() -> SettingsStore {
        SettingsStore(defaults: defaults, keychainAccount: account)
    }

    func testDefaultsMatchDesktop() {
        let store = makeStore()
        XCTAssertEqual(store.model, "whisper-large-v3-turbo")
        XCTAssertEqual(store.baseUrl, "https://api.groq.com/openai/v1")
        XCTAssertEqual(store.language, "auto")
        XCTAssertTrue(store.smartFormat)
        XCTAssertEqual(store.formatModel, "llama-3.1-8b-instant")
        XCTAssertEqual(store.formatStyle, "conversation")
        XCTAssertEqual(store.formatLevel, "medium")
        XCTAssertEqual(store.numberStyle, "auto")
        XCTAssertFalse(store.onboarded)
    }

    func testRoundTripAcrossInstances() {
        let store = makeStore()
        store.formatLevel = "high"
        store.numberStyle = "digits"
        store.language = "en"
        store.smartFormat = false
        store.maxSeconds = 120
        store.onboarded = true
        // A second instance over the same defaults is a relaunch.
        let reborn = makeStore()
        XCTAssertEqual(reborn.formatLevel, "high")
        XCTAssertEqual(reborn.numberStyle, "digits")
        XCTAssertEqual(reborn.language, "en")
        XCTAssertFalse(reborn.smartFormat)
        XCTAssertEqual(reborn.maxSeconds, 120)
        XCTAssertTrue(reborn.onboarded, "onboarding must never show again after completion")
    }

    func testKeyLivesInKeychainOnly() {
        let probe = "gsk_ios_probe_secret_104"
        let store = makeStore()
        store.apiKey = probe
        // Keychain has it; a fresh instance reads it back.
        XCTAssertEqual(Keychain.get(account: account), probe)
        XCTAssertEqual(makeStore().apiKey, probe)
        // The test suite defaults, standard defaults, and the App Group
        // suite must not contain the key anywhere in any value.
        for d in [defaults!, UserDefaults.standard, UserDefaults(suiteName: "group.com.labroi.murmur.ios")].compactMap({ $0 }) {
            let blob = String(describing: d.dictionaryRepresentation())
            XCTAssertFalse(blob.contains(probe), "API key leaked into UserDefaults")
        }
    }

    func testClearingKeyRemovesKeychainItem() {
        let store = makeStore()
        store.apiKey = "gsk_temp"
        store.apiKey = ""
        XCTAssertNil(Keychain.get(account: account))
    }

    func testVocabularyRoundTrip() {
        let store = makeStore()
        store.dictionary = ["Murmur", "Groq"]
        store.corrections = [CorrectionPair(from: "cloud code", to: "Claude Code", count: 2, ts: Date())]
        store.expansions = [Expansion(trigger: "my email", value: "lb@example.com", enabled: false)]
        let reborn = makeStore()
        XCTAssertEqual(reborn.dictionary, ["Murmur", "Groq"])
        XCTAssertEqual(reborn.corrections.first?.to, "Claude Code")
        XCTAssertEqual(reborn.corrections.first?.count, 2)
        XCTAssertEqual(reborn.expansions.first?.enabled, false)
        // The trio rides into the pipeline snapshot.
        let s = reborn.pipelineSettings
        XCTAssertEqual(s.dictionary, ["Murmur", "Groq"])
        XCTAssertEqual(s.corrections.first?.from, "cloud code")
        XCTAssertEqual(s.expansions.first?.trigger, "my email")
    }

    func testLearnCorrectionUpdatesStore() {
        let store = makeStore()
        store.learnCorrection(oldText: "open cloud code", newText: "open Claude Code")
        store.learnCorrection(oldText: "i use cloud code", newText: "i use Claude Code")
        XCTAssertEqual(store.corrections.first?.count, 2)
        XCTAssertTrue(store.dictionary.contains("Claude Code"), "second fix promotes into the dictionary")
    }

    func testOptionListsMatchDesktop() {
        XCTAssertEqual(SettingsStore.levelOptions.map(\.value), ["none", "structure", "soft", "medium", "high"])
        XCTAssertEqual(SettingsStore.styleOptions.map(\.value), ["conversation", "vibe-coding"])
        XCTAssertEqual(SettingsStore.numberOptions.map(\.value), ["auto", "digits", "words"])
        XCTAssertEqual(SettingsStore.languageOptions.first?.value, "auto")
        XCTAssertEqual(SettingsStore.languageOptions.count, 14)
    }
}
