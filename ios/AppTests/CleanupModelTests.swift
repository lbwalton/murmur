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
        first.numbers = .digits
        #expect(model().settings == CleanupSettings(level: .light, numbers: .digits, smartLists: true, polish: false))
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
    }

    /// The product name stays lowercase even where a sentence starts.
    @Test func murmurStaysLowercase() {
        let lines = [FormatOptions.Level.off, .light, .full].map(CleanupCopy.level) + [CleanupCopy.polish(model: "m"), CleanupCopy.smartLists]
            + [FormatOptions.Numbers.auto, .digits, .words].map(CleanupCopy.numbers)
        for line in lines {
            #expect(!line.contains("Murmur"))
        }
    }
}
