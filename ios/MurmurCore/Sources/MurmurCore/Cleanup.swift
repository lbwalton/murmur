// SPDX-License-Identifier: GPL-3.0-only
// What a transcript becomes (ios/prd.json IOS-007), as desktop's
// finishTranscript makes it (src/main/dictation.ts): the dictionary on
// the words as heard, the formatter, polish at Full when it is on, the
// dictionary's casing over everything, then expansions. Polish can only
// ever improve the words: any failure keeps the formatted text.
import Foundation

/// The cleanup settings, with desktop's defaults: Full, numbers as the
/// provider wrote them, smart lists off, polish on.
public struct CleanupSettings: Codable, Sendable, Equatable {
    public var level: FormatOptions.Level
    public var numbers: FormatOptions.Numbers
    public var smartLists: Bool
    /// Apply corrections (IOS-030): a spoken slip-up and its fix come out
    /// as the fix alone. It works through polish.
    public var corrections: Bool
    /// Polish runs at Full only, and only when this is on.
    public var polish: Bool
    public var dictionary: [DictionaryEntry]
    public var expansions: [ExpansionEntry]

    public init(
        level: FormatOptions.Level = .full, numbers: FormatOptions.Numbers = .auto, smartLists: Bool = false, corrections: Bool = false,
        polish: Bool = true, dictionary: [DictionaryEntry] = [], expansions: [ExpansionEntry] = []
    ) {
        self.level = level
        self.numbers = numbers
        self.smartLists = smartLists
        self.corrections = corrections
        self.polish = polish
        self.dictionary = dictionary
        self.expansions = expansions
    }

    /// A field missing from saved settings takes its default, so settings
    /// saved by an older build still read.
    public init(from decoder: any Decoder) throws {
        let saved = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = CleanupSettings()
        level = try saved.decodeIfPresent(FormatOptions.Level.self, forKey: .level) ?? defaults.level
        numbers = try saved.decodeIfPresent(FormatOptions.Numbers.self, forKey: .numbers) ?? defaults.numbers
        smartLists = try saved.decodeIfPresent(Bool.self, forKey: .smartLists) ?? defaults.smartLists
        corrections = try saved.decodeIfPresent(Bool.self, forKey: .corrections) ?? defaults.corrections
        polish = try saved.decodeIfPresent(Bool.self, forKey: .polish) ?? defaults.polish
        dictionary = try saved.decodeIfPresent([DictionaryEntry].self, forKey: .dictionary) ?? defaults.dictionary
        expansions = try saved.decodeIfPresent([ExpansionEntry].self, forKey: .expansions) ?? defaults.expansions
    }

    public var options: FormatOptions { FormatOptions(level: level, numbers: numbers, smartLists: smartLists) }
}

/// Where polish sends the formatted text.
public struct PolishConnection: Sendable, Equatable {
    public let baseUrl: String
    public let model: String
    public let key: APIKey

    public init(baseUrl: String, model: String, key: APIKey) {
        self.baseUrl = baseUrl
        self.model = model
        self.key = key
    }
}

extension ConnectionSettings {
    /// Desktop's resolvePolishConnection: a separate cleanup provider when
    /// it is set up with an address, a model, and its own key; otherwise
    /// the transcription provider's chat model and key; nil with no key.
    public func polishConnection(key: (String) -> APIKey?) -> PolishConnection? {
        if cleanup.separate, !cleanup.baseUrl.isEmpty, !cleanup.llmModel.isEmpty, let separate = key(cleanup.baseUrl) {
            return PolishConnection(baseUrl: cleanup.baseUrl, model: cleanup.llmModel, key: separate)
        }
        guard let primary = key(transcription.baseUrl) else { return nil }
        return PolishConnection(baseUrl: transcription.baseUrl, model: transcription.llmModel, key: primary)
    }
}

/// The shared rules cleanup runs on.
public struct CleanupRules: Sendable {
    public let format: FormatSpec
    public let polish: PolishRules
    public let hallucinations: HallucinationList

    public init(format: FormatSpec, polish: PolishRules, hallucinations: HallucinationList) {
        self.format = format
        self.polish = polish
        self.hallucinations = hallucinations
    }
}

public enum Cleanup {
    /// The words to deliver from words already past the hallucination
    /// filter. Polish runs only at Full, only when on, and only with a
    /// connection; its fallback reason goes to onFallback, never the words.
    public static func finish(
        _ heard: String, settings: CleanupSettings, rules: CleanupRules, connection: PolishConnection?,
        send: ConnectionTest.Send, onFallback: @Sendable (String) -> Void = { _ in }
    ) async -> String {
        let corrected = applyDictionary(heard, settings.dictionary)
        let formatted = formatTranscript(corrected, options: settings.options, spec: rules.format)
        var polished = formatted
        // Text the formatter emptied (a take of only um) has nothing to polish.
        if settings.level == .full, settings.polish, let connection, !JS.trim(formatted).isEmpty {
            let hints = dictionaryHint(settings.dictionary, rules: rules.polish).map { [$0] } ?? []
            switch await Polish.run(
                formatted, baseUrl: connection.baseUrl, model: connection.model, key: connection.key, smartLists: settings.smartLists,
                corrections: settings.corrections, hints: hints, rules: rules.polish, hallucinations: rules.hallucinations, send: send
            ) {
            case .polished(let text): polished = text
            case .fellBack(let reason): onFallback(reason)
            }
        }
        return applyExpansions(enforceDictionaryCasing(polished, settings.dictionary), settings.expansions)
    }
}
