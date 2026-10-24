// SPDX-License-Identifier: GPL-3.0-only
// murmur Pro's purchase on iPhone (ios/prd.json IOS-025), through StoreKit
// 2: the price, buying, Restore Purchases, and the App Store's updates
// (a purchase on another phone, a code redeemed in the App Store, a
// refund). Nothing in the free app ever waits on it: Pro starts free and
// becomes Pro only once the App Store says so.
import Foundation
import Observation
import StoreKit

/// How a purchase ended.
enum ProBuy: Equatable, Sendable {
    case bought, cancelled, pending, failed
    /// The App Store charged, but the purchase could not be verified.
    case unverified
}

/// How Restore purchases ended.
enum ProRestore: Equatable, Sendable {
    case synced, cancelled, failed
}

/// The App Store as Pro sees it, so the smoke can stand one in.
protocol ProShop: Sendable {
    /// The price to show, or nil when Pro cannot be bought right now.
    func price(_ product: String) async -> String?
    /// The purchases of the product the App Store knows on this phone.
    func purchases(_ product: String) async -> [ProPurchase]
    func buy(_ product: String) async -> ProBuy
    /// Restore Purchases: asks the App Store for this Apple Account's.
    func restore() async -> ProRestore
    /// Each change the App Store sends while murmur runs.
    func updates() -> AsyncStream<Void>
}

@Observable @MainActor final class ProStore {
    enum Busy: Equatable {
        case buying, restoring
    }

    private(set) var status: ProStatus = .free
    /// Nil until the App Store answers, or when Pro is not for sale now.
    private(set) var price: String?
    private(set) var busy: Busy?
    /// What the last buy or restore came to, for the screen to say.
    private(set) var message: String?
    /// The App Store has answered with the price, or that there is none.
    private(set) var answered = false

    @ObservationIgnored let product: String
    @ObservationIgnored private let shop: any ProShop
    @ObservationIgnored private var listening: Task<Void, Never>?
    /// Counts refreshes, and the newest whose answer was kept, so an
    /// older answer that lands late never overwrites a newer one.
    @ObservationIgnored private var refreshes = 0
    @ObservationIgnored private var applied = 0

    init(shop: any ProShop, product: String = ProRules.productId) {
        self.shop = shop
        self.product = product
    }

    /// Reads the price and what was bought, then follows the App Store's
    /// updates for as long as the store lives.
    func start() async {
        message = nil
        if listening == nil {
            let updates = shop.updates()
            listening = Task { [weak self] in
                for await _ in updates { await self?.refresh() }
            }
        }
        let price = await shop.price(product)
        // Leaving the screen cancels this ask; its answer changes nothing.
        guard !Task.isCancelled else { return }
        self.price = price
        answered = true
        await refresh()
    }

    func refresh() async {
        refreshes += 1
        let mine = refreshes
        let purchases = await shop.purchases(product)
        // Never an answer older than one already kept, nor one to a
        // cancelled ask, so a late or cut-short read never turns a buyer free.
        guard mine > applied, !Task.isCancelled else { return }
        applied = mine
        status = ProRules.status(purchases, product: product)
    }

    func buy() async {
        guard busy == nil else { return }
        busy = .buying
        message = nil
        defer { busy = nil }
        switch await shop.buy(product) {
        case .bought: await refresh()
        case .cancelled: break
        case .pending: message = ProCopy.pending
        case .failed: message = ProCopy.buyFailed
        case .unverified: message = ProCopy.unverified
        }
    }

    func restore() async {
        guard busy == nil else { return }
        busy = .restoring
        message = nil
        defer { busy = nil }
        let restored = await shop.restore()
        await refresh()
        switch restored {
        case .synced: if !status.isPro { message = ProCopy.nothingToRestore }
        // Cancelling the App Store's sign in is no error.
        case .cancelled: break
        case .failed: message = ProCopy.restoreFailed
        }
    }

    private static var shared: ProStore?

    /// The app's one Pro store, on the real App Store.
    static func live() -> ProStore {
        if let shared { return shared }
        let store = ProStore(shop: StoreKitShop())
        shared = store
        return store
    }
}

/// The real App Store, through StoreKit 2.
struct StoreKitShop: ProShop {
    func price(_ product: String) async -> String? {
        (try? await Product.products(for: [product]))?.first?.displayPrice
    }

    func purchases(_ product: String) async -> [ProPurchase] {
        var found: [ProPurchase] = []
        for await result in Transaction.currentEntitlements(for: product) {
            guard case .verified(let transaction) = result else { continue }
            found.append(Self.purchase(transaction))
        }
        return found
    }

    func buy(_ product: String) async -> ProBuy {
        guard let item = try? await Product.products(for: [product]).first else { return .failed }
        do {
            switch try await item.purchase() {
            case .success(.verified(let transaction)):
                await transaction.finish()
                return .bought
            case .success(.unverified):
                return .unverified
            case .userCancelled:
                return .cancelled
            case .pending:
                return .pending
            @unknown default:
                return .failed
            }
        } catch {
            return .failed
        }
    }

    func restore() async -> ProRestore {
        do {
            try await AppStore.sync()
            return .synced
        } catch StoreKitError.userCancelled {
            return .cancelled
        } catch {
            return .failed
        }
    }

    func updates() -> AsyncStream<Void> {
        AsyncStream { continuation in
            let task = Task.detached {
                for await result in Transaction.updates {
                    if case .verified(let transaction) = result { await transaction.finish() }
                    continuation.yield()
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    static func purchase(_ transaction: Transaction) -> ProPurchase {
        let code = transaction.offer.flatMap { $0.type == .code ? $0.id : nil }
        return ProPurchase(product: transaction.productID, purchased: transaction.purchaseDate, revoked: transaction.revocationDate, code: code)
    }
}
