// SPDX-License-Identifier: GPL-3.0-only
// The shared drawer between the app and the keyboard (the app group
// group.com.lbwalton.murmur): settings the keyboard needs, the mailbox,
// and the levels file. History never goes here; the keyboard sees only
// the newest take (ios/prd.json conventions.privacy).
import Foundation

enum AppGroup {
    static let identifier = "group.com.lbwalton.murmur"

    /// The group's container, or nil when the entitlement is missing.
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
