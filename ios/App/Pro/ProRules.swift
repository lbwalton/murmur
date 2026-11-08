// SPDX-License-Identifier: GPL-3.0-only
// What murmur Pro is on iPhone (ios/prd.json IOS-025): a one-time Apple
// in-app purchase, never a license key (App Review 3.1.1). Pro comes from
// the App Store's own record of what you bought: the earliest purchase not
// refunded is when you became a supporter, and a purchase made with one of
// the founders' offer codes is a founding member's. Belts and cosmetics are
// never for sale; Pro unlocks conveniences only.
import Foundation

/// One purchase of murmur Pro, as the App Store records it.
struct ProPurchase: Equatable, Sendable {
    let product: String
    let purchased: Date
    /// When it was refunded, or nil.
    let revoked: Date?
    /// The reference name of the offer code it was bought with, or nil.
    let code: String?
}

enum ProStatus: Equatable, Sendable {
    case free
    /// since is when the earliest purchase still in force was made.
    case pro(since: Date, founder: Bool)

    var isPro: Bool {
        if case .pro = self { true } else { false }
    }

    var isFounder: Bool {
        if case .pro(_, true) = self { true } else { false }
    }
}

enum ProRules {
    /// The offer code reference name LaBroi gives the founders' one-time
    /// codes in App Store Connect.
    static let foundersCode = "founders"

    /// Pro's product id: the app's bundle id with .pro, from Info.plist,
    /// so a self-built copy names its own product.
    static var productId: String {
        Bundle.main.object(forInfoDictionaryKey: "MurmurProProduct") as? String ?? "com.lbwalton.murmur.ios.pro"
    }

    /// Pro from the purchases: free with none in force, a founding member
    /// when any purchase in force used a founders code.
    static func status(_ purchases: [ProPurchase], product: String) -> ProStatus {
        let held = purchases.filter { $0.product == product && $0.revoked == nil }
        guard let first = held.map(\.purchased).min() else { return .free }
        let founder = held.contains { $0.code?.caseInsensitiveCompare(foundersCode) == .orderedSame }
        return .pro(since: first, founder: founder)
    }
}
