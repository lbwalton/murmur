// SPDX-License-Identifier: GPL-3.0-only
// Provider profiles (murmur Pro, ios/prd.json IOS-025), as on desktop
// (src/main/profiles.ts): save the whole provider setup, transcription and
// cleanup, under a name, and switch between setups in one tap. Profiles
// hold addresses and model ids only; the key ring supplies each address's
// key, so a profile never carries a key. The free single setup is
// untouched: profiles are kept when Pro ends, and come back with it.
import Foundation
import MurmurCore

struct ProviderProfile: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let settings: ConnectionSettings

    /// Names are trimmed and kept to 40 characters, as desktop's.
    static let nameLimit = 40

    /// A profile of these settings under this name, or nil for a blank name.
    static func make(_ name: String, settings: ConnectionSettings, id: String = String(UUID().uuidString.lowercased().prefix(8))) -> ProviderProfile? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return ProviderProfile(id: id, name: String(trimmed.prefix(nameLimit)), settings: settings)
    }
}

extension ConnectionStore {
    static let profilesKey = "providerProfiles"

    /// The saved profiles, or none when they no longer read.
    func profiles() -> [ProviderProfile] {
        guard let data = defaults.data(forKey: Self.profilesKey),
              let saved = try? JSONDecoder().decode([ProviderProfile].self, from: data)
        else { return [] }
        return saved
    }

    func saveProfiles(_ profiles: [ProviderProfile]) {
        defaults.set(try? JSONEncoder().encode(profiles), forKey: Self.profilesKey)
    }
}
