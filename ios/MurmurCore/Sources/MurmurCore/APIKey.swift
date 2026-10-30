// SPDX-License-Identifier: GPL-3.0-only
// A provider key that cannot leak by accident (ios/prd.json IOS-005):
// printing it, interpolating it, or dumping it shows only the mask. The
// one place that reads `secret` is the request that sends it.
import Foundation

public struct APIKey: Sendable, Equatable {
    public let secret: String

    /// Trims the spaces and line breaks a paste brings along; nil when
    /// nothing is left.
    public init?(_ pasted: String) {
        let trimmed = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        secret = trimmed
    }

    /// The last four characters, and only for a key long enough that four
    /// give little away; desktop's maskKey hides keys of 8 or fewer whole.
    public var masked: String {
        secret.count > 8 ? "••••" + String(secret.suffix(4)) : "••••"
    }
}

extension APIKey: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    public var description: String { masked }
    public var debugDescription: String { "APIKey(\(masked))" }
    public var customMirror: Mirror { Mirror(self, children: ["masked": masked]) }
}
