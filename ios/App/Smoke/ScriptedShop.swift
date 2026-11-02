// SPDX-License-Identifier: GPL-3.0-only
// The App Store as the smoke plays it (ios/prd.json IOS-025): products and
// offer codes read from ios/murmur.storekit, the StoreKit configuration the
// app's tests run on, and purchases, refunds, and codes played out in
// memory. StoreKit's own test session runs only inside a test bundle, so
// the smoke drives murmur Pro through this stand-in made from the same file.
import Foundation
import Synchronization

final class ScriptedShop: ProShop {
    private let file: StoreKitFile
    private let state = Mutex<(bought: [ProPurchase], waiting: [AsyncStream<Void>.Continuation])>(([], []))

    init(_ file: StoreKitFile, bought: [ProPurchase] = []) {
        self.file = file
        state.withLock { $0.bought = bought }
    }

    var bought: [ProPurchase] { state.withLock { $0.bought } }

    func price(_ product: String) async -> String? {
        file.products.first { $0.productID == product }.map { "$" + $0.displayPrice }
    }

    func purchases(_ product: String) async -> [ProPurchase] {
        state.withLock { $0.bought.filter { $0.product == product && $0.revoked == nil } }
    }

    func buy(_ product: String) async -> ProBuy {
        buy(product, code: nil) ? .bought : .failed
    }

    /// A purchase, with the offer code it was redeemed with; false for a
    /// product or code the file does not have.
    @discardableResult
    func buy(_ product: String, code: String?) -> Bool {
        guard let item = file.products.first(where: { $0.productID == product }) else { return false }
        if let code, !(item.offerCodes ?? []).contains(where: { $0.referenceName == code }) { return false }
        state.withLock { $0.bought.append(ProPurchase(product: product, purchased: .now, revoked: nil, code: code)) }
        announce()
        return true
    }

    func restore() async -> ProRestore { .synced }

    /// Apple refunds every purchase of the product.
    func refund(_ product: String) {
        state.withLock { state in
            state.bought = state.bought.map { $0.product == product ? ProPurchase(product: $0.product, purchased: $0.purchased, revoked: .now, code: $0.code) : $0 }
        }
        announce()
    }

    func updates() -> AsyncStream<Void> {
        AsyncStream { continuation in state.withLock { $0.waiting.append(continuation) } }
    }

    private func announce() {
        for continuation in state.withLock({ $0.waiting }) { continuation.yield() }
    }
}
