// SPDX-License-Identifier: GPL-3.0-only
// The gentle note under a pasted key whose start does not fit its
// provider (ios/prd.json IOS-005). Only the catalog's keyPrefixes count,
// which list a format only when one provider alone uses it, so the note
// never guesses. It never blocks saving.
import Foundation

public enum KeyNote: Equatable, Sendable {
    /// The key carries another provider's prefix.
    case looksLike(provider: String)
    /// This provider's keys start with one of these, and this one does not.
    case expected(prefixes: [String], provider: String)
}

extension ProviderCatalog {
    /// The note for a key pasted under a base URL, or nil when it fits
    /// or nothing can be said. A custom address gets no note.
    public func keyNote(for pasted: String, baseUrl: String) -> KeyNote? {
        let key = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, let owner = preset(forBaseUrl: baseUrl) else { return nil }
        let ownPrefixes = owner.keyPrefixes ?? []
        if ownPrefixes.contains(where: { key.hasPrefix($0) }) { return nil }
        let others = providers.filter { other in
            other.id != owner.id && (other.keyPrefixes ?? []).contains { key.hasPrefix($0) }
        }
        if others.count == 1 { return .looksLike(provider: others[0].name) }
        if !ownPrefixes.isEmpty { return .expected(prefixes: ownPrefixes, provider: owner.name) }
        return nil
    }
}
