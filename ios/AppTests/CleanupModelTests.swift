// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@MainActor @Suite struct CleanupModelTests {
    let defaults: UserDefaults

    init() throws {
        defaults = try #require(UserDefaults(suiteName: "murmur.tests.\(UUID().uuidString)"))
    }

    func model() -> CleanupModel {
        CleanupModel(store: CleanupStore(defaults: defaults), polishModel: "openai/gpt-oss-120b")
    }

    @Test func itStartsOnDesktopsDefaults() {
        #expect(model().settings == CleanupSettings())
    }

    /// Each setting saves as it changes and is there after a relaunch.
    @Test func changesSurviveARelaunch() {
        let first = model()
        first.level = .light
        first.polish = false
        first.smartLists = true
        first.corrections = true
        first.numbers = .digits
        #expect(model().settings == CleanupSettings(level: .light, numbers: .digits, smartLists: true, corrections: true, polish: false))
    }

    @Test func unreadableSavedSettingsFallBackToDefaults() {
        defaults.set(Data("not json".utf8), forKey: CleanupStore.defaultsKey)
        #expect(model().settings == CleanupSettings())
    }

    /// The dictionary and expansions (edited in IOS-013) ride along untouched.
    @Test func changingALevelKeepsTheDictionary() {
        let entries = [DictionaryEntry(from: "labroy", to: "LaBroi")]
        CleanupStore(defaults: defaults).save(CleanupSettings(dictionary: entries))
        let model = model()
        model.level = .off
        #expect(CleanupStore(defaults: defaults).load().dictionary == entries)
    }

    /// The Polish line names the model polish really uses, by desktop's
    /// resolvePolishConnection: a separate cleanup provider without its own
    /// key rides the transcription provider's model, and with no key at all
    /// the line names no model.
    @Test func thePolishLineNamesTheModelPolishUses() throws {
        var connection = ConnectionSettings(defaultsFrom: try BundledRules.catalog())
        connection.transcription.llmModel = "openai/gpt-oss-120b"
        connection.cleanup.separate = true
        connection.cleanup.baseUrl = "https://api.deepseek.com/v1"
        connection.cleanup.llmModel = "deepseek-chat"
        let groq = connection.transcription.baseUrl
        let groqKey = try #require(APIKey("gsk_groqgroq1111"))
        let deepseekKey = try #require(APIKey("sk-deepseekdeep1"))
        #expect(CleanupModel.modelPolishUses(connection, key: { $0 == groq ? groqKey : nil }) == "openai/gpt-oss-120b")
        #expect(CleanupModel.modelPolishUses(connection, key: { $0 == groq ? groqKey : deepseekKey }) == "deepseek-chat")
        #expect(CleanupModel.modelPolishUses(connection, key: { _ in nil }) == "")
    }
}

@Suite struct CleanupCopyTests {
    @Test func everySettingSaysWhatItDoes() {
        let levels = [FormatOptions.Level.off, .light, .full].map(CleanupCopy.level)
        let numbers = [FormatOptions.Numbers.auto, .digits, .words].map(CleanupCopy.numbers)
        #expect(Set(levels).count == 3 && Set(numbers).count == 3)
        #expect(CleanupCopy.polish(model: "openai/gpt-oss-120b").contains("(openai/gpt-oss-120b)"))
        #expect(CleanupCopy.polish(model: "").hasPrefix("Your cleanup model fixes"))
    }

    /// Polish's line promises only what its checks catch: an answer much
    /// longer or shorter than what you said, never every answer.
    @Test func polishPromisesOnlyWhatItsChecksCatch() {
        let line = CleanupCopy.polish(model: "m")
        #expect(!line.contains("anything but your words"))
        #expect(line.contains("much longer or shorter"))
        // IOS-032: polish now catches a reply to the dictation too, and the
        // line says what the check sees, a reply's look (review gate).
        #expect(line.contains("looks like a reply to what you said"))
    }

    /// Apply corrections says what it does in desktop's words, and with
    /// Polish off, that it does nothing until Polish is on (IOS-030).
    @Test func correctionsSaysWhatItDoes() {
        #expect(CleanupCopy.corrections(polish: true) == "When you correct yourself (Tuesday, oh wait, I mean Wednesday), only the fix is typed. Off keeps the slip-up in.")
        #expect(CleanupCopy.corrections(polish: false) == CleanupCopy.corrections(polish: true) + " It works through Polish, so it does nothing while Polish is off.")
    }

    /// The product name stays lowercase even where a sentence starts, and
    /// no line uses a dash between clauses.
    @Test func murmurStaysLowercase() {
        let lines = [FormatOptions.Level.off, .light, .full].map(CleanupCopy.level) + [CleanupCopy.polish(model: "m"), CleanupCopy.smartLists]
            + [FormatOptions.Numbers.auto, .digits, .words].map(CleanupCopy.numbers) + [true, false].map(CleanupCopy.corrections)
        for line in lines {
            #expect(!line.contains("Murmur"))
            #expect(!line.contains("\u{2014}") && !line.contains("--"))
        }
    }
}

/// The Cleanup screen at Full with Apply corrections off, on, and on with
/// Polish off, at the largest text size (ios/prd.json conventions.design,
/// IOS-030): each draws, and with MURMUR_SHOTS set, saves pictures to read
/// for clipping, the screen as it opens and the whole page.
@MainActor @Suite struct CleanupRenderTests {
    let shots = FirstRunRenderTests()

    @Test(arguments: CleanupPreview.Scene.allCases)
    func cleanupDrawsAtTheLargestTextSize(_ scene: CleanupPreview.Scene) async throws {
        let image = try await shots.render(CleanupPreview(scene).dynamicTypeSize(.accessibility5))
        try shots.save(image, "cleanup-\(scene)-largest")
        #expect(try shots.inked(image) > 0.02)
        let page = try await shots.render(CleanupPreview(scene).dynamicTypeSize(.accessibility5), tall: true)
        try shots.save(page, "cleanup-\(scene)-largest-page")
        #expect(try shots.inked(page) > 0.02)
    }

    @Test func eachSceneIsItsSettings() {
        #expect(CleanupPreview.Scene.correctionsOff.settings == CleanupSettings())
        #expect(CleanupPreview.Scene.correctionsOn.settings == CleanupSettings(corrections: true))
        #expect(CleanupPreview.Scene.correctionsWithoutPolish.settings == CleanupSettings(corrections: true, polish: false))
    }
}
