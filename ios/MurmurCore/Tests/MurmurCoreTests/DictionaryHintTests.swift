// SPDX-License-Identifier: GPL-3.0-only
import Testing
@testable import MurmurCore

@Suite struct DictionaryHintTests {
    /// The dictionary's spellings, in order and each once, as one line.
    @Test func theHintListsEachSpellingOnce() {
        let entries = [
            DictionaryEntry(from: "la broy", to: "LaBroi"),
            DictionaryEntry(from: "eze media", to: "Eze Media"),
            DictionaryEntry(from: "labroy", to: "LaBroi"),
            DictionaryEntry(from: "  ", to: "Nothing"),
            DictionaryEntry(from: "murmer", to: "murmur")
        ]
        #expect(transcriptionHint(entries) == "LaBroi, Eze Media, murmur.")
    }

    @Test func anEmptyDictionarySendsNoHint() {
        #expect(transcriptionHint([]) == nil)
        #expect(transcriptionHint([DictionaryEntry(from: "x", to: " ")]) == nil)
    }

    /// A long dictionary stops well under the providers' 224 token limit.
    @Test func aLongDictionaryStopsInTime() throws {
        let entries = (0..<400).map { DictionaryEntry(from: "word \($0)", to: "Spelling\($0)") }
        let hint = try #require(transcriptionHint(entries))
        #expect(hint.count <= 601)
        #expect(hint.hasPrefix("Spelling0, Spelling1"))
        #expect(hint.hasSuffix("."))
    }
}
