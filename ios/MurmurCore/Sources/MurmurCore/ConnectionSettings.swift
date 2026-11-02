// SPDX-License-Identifier: GPL-3.0-only
// What the iPhone connects to: the same two blocks as desktop's settings
// (provider and polish in src/shared/settings.ts). Base URLs and model
// ids only; keys live in the key ring, never here.
import Foundation

public struct ConnectionSettings: Codable, Equatable, Sendable {
    public struct Transcription: Codable, Equatable, Sendable {
        public var baseUrl: String
        public var sttModel: String
        /// The cleanup model while cleanup rides this provider.
        public var llmModel: String
    }

    public struct Cleanup: Codable, Equatable, Sendable {
        /// Off is desktop's Same: cleanup rides the transcription provider.
        public var separate: Bool
        public var baseUrl: String
        public var llmModel: String
    }

    public var transcription: Transcription
    public var cleanup: Cleanup

    /// The catalog's first transcription preset (Groq) with its first
    /// models, which are desktop's defaults too.
    public init(defaultsFrom catalog: ProviderCatalog) {
        let first = catalog.presets(for: .transcription).first
        transcription = Transcription(
            baseUrl: first?.baseUrl ?? "",
            sttModel: first?.sttModels.first?.id ?? "",
            llmModel: first?.llmModels.first?.id ?? ""
        )
        cleanup = Cleanup(separate: false, baseUrl: "", llmModel: "")
    }

    /// Where cleanup goes, and with which model. Riding transcription
    /// uses its base URL, as desktop's cleanup does on Same.
    public var cleanupBaseUrl: String { cleanup.separate ? cleanup.baseUrl : transcription.baseUrl }
    public var cleanupModel: String { cleanup.separate ? cleanup.llmModel : transcription.llmModel }
}
