// SPDX-License-Identifier: GPL-3.0-only
// Which presets the iPhone offers for transcription and for cleanup, and
// the base URL rules the key ring and the connection test share
// (ios/prd.json IOS-005; desktop's providerForBaseUrl and the key ring's
// normalizeUrl).
import Foundation

public enum ProviderRole: Sendable {
    case transcription
    case cleanup
}

extension ProviderCatalog {
    /// The presets for a role, in catalog order, so Groq comes first.
    /// Transcription takes speech providers and cleanup takes chat ones,
    /// as on desktop. A preset whose address is this device (desktop's
    /// Local) is left out: on a phone, localhost is the phone.
    public func presets(for role: ProviderRole) -> [Provider] {
        providers.filter { provider in
            let kind: Kind = role == .transcription ? .stt : .llm
            return provider.kinds.contains(kind) && !BaseURL.isThisDevice(provider.url(for: role))
        }
    }

    /// The preset a base URL belongs to, by its base or its cleanup URL,
    /// as desktop's providerForBaseUrl matches; nil means Custom.
    public func preset(forBaseUrl baseUrl: String) -> Provider? {
        let wanted = BaseURL.normalized(baseUrl)
        return providers.first { provider in
            BaseURL.normalized(provider.baseUrl) == wanted
                || provider.llmBaseUrl.map { BaseURL.normalized($0) == wanted } == true
        }
    }
}

extension ProviderCatalog.Provider {
    /// Cleanup goes to llmBaseUrl when a preset has one.
    public func url(for role: ProviderRole) -> String {
        role == .cleanup ? (llmBaseUrl ?? baseUrl) : baseUrl
    }
}

public enum BaseURL {
    /// The form the key ring files a key under: one trailing slash off,
    /// as desktop's normalizeUrl does, so "…/v1/" and "…/v1" share a key.
    public static func normalized(_ url: String) -> String {
        url.hasSuffix("/") ? String(url.dropLast()) : url
    }

    /// Nil when the iPhone can call this address; otherwise what to fix,
    /// in plain words. iPhone apps call https only.
    public static func problem(_ url: String) -> String? {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "Enter the provider's base URL." }
        guard let parts = URLComponents(string: trimmed), let scheme = parts.scheme?.lowercased() else {
            return "Start the address with https://."
        }
        if scheme != "https" { return "Use an https address. iPhone apps can only call https." }
        if (parts.host ?? "").isEmpty { return "Add the provider's host after https://." }
        return nil
    }

    /// Whether an address points back at the device it runs on.
    public static func isThisDevice(_ url: String) -> Bool {
        let host = URLComponents(string: url)?.host?.lowercased() ?? ""
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
}
