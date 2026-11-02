// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import MurmurCore
import Testing
@testable import murmur

@Suite struct ProviderCopyTests {
    @Test func everyVerdictHasATitleAndWhatToDo() {
        #expect(ConnectionVerdict.works.words(provider: "Groq") == ("Works", "murmur reached Groq with this key."))
        #expect(ConnectionVerdict.keyRejected(status: 401).words(provider: "Groq").detail == "Groq did not accept this key. Copy a fresh one from Groq, paste it here, and save it.")
        #expect(ConnectionVerdict.noConnection.words(provider: "Groq").title == "No connection")
        #expect(ConnectionVerdict.providerMessage("Model overloaded").words(provider: "Groq") == ("Groq says", "Model overloaded"))
    }

    /// A 403 can be an account that is not set up yet, so it says so.
    @Test func a403MentionsTheAccount() {
        let words = ConnectionVerdict.keyRejected(status: 403).words(provider: "Groq")
        #expect(words.title == "Key rejected")
        #expect(words.detail.contains("account is active"))
    }

    @Test func notesSayWhatToCheck() {
        #expect(KeyNote.looksLike(provider: "Groq").words == "This looks like a Groq key. It works only with Groq.")
        #expect(KeyNote.expected(prefixes: ["gsk_"], provider: "Groq").words == "Groq keys start with gsk_. Check that you copied the whole key.")
    }

    @Test func aCustomProviderGoesByItsHost() {
        #expect(ProviderName.of(nil, baseUrl: "https://api.example.com/v1") == "api.example.com")
        #expect(ProviderName.of(nil, baseUrl: "") == "your provider")
    }

    /// A custom provider with no address yet reads naturally, never as
    /// "your your provider".
    @Test func anUnnamedProviderReadsNaturally() {
        let unnamed = ProviderName.of(nil, baseUrl: "")
        #expect(KeyCopy.pastePrompt(unnamed) == "Paste your key")
        #expect(KeyCopy.removeQuestion(unnamed) == "Remove this key from this iPhone?")
        #expect(KeyCopy.pastePrompt("Groq") == "Paste your Groq key")
        #expect(KeyCopy.removeQuestion("Groq") == "Remove your Groq key from this iPhone?")
    }

    /// The product name stays lowercase even where a sentence starts.
    @Test func murmurStaysLowercase() {
        for verdict in [ConnectionVerdict.works, .keyRejected(status: 401), .keyRejected(status: 403), .noConnection] {
            #expect(!verdict.words(provider: "Groq").detail.contains("Murmur"))
        }
    }
}
