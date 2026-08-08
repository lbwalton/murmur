import Foundation

// Typed face of shared/format-spec.json, the single source of truth for
// formatter rules on every platform. Tune the spec file, not this code.
struct FormatSpec: Decodable {
    struct Defaults: Decodable {
        let level: String
        let style: String
        let numbers: String
    }

    struct Prompt: Decodable {
        let header: String
        let rulesLabel: String
        let spokenCommands: String
        let footer: [String]
        let dictionaryRule: String
        let correctionsRule: String
        let correctionPairTemplate: String
        let correctionPairSeparator: String
        let correctionsPromptLimit: Int
        let vocabularyPrompt: String
    }

    struct ChatGuard: Decodable {
        let tells: [String]
        let lengthMultiplier: Int
        let lengthSlack: Int
        let singleWordSlack: Int
        let overlapFloor: Double
    }

    struct Silence: Decodable {
        let noSpeechProbThreshold: Double
    }

    let version: Int
    let defaults: Defaults
    let prompt: Prompt
    let levels: [String: [String]]
    let structure: [String]
    let styles: [String: [String]]
    let numbers: [String: [String]]
    let chatGuard: ChatGuard
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
