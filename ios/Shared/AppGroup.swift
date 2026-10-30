// SPDX-License-Identifier: GPL-3.0-only
// The shared drawer between the app and the keyboard (the app group,
// group.com.lbwalton.murmur in murmur's own builds): settings the
// keyboard needs, the mailbox, and the levels file. History never goes
// here; the keyboard sees only the newest take (ios/prd.json
// conventions.privacy).
import Foundation

enum AppGroup {
    /// MURMUR_APP_GROUP from project.yml, which both targets' Info.plist
    /// carry as MurmurAppGroup; empty, so containerURL is nil, if missing.
    static let identifier = Bundle.main.object(forInfoDictionaryKey: "MurmurAppGroup") as? String ?? ""

    /// The group's container, or nil when the entitlement is missing.
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
