// SPDX-License-Identifier: GPL-3.0-only
// What murmur Pro's screen and store say (ios/prd.json IOS-025): plain,
// sentence case, the free app first.
import Foundation

enum ProCopy {
    static let title = "murmur Pro"
    static let adds = "What Pro adds"
    static let pitch = "A one-time purchase that supports murmur. Everything you use today stays free: dictation, cleanup, notes, the Journey, and every provider."
    static let profiles = "Provider profiles: save whole provider setups under names and switch in one tap."
    static let early = "Early access: new conveniences come to Pro first, then to everyone."
    static let markPerk = "The supporter mark, here and in Settings."
    static let unverified = "The App Store could not confirm this purchase. If you were charged, tap Restore purchases."
    static let asking = "Asking the App Store"
    static let earned = "Belts and cosmetics are earned by practice, never sold."
    static let unavailable = "murmur Pro is not for sale right now. Check your connection, then come back."
    static let redeem = "Redeem a code"
    static let restore = "Restore purchases"
    static let pending = "Your purchase is waiting for approval. Pro turns on once it is approved."
    static let buyFailed = "The purchase did not go through. Nothing was charged; try again."
    static let restoreFailed = "murmur could not reach the App Store. Check your connection and try again."
    static let nothingToRestore = "This Apple Account has no murmur Pro purchase to restore."
    /// One Pro covers both devices (LaBroi, 2026-10-19), asked for by email
    /// either way, since a license key can never unlock anything here.
    static let bothDevices = "Bought murmur Pro on your Mac or PC? Email support@murmurapp.app with your order id for a free code. Bought it here? Email the order id from Apple's receipt for your desktop key."
    static let active = "Pro is active"
    static let founding = "Founding member"
    static let thanks = "Thank you for supporting free software; belts stay earned, never bought."
    static let foundingPerk = "A permanent ten percent discount on every future paid product is yours, cloud included."
    static let supporter = "Supporter"
    /// The lines that say something went wrong, shown in red.
    static let problems: Set<String> = [buyFailed, restoreFailed, unverified]

    static func buy(_ price: String) -> String {
        "Get murmur Pro for \(price)"
    }

    static func since(_ date: Date) -> String {
        "Supporter since \(date.formatted(date: .abbreviated, time: .omitted))."
    }

    /// The mark beside murmur Pro in Settings, or nil while free.
    static func mark(_ status: ProStatus) -> String? {
        switch status {
        case .free: nil
        case .pro(_, let founder): founder ? founding : supporter
        }
    }
}
