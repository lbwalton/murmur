// SPDX-License-Identifier: GPL-3.0-only
import Foundation
import Testing
@testable import MurmurCore

struct FormatterVector: Decodable, Sendable, CustomTestStringConvertible {
    struct Settings: Decodable, Sendable {
        var level: FormatOptions.Level?
        var numbers: FormatOptions.Numbers?
        var smartLists: Bool?
        var dictionary: [DictionaryEntry]?
        var expansions: [ExpansionEntry]?
    }

    let name: String
    let settings: Settings?
    let input: String
    let expected: String

    var testDescription: String { name }

    static let all: [FormatterVector] = {
        struct File: Decodable { let vectors: [FormatterVector] }
        let data = (try? SharedData(directory: repoShared).data(named: "test-vectors.json")) ?? Data()
        return (try? JSONDecoder().decode(File.self, from: data).vectors) ?? []
    }()
}

let formatSpec: FormatSpec = {
    do {
        return try SharedData(directory: repoShared).decode(FormatSpec.self, from: "format-spec.json")
    } catch {
        preconditionFailure("format-spec.json does not load: \(error)")
    }
}()

@Suite struct FormatterVectorTests {
    @Test func everyVectorLoaded() throws {
        let data = try SharedData(directory: repoShared).data(named: "test-vectors.json")
        let raw = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let count = try #require((raw["vectors"] as? [Any])?.count)
        #expect(count > 0)
        #expect(FormatterVector.all.count == count)
    }

    /// Desktop's pipeline: the dictionary on raw text, formatting, exact
    /// dictionary casing, then expansions last.
    @Test(arguments: FormatterVector.all)
    func matchesDesktop(_ vector: FormatterVector) {
        let options = FormatOptions(
            level: vector.settings?.level ?? .full,
            numbers: vector.settings?.numbers ?? .auto,
            smartLists: vector.settings?.smartLists ?? false
        )
        let dictionary = vector.settings?.dictionary ?? []
        let formatted = formatTranscript(applyDictionary(vector.input, dictionary), options: options, spec: formatSpec)
        let result = applyExpansions(enforceDictionaryCasing(formatted, dictionary), vector.settings?.expansions ?? [])
        expectSameUnits(result, vector.expected)
    }

    /// Desktop's test of the same name: b c's symbol X sorts before a b's
    /// Y, so b c goes first and leaves "aX".
    @Test func equalLengthPhrasesGoBySymbolThenPhrase() throws {
        let spec = try specWithSpokenPunctuation(["a b": "Y", "b c": "X"])
        expectSameUnits(formatTranscript("a b c", options: FormatOptions(), spec: spec), "AX")
    }

    /// Symbols compare as code units, as in JavaScript: ; sorts before the
    /// Greek question mark Swift's == calls equal to it, so b c goes first.
    /// Node gives "A;".
    @Test func symbolsCompareCodeUnits() throws {
        let spec = try specWithSpokenPunctuation(["a b": "\u{037E}", "b c": ";"])
        expectSameUnits(formatTranscript("a b c", options: FormatOptions(), spec: spec), "A;")
    }

    private func specWithSpokenPunctuation(_ map: [String: String]) throws -> FormatSpec {
        let data = try SharedData(directory: repoShared).data(named: "format-spec.json")
        var raw = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        raw["spokenPunctuation"] = ["map": map]
        return try JSONDecoder().decode(FormatSpec.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    @Test func everyUnitHasItsOwnValue() {
        let values = formatSpec.numbers.units.values
        #expect(Set(values).count == values.count)
    }
}
