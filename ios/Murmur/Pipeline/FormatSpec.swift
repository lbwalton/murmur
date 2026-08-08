import Foundation

// Typed face of shared/format-spec.json, the single source of truth for
// formatter rules on every platform. Tune the spec file, not this code.
struct FormatSpec: Decodable {
    struct Defaults: Decodable {
        let level: String
        let style: String
        let numbers: String
    }

    // The transcript is sent to the chat model fenced in these tags so a
    // task-shaped dictation reads as data, not orders. stripPattern/stripFlags
    // drive removing every tag occurrence off the reply (US-030).
    struct TranscriptWrapper: Decodable {
        let open: String
        let close: String
        let stripPattern: String
        let stripFlags: String
    }

    struct Prompt: Decodable {
        let header: String
        let rulesLabel: String
        let spokenCommands: String
        let footer: [String]
        let transcriptWrapper: TranscriptWrapper
        let dictionaryRule: String
        let correctionsRule: String
        let correctionPairTemplate: String
        let correctionPairSeparator: String
        let correctionsPromptLimit: Int
        let vocabularyPrompt: String
    }

    // US-030 compliance pattern: an artifact a cleanup could never produce
    // (a "[Your Name]" placeholder, a "Here is a drafted email:" preamble,
    // an empty list marker). flags map to NSRegularExpression.Options.
    struct ComplyPattern: Decodable {
        let pattern: String
        let flags: String
    }

    struct ChatGuard: Decodable {
        let tells: [String]
        let complyPatterns: [ComplyPattern]
        let lengthMultiplier: Int
        let lengthSlack: Int
        let singleWordSlack: Int
        let overlapFloor: Double
    }

    // US-029 prompt-echo signature: a full-dictionary run Whisper regurgitated
    // into real speech. Under minTerms there is no signature worth matching.
    struct PromptEcho: Decodable {
        let minTerms: Int
        let joinPattern: String
    }

    struct Silence: Decodable {
        let noSpeechProbThreshold: Double
    }

    let version: Int
    let defaults: Defaults
    let prompt: Prompt
    let levels: [String: [String]]
    let structure: [String]
    let headingRule: [String]
    let styles: [String: [String]]
    let numbers: [String: [String]]
    let chatGuard: ChatGuard
    let promptEcho: PromptEcho
    let silence: Silence

    static func load(from bundle: Bundle = .main) throws -> FormatSpec {
        guard let url = bundle.url(forResource: "format-spec", withExtension: "json") else {
            throw PipelineError.specMissing
        }
        return try JSONDecoder().decode(FormatSpec.self, from: Data(contentsOf: url))
    }
}

enum PipelineError: LocalizedError {
    case specMissing

    var errorDescription: String? {
        switch self {
        case .specMissing:
            return "format-spec.json is missing from the app bundle."
        }
    }
}

// Fills {placeholder} slots in spec templates. Replacements are literal:
// inserted values are never rescanned, matching the desktop implementation.
func fillTemplate(_ template: String, _ values: [String: String]) -> String {
    var out = template
    for (key, value) in values {
        out = out.replacingOccurrences(of: "{\(key)}", with: value)
    }
    return out
}

// Maps a spec regex flag string to NSRegularExpression options, the same
// contract both platforms read from the spec: i is case-insensitive, m makes
// ^ and $ match line boundaries, empty is no options. The global flag (g) is
// meaningless to NSRegularExpression, which already scans the whole string,
// so it is ignored. Keeping the mapping here means a case-sensitive guard on
// one platform can never quietly become case-insensitive on the other.
func regexOptions(from flags: String) -> NSRegularExpression.Options {
    var options: NSRegularExpression.Options = []
    if flags.contains("i") { options.insert(.caseInsensitive) }
    if flags.contains("m") { options.insert(.anchorsMatchLines) }
    return options
}
