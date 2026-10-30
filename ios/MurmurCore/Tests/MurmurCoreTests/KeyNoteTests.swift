// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

@Suite struct KeyNoteTests {
    let groq = "https://api.groq.com/openai/v1"
    let openai = "https://api.openai.com/v1"

    @Test func aGroqKeyUnderGroqGetsNoNote() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "gsk_abcdefgh1234", baseUrl: groq) == nil)
    }

    @Test func aKeyMissingGroqsPrefixSaysWhatGroqKeysLookLike() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "sk-abcdefgh1234", baseUrl: groq) == .expected(prefixes: ["gsk_"], provider: "Groq"))
    }

    @Test func aGroqKeyUnderOpenAISaysWhoseItLooksLike() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "gsk_abcdefgh1234", baseUrl: openai) == .looksLike(provider: "Groq"))
    }

    /// OpenAI lists no prefix (its sk- is shared), so nothing can be said.
    @Test func aProviderWithoutPrefixesStaysQuiet() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "anything-at-all-1234", baseUrl: openai) == nil)
    }

    @Test func aCustomAddressAndAnEmptyFieldStayQuiet() throws {
        let catalog = try #require(bundledCatalog)
        #expect(catalog.keyNote(for: "gsk_abcdefgh1234", baseUrl: "https://api.example.com/v1") == nil)
        #expect(catalog.keyNote(for: "  ", baseUrl: groq) == nil)
    }

    /// A paste with a leading space still reads as the key it is.
    @Test func spacesAroundAPasteDoNotMatter() throws {
        #expect(try #require(bundledCatalog).keyNote(for: "  gsk_abcdefgh1234\n", baseUrl: groq) == nil)
    }
}
