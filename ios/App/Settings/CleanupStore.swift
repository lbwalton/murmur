// SPDX-License-Identifier: GPL-3.0-only
// Where the cleanup settings live between launches (ios/prd.json IOS-007):
// the app's own defaults, as the provider choices are, since only the app
// cleans up a take.
import Foundation
import MurmurCore

struct CleanupStore {
    static let defaultsKey = "cleanup"
    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The saved settings, or desktop's defaults when there are none or
    /// they no longer read.
    func load() -> CleanupSettings {
        guard let data = defaults.data(forKey: Self.defaultsKey),
              let saved = try? JSONDecoder().decode(CleanupSettings.self, from: data)
        else { return CleanupSettings() }
        return saved
    }

    func save(_ settings: CleanupSettings) {
        defaults.set(try? JSONEncoder().encode(settings), forKey: Self.defaultsKey)
    }
}
