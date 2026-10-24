// SPDX-License-Identifier: GPL-3.0-only
// The link the keyboard opens murmur with when no session is running
// (ios/prd.json IOS-009): <scheme>://take?id=<the keyboard's take id>. The
// scheme is MURMUR_BUNDLE_ID from project.yml, which both targets'
// Info.plist carry as MurmurURLScheme, so a self-built copy never opens
// ours.
import Foundation

enum TakeLink {
    static let scheme = Bundle.main.object(forInfoDictionaryKey: "MurmurURLScheme") as? String ?? ""

    static func url(for take: UUID, scheme: String = scheme) -> URL? {
        guard !scheme.isEmpty else { return nil }
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "take"
        parts.queryItems = [URLQueryItem(name: "id", value: take.uuidString)]
        return parts.url
    }

    /// The take a link asks for, or nil for any other link.
    static func take(in url: URL, scheme: String = scheme) -> UUID? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == scheme.lowercased(), parts.host == "take",
              let id = parts.queryItems?.first(where: { $0.name == "id" })?.value
        else { return nil }
        return UUID(uuidString: id)
    }
}
