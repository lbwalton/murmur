// SPDX-License-Identifier: GPL-3.0-only
// The provider catalog, shared/provider-catalog.json, as Swift types:
// the presets, their models and rates, key prefixes, and key pages
// (desktop's CatalogProvider in src/shared/catalog.ts). Every field
// desktop's validateCatalog requires is required here too, so a catalog
// missing one fails to load. Desktop's further value checks (version 1,
// at least one provider, no negative rates) belong to the refresh path,
// which the iPhone does not have yet.
import Foundation

public struct ProviderCatalog: Decodable, Sendable {
    public enum Kind: String, Decodable, Sendable {
        /// Speech to text.
        case stt
        /// An OpenAI-compatible chat model, for cleanup and transform.
        case llm
        /// A decision model that answers typed questions (brain dump sorting).
        case decide
    }

    public struct SttModel: Decodable, Sendable {
        public let id: String
        public let label: String?
        /// USD per hour of audio unless currency says otherwise.
        public let perHourUsd: Double?
        public let currency: String?
        public let minimumBillableSeconds: Double?
    }

    public struct LlmModel: Decodable, Sendable {
        public let id: String
        public let label: String?
        public let inputPerMTok: Double?
        public let outputPerMTok: Double?
        /// ISO 4217; USD when absent.
        public let currency: String?
    }

    public struct Provider: Decodable, Sendable {
        public let id: String
        public let name: String
        public let kinds: [Kind]
        public let baseUrl: String
        /// Cleanup uses this instead of baseUrl when present.
        public let llmBaseUrl: String?
        /// Where to get a key.
        public let keyUrl: String?
        /// Runs on the person's own machine at no cost.
        public let free: Bool?
        public let verifiedOn: String
        /// Where the rates were checked; desktop shows none of these.
        public let sources: [String]?
        public let nuances: [String]
        public let sttModels: [SttModel]
        public let llmModels: [LlmModel]
        /// Key formats only this provider uses; listed only when unambiguous.
        public let keyPrefixes: [String]?
    }

    public struct Estimate: Decodable, Sendable {
        public let tokensPerWord: Double
        public let promptOverheadTokens: Double
        public let sessionsPer1kWords: Double
        public let fallbackWpm: Double
    }

    public let catalogVersion: Int
    public let verifiedOn: String
    public let estimate: Estimate
    public let providers: [Provider]
}
